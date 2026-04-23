// Weather data — Open-Meteo (Toulouse), no API key required
// Cached in localStorage for 30 min to avoid hammering the API.

const LAT = 43.6043;
const LNG = 1.4437;
const CACHE_KEY = "home_weather_v1";
const CACHE_TTL = 30 * 60 * 1000;

export async function loadWeather() {
  const cached = _readCache();
  if (cached) return cached;
  const data = await _fetchFromAPI();
  _writeCache(data);
  return data;
}

// ─── Private ──────────────────────────────────────────────────────────────────

function _readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return Date.now() - ts < CACHE_TTL ? data : null;
  } catch { return null; }
}

function _writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

async function _fetchFromAPI() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  const p = url.searchParams;
  p.set("latitude", LAT);
  p.set("longitude", LNG);
  p.set("timezone", "Europe/Paris");
  p.set("forecast_days", "7");
  p.set("wind_speed_unit", "kmh");
  p.set("current", [
    "temperature_2m", "apparent_temperature", "is_day",
    "precipitation", "rain", "snowfall", "cloud_cover",
    "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
  ].join(","));
  p.set("daily", [
    "temperature_2m_max", "temperature_2m_min",
    "precipitation_sum", "weather_code", "sunshine_duration",
  ].join(","));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  return _parse(await res.json());
}

function _parse(raw) {
  const c = raw.current;
  const d = raw.daily;
  return {
    current: {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      isDay: c.is_day === 1,
      cloudCover: c.cloud_cover ?? 0,
      windSpeed: Math.round(c.wind_speed_10m),
      windDir: c.wind_direction_10m ?? 0,
      windGusts: Math.round(c.wind_gusts_10m ?? 0),
      precipitation: c.precipitation ?? 0,
      rain: c.rain ?? 0,
      snowfall: c.snowfall ?? 0,
      // today's sunshine hours come from daily[0]
      sunshine: Math.round((d.sunshine_duration?.[0] ?? 0) / 3600),
      condition: _deriveCondition(c),
    },
    daily: d.time.map((date, i) => ({
      date,
      tempMax: Math.round(d.temperature_2m_max[i]),
      tempMin: Math.round(d.temperature_2m_min[i]),
      precipitation: Math.round((d.precipitation_sum?.[i] ?? 0) * 10) / 10,
      weatherCode: d.weather_code[i],
      sunshine: Math.round((d.sunshine_duration?.[i] ?? 0) / 3600),
      condition: _codeCondition(d.weather_code[i]),
    })),
  };
}

function _deriveCondition(c) {
  if ((c.snowfall ?? 0) > 0) return "snow";
  if ((c.rain ?? 0) > 0.2 || (c.precipitation ?? 0) > 0.5) return "rain";
  if ((c.cloud_cover ?? 0) > 80) return "overcast";
  if ((c.cloud_cover ?? 0) > 25) return "cloudy";
  return c.is_day ? "sunny" : "night";
}

function _codeCondition(code) {
  if (code === 0) return "sunny";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "overcast";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain";
  if (code <= 86) return "snow";
  return "rain"; // thunderstorm → treat as heavy rain
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

export function conditionEmoji(condition) {
  return (
    { sunny: "☀️", cloudy: "⛅", overcast: "☁️", rain: "🌧️", snow: "❄️", night: "🌙" }[condition] ?? "🌡️"
  );
}

export function conditionLabel(condition) {
  return (
    {
      sunny: "Ensoleillé",
      cloudy: "Nuageux",
      overcast: "Couvert",
      rain: "Pluvieux",
      snow: "Neigeux",
      night: "Nuit claire",
    }[condition] ?? "—"
  );
}

/** Compass label from wind degrees (where wind is coming FROM). */
export function windLabel(deg) {
  return ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(deg / 45) % 8];
}
