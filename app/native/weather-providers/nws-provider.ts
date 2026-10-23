/**
 * NWS (National Weather Service) Provider for Faceclaw
 */
import { fetchWithUserAgent } from "../../util/http";
import type { CurrentLocation } from "../location";
import type {
  CurrentWeather,
  ForecastPeriod,
  ProviderFetchOptions,
  WeatherFetchResult,
  WeatherProvider,
  WeatherCondition,
} from "../weather-types";
import { normalizeTemperature, normalizeWindSpeed } from "../weather-units";
import { conditionFromNwsIcon, conditionFromText, isLocalDaytime } from "../weather-conditions";

const NWS_API_ROOT = "https://api.weather.gov";
const USER_AGENT = "Faceclaw/1.0 (https://github.com/jimrandomh/faceclaw)";
const NWS_HEADERS = {
  Accept: "application/geo+json, application/json",
  "User-Agent": USER_AGENT,
};
const FETCH_TIMEOUT_MS = 15000;
const MAX_FORECAST_PERIODS = 14;

type NwsMeasure = {
  value?: unknown;
  unitCode?: unknown;
};

type NwsPointResponse = {
  properties?: {
    forecast?: unknown;
    forecastHourly?: unknown;
    observationStations?: unknown;
    relativeLocation?: {
      properties?: { city?: unknown; state?: unknown };
    };
  };
};

type NwsForecastResponse = {
  properties?: {
    periods?: Array<{
      name?: unknown;
      startTime?: unknown;
      temperature?: unknown;
      temperatureUnit?: unknown;
      shortForecast?: unknown;
      detailedForecast?: unknown;
      probabilityOfPrecipitation?: { value?: unknown };
      windSpeed?: unknown;
      windDirection?: unknown;
      isDaytime?: unknown;
      icon?: unknown;
    }>;
  };
};

type NwsStationsResponse = {
  features?: Array<{ id?: unknown }>;
};

type NwsObservationResponse = {
  properties?: {
    timestamp?: unknown;
    textDescription?: unknown;
    icon?: unknown;
    temperature?: NwsMeasure;
    relativeHumidity?: NwsMeasure;
    windSpeed?: NwsMeasure;
    windDirection?: NwsMeasure;
  };
};

export class NwsWeatherProvider implements WeatherProvider {
  readonly id = "nws";
  readonly name = "National Weather Service (US Only)";
  readonly requiresApiKey = false;

  async fetchWeather(
    location: CurrentLocation,
    _options?: ProviderFetchOptions,
  ): Promise<WeatherFetchResult> {
    const latitude = location.latitude.toFixed(4);
    const longitude = location.longitude.toFixed(4);
    const point = await fetchNwsJson<NwsPointResponse>(`${NWS_API_ROOT}/points/${latitude},${longitude}`);
    const properties = point.properties;
    const forecastUrl = stringValue(properties?.forecast);
    const hourlyUrl = stringValue(properties?.forecastHourly);
    const stationsUrl = stringValue(properties?.observationStations);
    if (!forecastUrl) throw new Error("NWS did not provide a forecast for this location.");

    const [forecastResponse, hourlyResponse, observation] = await Promise.all([
      fetchNwsJson<NwsForecastResponse>(forecastUrl),
      hourlyUrl ? fetchNwsJson<NwsForecastResponse>(hourlyUrl).catch(() => null) : Promise.resolve(null),
      stationsUrl ? loadLatestObservation(stationsUrl).catch(() => null) : Promise.resolve(null),
    ]);

    const forecast = (forecastResponse.properties?.periods ?? [])
      .map(normalizeForecastPeriod)
      .filter((period): period is ForecastPeriod => period !== null)
      .slice(0, MAX_FORECAST_PERIODS);
    if (!forecast.length) throw new Error("NWS returned an empty forecast.");

    const hourly = (hourlyResponse?.properties?.periods ?? [])
      .map(normalizeForecastPeriod)
      .find((period): period is ForecastPeriod => period !== null);

    const current = observation ? normalizeObservation(observation, hourly) : currentFromHourly(hourly, forecast[0]!);

    return {
      locationName: pointLocationName(point, latitude, longitude),
      current,
      forecast,
    };
  }
}

async function loadLatestObservation(stationsUrl: string): Promise<NwsObservationResponse | null> {
  const stations = await fetchNwsJson<NwsStationsResponse>(stationsUrl);
  const stationUrl = stringValue(stations.features?.[0]?.id);
  if (!stationUrl) return null;
  return fetchNwsJson<NwsObservationResponse>(`${stationUrl}/observations/latest`);
}

async function fetchNwsJson<T>(url: string): Promise<T> {
  const request = fetchWithUserAgent(url, { headers: NWS_HEADERS });
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Weather request timed out.")), FETCH_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([request, timeout]);
    if (!response.ok) {
      if (response.status === 404 && url.includes("/points/")) {
        throw new Error("This location is outside National Weather Service coverage.");
      }
      throw new Error(`National Weather Service request failed (HTTP ${response.status}).`);
    }
    return (await response.json()) as T;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function normalizeForecastPeriod(period: unknown): ForecastPeriod | null {
  if (typeof period !== "object" || period === null) return null;
  const raw = period as Record<string, unknown>;
  const rawTemp = numericValue(raw.temperature);
  const unit = stringValue(raw.temperatureUnit);
  let tempF: number | null = rawTemp;
  if (rawTemp !== null && unit === "C") {
    tempF = (rawTemp * 9) / 5 + 32;
  }
  const temps = normalizeTemperature(tempF, "fahrenheit");
  const startTimeMs = Date.parse(stringValue(raw.startTime) ?? "");
  const shortForecast = stringValue(raw.shortForecast) ?? "Unknown";
  const icon = parseNwsIcon(raw.icon);

  return {
    name: stringValue(raw.name) ?? "Forecast",
    startTimeMs: Number.isFinite(startTimeMs) ? startTimeMs : Date.now(),
    temperatureF: temps.temperatureF,
    temperatureC: temps.temperatureC,
    shortForecast,
    detailedForecast: stringValue(raw.detailedForecast) ?? shortForecast,
    precipitationPercent: numericValue(raw.probabilityOfPrecipitation && (raw.probabilityOfPrecipitation as any).value),
    windSpeed: stringValue(raw.windSpeed) ?? "",
    windDirection: stringValue(raw.windDirection) ?? "",
    isDaytime: icon.isDaytime ?? Boolean(raw.isDaytime),
    condition: icon.condition ?? conditionFromText(shortForecast),
  };
}

function normalizeObservation(
  observation: NwsObservationResponse,
  hourlyFallback: ForecastPeriod | null | undefined,
): CurrentWeather {
  const properties = observation.properties;
  const tempF = measureToFahrenheit(properties?.temperature);
  const temps = normalizeTemperature(tempF, "fahrenheit");
  const windMph = measureToMph(properties?.windSpeed);
  const winds = normalizeWindSpeed(windMph, "mph");
  const textDescription = stringValue(properties?.textDescription);
  const icon = parseNwsIcon(properties?.icon);

  return {
    temperatureF: temps.temperatureF ?? hourlyFallback?.temperatureF ?? null,
    temperatureC: temps.temperatureC ?? hourlyFallback?.temperatureC ?? null,
    description: textDescription ?? hourlyFallback?.shortForecast ?? "Unknown",
    humidityPercent: numericValue(properties?.relativeHumidity?.value),
    windSpeedMph: winds.windSpeedMph ?? numericSpeed(hourlyFallback?.windSpeed),
    windSpeedKmh: winds.windSpeedKmh,
    windDirection: compassDegreesToLabel(numericValue(properties?.windDirection?.value)) || (hourlyFallback?.windDirection ?? ""),
    timestampMs: Date.parse(stringValue(properties?.timestamp) ?? "") || Date.now(),
    observed: true,
    condition: icon.condition ?? conditionFromText(textDescription ?? "") ?? hourlyFallback?.condition ?? null,
    isDaytime: icon.isDaytime ?? hourlyFallback?.isDaytime ?? isLocalDaytime(),
  };
}

function currentFromHourly(hourly: ForecastPeriod | null | undefined, firstPeriod: ForecastPeriod): CurrentWeather {
  const fallback = hourly ?? firstPeriod;
  const winds = normalizeWindSpeed(numericSpeed(fallback.windSpeed), "mph");
  return {
    temperatureF: fallback.temperatureF,
    temperatureC: fallback.temperatureC,
    description: fallback.shortForecast,
    humidityPercent: null,
    windSpeedMph: winds.windSpeedMph,
    windSpeedKmh: winds.windSpeedKmh,
    windDirection: fallback.windDirection,
    timestampMs: fallback.startTimeMs,
    observed: false,
    condition: fallback.condition,
    isDaytime: fallback.isDaytime,
  };
}

function pointLocationName(point: NwsPointResponse, latitude: string, longitude: string): string {
  const relative = point.properties?.relativeLocation?.properties;
  const city = stringValue(relative?.city);
  const state = stringValue(relative?.state);
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  return `${latitude}, ${longitude}`;
}

function measureToFahrenheit(measure?: NwsMeasure): number | null {
  const value = numericValue(measure?.value);
  if (value === null) return null;
  const unitCode = stringValue(measure?.unitCode) ?? "";
  if (unitCode.endsWith(":degC")) return (value * 9) / 5 + 32;
  return value;
}

function measureToMph(measure?: NwsMeasure): number | null {
  const value = numericValue(measure?.value);
  if (value === null) return null;
  const unitCode = stringValue(measure?.unitCode) ?? "";
  if (unitCode.endsWith(":m_s-1")) return value * 2.23694;
  if (unitCode.endsWith(":km_h-1")) return value * 0.621371;
  return value;
}

function compassDegreesToLabel(degrees: number | null): string {
  if (degrees === null) return "";
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(((degrees % 360) / 22.5)) % 16;
  return directions[index]!;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numericSpeed(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

/** Condition and day/night from an NWS icon URL; the code table is in weather-conditions.ts. */
function parseNwsIcon(value: unknown): { condition: WeatherCondition | null; isDaytime: boolean | null } {
  return conditionFromNwsIcon(value);
}
