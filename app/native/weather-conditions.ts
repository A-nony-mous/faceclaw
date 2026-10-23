/**
 * Condition and day/night helpers shared by the weather providers.
 */
import type { WeatherCondition } from "./weather-types";

/** WMO weather codes (Open-Meteo) by the condition they show. */
const WMO_CONDITIONS: Record<number, WeatherCondition> = {
  0: "clear",
  1: "partly-cloudy",
  2: "partly-cloudy",
  3: "cloudy",
  45: "fog",
  48: "fog",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  56: "sleet",
  57: "sleet",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "sleet",
  67: "sleet",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow",
  80: "showers",
  81: "showers",
  82: "showers",
  85: "snow",
  86: "snow",
  95: "thunderstorm",
  96: "thunderstorm",
  99: "thunderstorm",
};

// NWS icon codes (https://api.weather.gov/icons) by the condition they show.
const NWS_ICON_CONDITIONS: Record<string, WeatherCondition> = {
  skc: "clear",
  hot: "clear",
  cold: "clear",
  few: "partly-cloudy",
  sct: "partly-cloudy",
  bkn: "cloudy",
  ovc: "cloudy",
  wind_skc: "wind",
  wind_few: "wind",
  wind_sct: "wind",
  wind_bkn: "wind",
  wind_ovc: "wind",
  fog: "fog",
  haze: "fog",
  smoke: "fog",
  dust: "fog",
  rain: "rain",
  rain_showers: "rain",
  rain_showers_hi: "showers",
  tsra: "thunderstorm",
  tsra_sct: "thunderstorm",
  tsra_hi: "thunderstorm",
  tornado: "thunderstorm",
  hurricane: "thunderstorm",
  tropical_storm: "thunderstorm",
  snow: "snow",
  blizzard: "snow",
  sleet: "sleet",
  fzra: "sleet",
  rain_fzra: "sleet",
  snow_fzra: "sleet",
  rain_sleet: "sleet",
  snow_sleet: "sleet",
  rain_snow: "sleet",
};

/** The condition a WMO weather code shows, or null for an unknown code. */
export function conditionFromWmoCode(code: number | null | undefined): WeatherCondition | null {
  if (code === null || code === undefined) return null;
  return WMO_CONDITIONS[code] ?? null;
}

/**
 * Condition and day/night from an NWS icon URL such as
 * ".../icons/land/day/tsra_sct,40/rain,20?size=medium". A period that
 * changes partway lists two codes; the first is the one in effect now.
 */
export function conditionFromNwsIcon(value: unknown): {
  condition: WeatherCondition | null;
  isDaytime: boolean | null;
} {
  const text = typeof value === "string" ? value.trim() : "";
  const match = text.match(/\/icons\/[^/]+\/(day|night)\/([a-z_]+)/);
  if (!match) return { condition: null, isDaytime: null };
  return { condition: NWS_ICON_CONDITIONS[match[2]!] ?? null, isDaytime: match[1] === "day" };
}

/** Condition from a provider's text description ("Chance Rain Showers"). */
export function conditionFromText(text: string): WeatherCondition | null {
  const lower = text.toLowerCase();
  if (/thunder|t-storm|tstorm/.test(lower)) return "thunderstorm";
  if (/freezing|sleet|ice pellets|wintry|hail|rain and snow|snow and rain/.test(lower)) return "sleet";
  if (/snow|flurr|blizzard/.test(lower)) return "snow";
  if (/drizzle/.test(lower)) return "drizzle";
  if (/rain|showers/.test(lower)) return /chance|slight|scattered|isolated|patchy/.test(lower) ? "showers" : "rain";
  if (/fog|haze|smoke|dust|mist/.test(lower)) return "fog";
  if (/windy|breezy|blustery/.test(lower)) return "wind";
  if (/partly|few clouds|mostly sunny|mostly clear/.test(lower)) return "partly-cloudy";
  if (/cloud|overcast/.test(lower)) return "cloudy";
  if (/sunny|clear|fair/.test(lower)) return "clear";
  return null;
}

/** Rough day/night by the phone's clock, for providers that do not report it. */
export function isLocalDaytime(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}
