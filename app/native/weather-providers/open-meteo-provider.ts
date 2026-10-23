/**
 * Open-Meteo provider: worldwide weather by latitude and longitude, with no
 * account or API key. https://open-meteo.com/en/docs
 */
import { fetchWithUserAgent } from "../../util/http";
import type { CurrentLocation } from "../location";
import type {
  CurrentWeather,
  ForecastPeriod,
  ProviderFetchOptions,
  WeatherFetchResult,
  WeatherProvider,
} from "../weather-types";
import { formatTemperature, normalizeTemperature, normalizeWindSpeed } from "../weather-units";
import { conditionFromWmoCode, isLocalDaytime } from "../weather-conditions";

const API_ROOT = "https://api.open-meteo.com/v1/forecast";
const FETCH_TIMEOUT_MS = 15000;
/** Days of daily forecast to ask for; the app shows a handful. */
const FORECAST_DAYS = 5;

/** WMO 4677 weather codes, as Open-Meteo reports them. */
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Light rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Light snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with light hail",
  99: "Thunderstorm with heavy hail",
};

type OpenMeteoCurrent = {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  weather_code?: number;
  is_day?: number;
  wind_speed_10m?: number;
  wind_direction_10m?: number;
};

type OpenMeteoDaily = {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
};

type OpenMeteoResponse = {
  current?: OpenMeteoCurrent;
  daily?: OpenMeteoDaily;
};

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function wmoCodeToDescription(code: number | undefined): string {
  return (code !== undefined ? WMO_DESCRIPTIONS[code] : undefined) ?? "Unknown conditions";
}

export function degreesToCompass(degrees: number | undefined): string {
  if (degrees === undefined || !Number.isFinite(degrees)) return "";
  return COMPASS_POINTS[Math.round(((degrees % 360) / 45)) % 8]!;
}

/** The date an ISO "YYYY-MM-DD" names, read in the same calendar it was written in. */
function parseIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly id = "open-meteo";
  readonly name = "Open-Meteo";
  readonly requiresApiKey = false;

  async fetchWeather(
    location: CurrentLocation,
    options?: ProviderFetchOptions,
  ): Promise<WeatherFetchResult> {
    // Metric units are asked for explicitly so the parsing never has to guess
    // what the server decided to send.
    const url =
      `${API_ROOT}?latitude=${location.latitude.toFixed(4)}&longitude=${location.longitude.toFixed(4)}` +
      "&current=temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      `&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto&forecast_days=${FORECAST_DAYS}`;

    const json = await fetchOpenMeteoJson(url);

    const currentData = json.current ?? {};
    const temperatures = normalizeTemperature(currentData.temperature_2m, "celsius");
    const wind = normalizeWindSpeed(currentData.wind_speed_10m, "kmh");
    const windDirection = degreesToCompass(currentData.wind_direction_10m);

    const current: CurrentWeather = {
      temperatureC: temperatures.temperatureC,
      temperatureF: temperatures.temperatureF,
      description: wmoCodeToDescription(currentData.weather_code),
      humidityPercent: currentData.relative_humidity_2m ?? null,
      windSpeedKmh: wind.windSpeedKmh,
      windSpeedMph: wind.windSpeedMph,
      windDirection,
      timestampMs: Date.now(),
      observed: true,
      condition: conditionFromWmoCode(currentData.weather_code),
      isDaytime: currentData.is_day === undefined ? isLocalDaytime() : currentData.is_day === 1,
    };

    return {
      locationName: coordinateName(location),
      current,
      forecast: dailyForecast(json.daily ?? {}, options?.unit ?? "celsius", windDirection),
    };
  }
}

async function fetchOpenMeteoJson(url: string): Promise<OpenMeteoResponse> {
  const request = fetchWithUserAgent(url, { headers: { Accept: "application/json" } });
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Weather request timed out.")), FETCH_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([request, timeout]);
    if (!response.ok) throw new Error(`Open-Meteo request failed (HTTP ${response.status}).`);
    return (await response.json()) as OpenMeteoResponse;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function dailyForecast(
  daily: OpenMeteoDaily,
  unit: ProviderFetchOptions["unit"],
  windDirection: string,
): ForecastPeriod[] {
  const dates = daily.time ?? [];
  const periods: ForecastPeriod[] = [];
  for (let i = 0; i < Math.min(dates.length, FORECAST_DAYS); i++) {
    const date = parseIsoDate(dates[i]!);
    if (!date) continue;
    const code = daily.weather_code?.[i];
    const highC = daily.temperature_2m_max?.[i];
    const lowC = daily.temperature_2m_min?.[i];
    // The row shows one temperature per day: its average.
    const meanC = highC !== undefined && lowC !== undefined ? (highC + lowC) / 2 : highC ?? lowC;
    const temperatures = normalizeTemperature(meanC, "celsius");
    const description = wmoCodeToDescription(code);
    const high = formatTemperature(highC ?? null, null, unit);
    const low = formatTemperature(lowC ?? null, null, unit);
    periods.push({
      name: i === 0 ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" }),
      startTimeMs: date.getTime(),
      temperatureC: temperatures.temperatureC,
      temperatureF: temperatures.temperatureF,
      shortForecast: description,
      detailedForecast: `${description}. High ${high}, low ${low}.`,
      precipitationPercent: daily.precipitation_probability_max?.[i] ?? null,
      windSpeed: "",
      windDirection,
      // A daily period spans the whole day rather than a day or night half.
      isDaytime: true,
      condition: conditionFromWmoCode(code),
    });
  }
  return periods;
}

/**
 * Open-Meteo has no reverse geocoding, so the location reads as the
 * coordinates that were sent, which is also all it knows of the place.
 */
function coordinateName(location: CurrentLocation): string {
  const latitude = `${Math.abs(location.latitude).toFixed(2)}°${location.latitude >= 0 ? "N" : "S"}`;
  const longitude = `${Math.abs(location.longitude).toFixed(2)}°${location.longitude >= 0 ? "E" : "W"}`;
  return `${latitude}, ${longitude}`;
}
