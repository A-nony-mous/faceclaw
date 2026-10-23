import { hasLocationPermission } from "./location-permissions";
import { getCurrentLocation } from "./location";
import {
  type CurrentWeather,
  type ForecastPeriod,
  type TemperatureUnit,
  type WeatherState,
} from "./weather-types";
import {
  DEFAULT_WEATHER_PROVIDER_ID,
  getWeatherProvider,
} from "./weather-providers";
import {
  getStringSetting,
  onSettingsStoreChanged,
  setStringSetting,
} from "./settings-store";

export * from "./weather-types";
export * from "./weather-units";
export * from "./weather-providers";

/** Refresh period while the Weather app is open. */
const APP_REFRESH_MS = 30 * 60 * 1000;
/** Refresh period for the status-bar and system-card indicators. */
const BACKGROUND_REFRESH_MS = 60 * 60 * 1000;
/** Delay before retrying after a failed refresh (capped at the period). */
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;
/** Settings-store key holding the last successful refresh. */
const CACHE_KEY = "weather.cache";
const CACHE_VERSION = 1;

export const WEATHER_PROVIDER_KEY = "weather.provider";
export const WEATHER_UNIT_KEY = "weather.unit";

export function getWeatherUnitSetting(): TemperatureUnit {
  const raw = getStringSetting(WEATHER_UNIT_KEY, "celsius");
  return raw === "fahrenheit" ? "fahrenheit" : "celsius";
}

export function setWeatherUnitSetting(unit: TemperatureUnit): void {
  setStringSetting(WEATHER_UNIT_KEY, unit);
}

export function getWeatherProviderSetting(): string {
  return getStringSetting(WEATHER_PROVIDER_KEY, DEFAULT_WEATHER_PROVIDER_ID);
}

export function setWeatherProviderSetting(providerId: string): void {
  setStringSetting(WEATHER_PROVIDER_KEY, providerId);
}

const DEFAULT_STATE: WeatherState = {
  phase: "permission-required",
  status: "Location permission is required to get local weather.",
  locationName: "",
  current: null,
  forecast: [],
  lastUpdatedMs: null,
};

type WeatherCache = {
  version: number;
  locationName: string;
  current: CurrentWeather | null;
  forecast: ForecastPeriod[];
  lastUpdatedMs: number;
  providerId?: string;
  unit?: TemperatureUnit;
};

/**
 * Shared weather state, refreshed on a schedule while anything shows it:
 * every 30 minutes while the Weather app is open, and hourly while a weather
 * indicator (status bar or Glanceboard system card) is enabled and the
 * glasses session is up. The last successful refresh is persisted, so a
 * restart shows it at once and the schedule counts from its age.
 */
export class WeatherBridge {
  private readonly listeners = new Set<(state: WeatherState) => void>();
  private loadedState: WeatherState | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Promise<void> | null = null;
  /** Start of the latest refresh attempt, successful or not. */
  private lastAttemptMs: number | null = null;
  private appOpen = false;
  private sessionActive = false;
  private backgroundWanted = false;
  private settingsListenerCleanup: (() => void) | null = null;

  constructor() {
    this.settingsListenerCleanup = onSettingsStoreChanged((key) => {
      if (key === WEATHER_PROVIDER_KEY || key === WEATHER_UNIT_KEY) {
        // Refresh as soon as the provider or unit changes.
        void this.refreshNow();
      }
    });
  }

  onStateChange(listener: (state: WeatherState) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): WeatherState {
    return cloneState(this.state);
  }

  /** The Weather app opened (or asked to retry): refresh now, then every 30 minutes. */
  start(): void {
    this.appOpen = true;
    void this.refreshNow();
  }

  /** The Weather app closed; any indicator schedule continues. */
  stop(): void {
    this.appOpen = false;
    this.schedule();
  }

  /** Whether a glasses session is up; indicator refreshes only run during one. */
  setSessionActive(active: boolean): void {
    if (active === this.sessionActive) return;
    this.sessionActive = active;
    this.schedule();
  }

  /** Whether an indicator wants hourly refreshes (see app/apps/weather/weather-indicators.ts). */
  setBackgroundRefresh(enabled: boolean): void {
    if (enabled === this.backgroundWanted) return;
    this.backgroundWanted = enabled;
    this.schedule();
  }

  async refreshNow(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.clearRefreshTimer();
    this.lastAttemptMs = Date.now();
    if (!hasLocationPermission()) {
      this.state = cloneState(DEFAULT_STATE);
      this.emit();
      this.schedule();
      return;
    }

    this.refreshInFlight = this.refresh();
    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
      this.schedule();
    }
  }

  private get state(): WeatherState {
    if (!this.loadedState) this.loadedState = loadCachedState();
    return this.loadedState;
  }

  private set state(state: WeatherState) {
    this.loadedState = state;
  }

  private refreshIntervalMs(): number | null {
    if (this.appOpen) return APP_REFRESH_MS;
    if (this.sessionActive && this.backgroundWanted) return BACKGROUND_REFRESH_MS;
    return null;
  }

  /**
   * Arm the timer for the next refresh: one period after the last success,
   * but no sooner than the retry delay after a failed attempt.
   */
  private schedule(): void {
    this.clearRefreshTimer();
    // A running refresh reschedules when it settles.
    if (this.refreshInFlight) return;
    const intervalMs = this.refreshIntervalMs();
    if (intervalMs === null) return;
    const lastSuccessMs = this.state.lastUpdatedMs ?? -Infinity;
    const lastAttemptMs = this.lastAttemptMs ?? -Infinity;
    const dueMs = Math.max(lastSuccessMs + intervalMs, lastAttemptMs + Math.min(intervalMs, RETRY_AFTER_FAILURE_MS));
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshNow();
    }, Math.max(0, dueMs - Date.now()));
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async refresh(): Promise<void> {
    try {
      this.state = { ...this.state, phase: "locating", status: "Getting current location..." };
      this.emit();
      const location = await getCurrentLocation();

      const providerId = getWeatherProviderSetting();
      const provider = getWeatherProvider(providerId);
      const unit = getWeatherUnitSetting();

      this.state = {
        ...this.state,
        phase: "loading",
        status: `Fetching weather from ${provider.name}...`,
      };
      this.emit();

      const weather = await provider.fetchWeather(location, { unit });
      this.state = {
        phase: "ready",
        status: "Weather updated",
        locationName: weather.locationName,
        current: weather.current,
        forecast: weather.forecast,
        lastUpdatedMs: Date.now(),
        providerId: provider.id,
        unit,
      };
      saveCachedState(this.state);
      this.emit();
    } catch (error) {
      const message = friendlyWeatherError(error);
      console.warn(`weather refresh failed: ${message}`);
      this.state = {
        ...this.state,
        phase: "error",
        status: message,
      };
      this.emit();
    }
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

/** The persisted last refresh, or the default state when there is none (or no permission to refresh it). */
function loadCachedState(): WeatherState {
  try {
    if (!hasLocationPermission()) return cloneState(DEFAULT_STATE);
    const raw = getStringSetting(CACHE_KEY, "");
    if (!raw) return cloneState(DEFAULT_STATE);
    const cache = JSON.parse(raw) as Partial<WeatherCache> | null;
    if (
      !cache ||
      cache.version !== CACHE_VERSION ||
      typeof cache.lastUpdatedMs !== "number" ||
      !Array.isArray(cache.forecast)
    ) {
      return cloneState(DEFAULT_STATE);
    }
    return cloneState({
      phase: "ready",
      status: "Weather updated.",
      locationName: typeof cache.locationName === "string" ? cache.locationName : "",
      current: cache.current && typeof cache.current === "object" ? cache.current : null,
      forecast: cache.forecast,
      lastUpdatedMs: cache.lastUpdatedMs,
      providerId: typeof cache.providerId === "string" ? cache.providerId : undefined,
      unit: cache.unit,
    });
  } catch (error) {
    console.warn(`weather cache unreadable: ${error}`);
    return cloneState(DEFAULT_STATE);
  }
}

function saveCachedState(state: WeatherState): void {
  if (state.lastUpdatedMs === null) return;
  const cache: WeatherCache = {
    version: CACHE_VERSION,
    locationName: state.locationName,
    current: state.current,
    forecast: state.forecast,
    lastUpdatedMs: state.lastUpdatedMs,
    providerId: state.providerId,
    unit: state.unit,
  };
  try {
    setStringSetting(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn(`weather cache write failed: ${error}`);
  }
}
function friendlyWeatherError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("timed out")) return "Weather request timed out. Check your network and try again.";
  if (text.includes("outside National Weather Service coverage")) {
    return "This location is outside NWS coverage. Switch to Open-Meteo in the Weather settings.";
  }
  return text || "Failed to fetch weather data.";
}

function cloneState(state: WeatherState): WeatherState {
  return {
    ...state,
    current: state.current ? { ...state.current } : null,
    forecast: state.forecast.map((p) => ({ ...p })),
  };
}

export const weatherBridge = new WeatherBridge();

