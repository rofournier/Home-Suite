import { loadWeather, conditionEmoji, conditionLabel, windLabel } from "./weather.js";
import { applyBackground } from "./weather-bg.js";

const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

let _forecastData = [];
let _forecastMetric = "temp"; // "temp" | "precip"

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function init() {
  _bindSunToggle();
  _bindZones();
  _bindForecastControls();

  try {
    const weather = await loadWeather();
    _renderCurrent(weather.current);
    _forecastData = weather.daily;
    _renderForecast();
    applyBackground(weather.current.condition, weather.current.isDay);
    document.body.dataset.condition = weather.current.condition;
    document.body.dataset.isday = weather.current.isDay ? "1" : "0";
  } catch (err) {
    console.warn("Weather unavailable:", err.message);
    applyBackground("cloudy", true);
  }
}

// ─── Sun toggle ───────────────────────────────────────────────────────────────

function _bindSunToggle() {
  const btn   = document.getElementById("sun-btn");
  const panel = document.getElementById("weather-panel");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    const isOpen = !panel.hidden;

    if (isOpen) {
      // Animate out then hide
      panel.classList.remove("panel-enter");
      panel.classList.add("panel-exit");
      panel.addEventListener("animationend", () => {
        panel.hidden = true;
        panel.classList.remove("panel-exit");
      }, { once: true });
    } else {
      panel.hidden = false;
      panel.classList.remove("panel-exit");
      // Force reflow so animation triggers from scratch
      void panel.offsetWidth;
      panel.classList.add("panel-enter");
    }

    btn.setAttribute("aria-expanded", String(!isOpen));
  });
}

// ─── SVG zone navigation ──────────────────────────────────────────────────────

function _bindZones() {
  document.querySelectorAll(".zone").forEach((zone) => {
    const href = zone.dataset.href;
    if (!href) return;

    zone.addEventListener("click", () => { location.href = href; });

    // Keyboard: Enter or Space navigates
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        location.href = href;
      }
    });
  });
}

// ─── Current weather ──────────────────────────────────────────────────────────

function _renderCurrent(c) {
  _set("w-temp",  `${c.temp}°`);
  _set("w-feels", `Ressenti ${c.feels}°`);
  _set("w-icon",  conditionEmoji(c.condition));
  _set("w-desc",  conditionLabel(c.condition));

  const windStr = `${windLabel(c.windDir)} ${c.windSpeed} km/h`;
  const gustStr = c.windGusts > c.windSpeed + 8 ? ` · rafales ${c.windGusts}` : "";
  _set("w-wind", windStr + gustStr);
  _set("w-sun",  c.sunshine > 0 ? `☀ ${c.sunshine}h` : "");
}

// ─── Forecast strip ───────────────────────────────────────────────────────────

function _renderForecast() {
  const track = document.getElementById("forecast-track");
  if (!track || _forecastData.length === 0) return;

  track.innerHTML = _forecastData.map((day, i) => {
    const d    = new Date(day.date + "T12:00:00");
    const name = i === 0 ? "Auj." : DAY_NAMES[d.getDay()];
    const icon = conditionEmoji(day.condition);
    const val  = _forecastMetric === "temp"
      ? `<span class="fc-max">${day.tempMax}°</span><span class="fc-min">${day.tempMin}°</span>`
      : `<span class="fc-precip">${day.precipitation}<small>mm</small></span>`;

    return `<div class="fc-day${i === 0 ? " fc-today" : ""}">
      <div class="fc-name">${name}</div>
      <div class="fc-icon">${icon}</div>
      <div class="fc-val">${val}</div>
    </div>`;
  }).join("");
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function _bindForecastControls() {
  document.getElementById("metric-toggle")?.addEventListener("click", (e) => {
    _forecastMetric = _forecastMetric === "temp" ? "precip" : "temp";
    e.currentTarget.textContent = _forecastMetric === "temp" ? "🌡 Temp" : "💧 Pluie";
    _renderForecast();
  });

  const track = document.getElementById("forecast-track");
  document.getElementById("prev-day")?.addEventListener("click", () => {
    track?.scrollBy({ left: -90, behavior: "smooth" });
  });
  document.getElementById("next-day")?.addEventListener("click", () => {
    track?.scrollBy({ left: 90, behavior: "smooth" });
  });
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ─── SW registration ──────────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

init();
