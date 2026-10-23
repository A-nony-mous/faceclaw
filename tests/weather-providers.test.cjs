const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

const FIXTURE = {
  current: {
    temperature_2m: 18.5,
    relative_humidity_2m: 65,
    weather_code: 1,
    is_day: 1,
    wind_speed_10m: 12.4,
    wind_direction_10m: 180,
  },
  daily: {
    time: ['2026-09-10', '2026-09-11', '2026-09-12'],
    weather_code: [1, 2, 61],
    temperature_2m_max: [22, 24.5, 20],
    temperature_2m_min: [14, 15, 13],
    precipitation_probability_max: [10, 20, 80],
  },
};

const LOCATION = { latitude: 37.7749, longitude: -122.4194 };

function loadOpenMeteo(respond) {
  const requests = [];
  const load = loader({ setTimeout, clearTimeout }, {
    '../../util/http': {
      fetchWithUserAgent: async (url) => {
        requests.push(url);
        return respond(url);
      },
    },
  });
  return { provider: new (load('app/native/weather-providers/open-meteo-provider.ts').OpenMeteoWeatherProvider)(), requests };
}

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test('Open-Meteo requests metric units for the given coordinates', async () => {
  const { provider, requests } = loadOpenMeteo(() => jsonResponse(FIXTURE));
  await provider.fetchWeather(LOCATION, { unit: 'celsius' });
  const url = new URL(requests[0]);
  assert.equal(url.host, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '37.7749');
  assert.equal(url.searchParams.get('longitude'), '-122.4194');
  assert.equal(url.searchParams.get('temperature_unit'), 'celsius');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
});

test('Open-Meteo turns the current observation into both temperature units', async () => {
  const { provider } = loadOpenMeteo(() => jsonResponse(FIXTURE));
  const { current, locationName } = await provider.fetchWeather(LOCATION);
  assert.equal(current.temperatureC, 18.5);
  assert.equal(current.temperatureF, 65.3);
  assert.equal(current.humidityPercent, 65);
  assert.equal(current.windSpeedKmh, 12.4);
  assert.equal(current.windDirection, 'S');
  assert.equal(current.condition, 'partly-cloudy');
  assert.equal(current.description, 'Mainly clear');
  assert.equal(current.isDaytime, true);
  assert.equal(current.observed, true);
  assert.equal(locationName, '37.77°N, 122.42°W');
});

test('Open-Meteo reports one forecast row per day, and the unit decides the text', async () => {
  const { provider } = loadOpenMeteo(() => jsonResponse(FIXTURE));
  const celsius = await provider.fetchWeather(LOCATION, { unit: 'celsius' });
  assert.deepEqual([...celsius.forecast.map((period) => period.name)], ['Today', 'Fri', 'Sat']);
  assert.equal(celsius.forecast[0].temperatureC, 18);
  assert.equal(celsius.forecast[0].shortForecast, 'Mainly clear');
  assert.equal(celsius.forecast[0].detailedForecast, 'Mainly clear. High 22°C, low 14°C.');
  assert.equal(celsius.forecast[2].precipitationPercent, 80);
  assert.equal(celsius.forecast[2].condition, 'rain');

  const fahrenheit = await provider.fetchWeather(LOCATION, { unit: 'fahrenheit' });
  assert.equal(fahrenheit.forecast[0].detailedForecast, 'Mainly clear. High 72°F, low 57°F.');
});

test('Open-Meteo surfaces an HTTP failure instead of an empty forecast', async () => {
  const { provider } = loadOpenMeteo(() => ({ ok: false, status: 503, json: async () => ({}) }));
  await assert.rejects(() => provider.fetchWeather(LOCATION), /Open-Meteo request failed \(HTTP 503\)/);
});

test('Unknown WMO codes fall back to a neutral description and condition', async () => {
  const { provider } = loadOpenMeteo(() => jsonResponse({
    current: { weather_code: 42, temperature_2m: 5 },
    daily: { time: ['2026-09-10'], weather_code: [42] },
  }));
  const { current, forecast } = await provider.fetchWeather(LOCATION);
  assert.equal(current.description, 'Unknown conditions');
  assert.equal(current.condition, null);
  assert.equal(forecast[0].shortForecast, 'Unknown conditions');
});

test('Unit converters round-trip temperatures and wind speeds', () => {
  const units = loader({ setTimeout, clearTimeout }, {})('app/native/weather-units.ts');
  assert.equal(Math.round(units.cToF(0)), 32);
  assert.equal(Math.round(units.fToC(212)), 100);
  assert.equal(units.normalizeTemperature(68, 'fahrenheit').temperatureC, 20);
  assert.equal(units.normalizeWindSpeed(10, 'ms').windSpeedKmh, 36);
  assert.equal(units.formatTemperature(18.5, 65.3, 'celsius'), '19°C');
  assert.equal(units.formatTemperature(18.5, 65.3, 'fahrenheit'), '65°F');
  assert.equal(units.formatTemperature(null, null, 'celsius'), '--°');
  assert.equal(units.formatWindSpeed(12.4, 7.7, 'celsius'), '12 km/h');
  assert.equal(units.formatWindSpeed(12.4, 7.7, 'fahrenheit'), '8 mph');
});

test('The provider registry defaults to Open-Meteo and falls back for unknown ids', () => {
  const load = loader({ setTimeout, clearTimeout }, {});
  const registry = load('app/native/weather-providers/index.ts');
  assert.equal(registry.DEFAULT_WEATHER_PROVIDER_ID, 'open-meteo');
  assert.equal(registry.getWeatherProvider().id, 'open-meteo');
  assert.equal(registry.getWeatherProvider('nws').id, 'nws');
  assert.equal(registry.getWeatherProvider('nope').id, 'open-meteo');
  assert.deepEqual([...registry.listWeatherProviders().map((provider) => provider.id)], ['open-meteo', 'nws']);
});
