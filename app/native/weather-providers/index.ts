/**
 * Weather provider registry.
 */
import type { WeatherProvider } from "../weather-types";
import { NwsWeatherProvider } from "./nws-provider";
import { OpenMeteoWeatherProvider } from "./open-meteo-provider";

export const WEATHER_PROVIDERS: Record<string, WeatherProvider> = {
  "open-meteo": new OpenMeteoWeatherProvider(),
  nws: new NwsWeatherProvider(),
};

/**
 * Open-Meteo covers the whole world without an account, so it is the default;
 * NWS stays available because it reports US conditions from local stations.
 */
export const DEFAULT_WEATHER_PROVIDER_ID = "open-meteo";

export function getWeatherProvider(id?: string): WeatherProvider {
  return (id !== undefined ? WEATHER_PROVIDERS[id] : undefined) ?? WEATHER_PROVIDERS[DEFAULT_WEATHER_PROVIDER_ID]!;
}

export function listWeatherProviders(): Array<{ id: string; name: string; requiresApiKey: boolean }> {
  return Object.values(WEATHER_PROVIDERS).map((provider) => ({
    id: provider.id,
    name: provider.name,
    requiresApiKey: provider.requiresApiKey,
  }));
}
