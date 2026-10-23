/**
 * Weather abstraction types and Provider interface for Faceclaw
 */
import type { CurrentLocation } from "./location";

export type WeatherPhase = "permission-required" | "locating" | "loading" | "ready" | "error";

export type TemperatureUnit = "celsius" | "fahrenheit";

/** Sky and precipitation state, as coarse as the icons that show it. */
export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "wind"
  | "drizzle"
  | "showers"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "sleet";

export type CurrentWeather = {
  temperatureF: number | null;
  temperatureC: number | null;
  description: string;
  humidityPercent: number | null;
  windSpeedMph: number | null;
  windSpeedKmh: number | null;
  windDirection: string;
  timestampMs: number | null;
  observed: boolean;
  condition: WeatherCondition | null;
  isDaytime: boolean;
};

export type ForecastPeriod = {
  name: string;
  startTimeMs: number;
  temperatureF: number | null;
  temperatureC: number | null;
  shortForecast: string;
  detailedForecast: string;
  precipitationPercent: number | null;
  windSpeed: string;
  windDirection: string;
  isDaytime: boolean;
  condition: WeatherCondition | null;
};

export type WeatherState = {
  phase: WeatherPhase;
  status: string;
  locationName: string;
  current: CurrentWeather | null;
  forecast: ForecastPeriod[];
  lastUpdatedMs: number | null;
  providerId?: string;
  unit?: TemperatureUnit;
};

export type ProviderFetchOptions = {
  unit?: TemperatureUnit;
};

export type WeatherFetchResult = {
  locationName: string;
  current: CurrentWeather;
  forecast: ForecastPeriod[];
};

export interface WeatherProvider {
  readonly id: string;
  readonly name: string;
  readonly requiresApiKey: boolean;
  fetchWeather(location: CurrentLocation, options?: ProviderFetchOptions): Promise<WeatherFetchResult>;
}
