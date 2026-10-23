/**
 * Weather Units and Conversion Utilities
 */
import type { TemperatureUnit } from "./weather-types";

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

export function mphToKmh(mph: number): number {
  return mph * 1.60934;
}

export function kmhToMph(kmh: number): number {
  return kmh / 1.60934;
}

export function normalizeTemperature(
  temp: number | null | undefined,
  inputUnit: TemperatureUnit = "celsius",
): { temperatureC: number | null; temperatureF: number | null } {
  if (temp === null || temp === undefined || !Number.isFinite(temp)) {
    return { temperatureC: null, temperatureF: null };
  }
  if (inputUnit === "celsius") {
    return {
      temperatureC: Math.round(temp * 10) / 10,
      temperatureF: Math.round(cToF(temp) * 10) / 10,
    };
  }
  return {
    temperatureC: Math.round(fToC(temp) * 10) / 10,
    temperatureF: Math.round(temp * 10) / 10,
  };
}

export function normalizeWindSpeed(
  speed: number | null | undefined,
  inputUnit: "kmh" | "mph" | "ms" = "kmh",
): { windSpeedKmh: number | null; windSpeedMph: number | null } {
  if (speed === null || speed === undefined || !Number.isFinite(speed)) {
    return { windSpeedKmh: null, windSpeedMph: null };
  }
  let kmh = speed;
  if (inputUnit === "mph") {
    kmh = mphToKmh(speed);
  } else if (inputUnit === "ms") {
    kmh = speed * 3.6;
  }
  return {
    windSpeedKmh: Math.round(kmh * 10) / 10,
    windSpeedMph: Math.round(kmhToMph(kmh) * 10) / 10,
  };
}

export function formatTemperature(
  tempC: number | null | undefined,
  tempF: number | null | undefined,
  displayUnit: TemperatureUnit = "celsius",
): string {
  if (displayUnit === "celsius") {
    if (tempC !== null && tempC !== undefined && Number.isFinite(tempC)) {
      return `${Math.round(tempC)}°C`;
    }
    if (tempF !== null && tempF !== undefined && Number.isFinite(tempF)) {
      return `${Math.round(fToC(tempF))}°C`;
    }
  } else {
    if (tempF !== null && tempF !== undefined && Number.isFinite(tempF)) {
      return `${Math.round(tempF)}°F`;
    }
    if (tempC !== null && tempC !== undefined && Number.isFinite(tempC)) {
      return `${Math.round(cToF(tempC))}°F`;
    }
  }
  return "--°";
}

export function formatWindSpeed(
  speedKmh: number | null | undefined,
  speedMph: number | null | undefined,
  displayUnit: TemperatureUnit = "celsius",
): string {
  if (displayUnit === "celsius") {
    if (speedKmh !== null && speedKmh !== undefined && Number.isFinite(speedKmh)) {
      return `${Math.round(speedKmh)} km/h`;
    }
    if (speedMph !== null && speedMph !== undefined && Number.isFinite(speedMph)) {
      return `${Math.round(mphToKmh(speedMph))} km/h`;
    }
  } else {
    if (speedMph !== null && speedMph !== undefined && Number.isFinite(speedMph)) {
      return `${Math.round(speedMph)} mph`;
    }
    if (speedKmh !== null && speedKmh !== undefined && Number.isFinite(speedKmh)) {
      return `${Math.round(kmhToMph(speedKmh))} mph`;
    }
  }
  return "";
}
