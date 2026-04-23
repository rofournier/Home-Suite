// Background visual system — sky gradient, sun/moon, clouds, rain/snow particles.
// All animations use CSS transforms/opacity or canvas for GPU performance.

const SKY_GRADIENTS = {
  sunny:   "linear-gradient(to bottom, #0d47a1 0%, #1976d2 30%, #42a5f5 65%, #bbdefb 100%)",
  cloudy:  "linear-gradient(to bottom, #37474f 0%, #546e7a 40%, #90a4ae 80%, #b0bec5 100%)",
  overcast:"linear-gradient(to bottom, #263238 0%, #37474f 55%, #546e7a 100%)",
  rain:    "linear-gradient(to bottom, #0d1b2a 0%, #1a2e42 45%, #243b52 100%)",
  snow:    "linear-gradient(to bottom, #546e7a 0%, #78909c 50%, #b0bec5 100%)",
  night:   "linear-gradient(to bottom, #030712 0%, #0d1332 50%, #1a2050 100%)",
};

// Cloud density configs per condition
const CLOUD_CONFIGS = {
  cloudy: [
    { w: 200, h: 75, top: 10, dur: 60, delay:   0, op: 0.7 },
    { w: 140, h: 55, top: 22, dur: 80, delay: -28, op: 0.55 },
    { w: 170, h: 65, top:  5, dur: 95, delay: -55, op: 0.65 },
  ],
  overcast: [
    { w: 280, h: 95, top:  1, dur: 40, delay:   0, op: 1 },
    { w: 340, h:110, top: -2, dur: 55, delay: -18, op: 1 },
    { w: 220, h: 80, top: 10, dur: 48, delay:  -8, op: 0.95 },
    { w: 300, h:100, top:  4, dur: 70, delay: -45, op: 0.9 },
  ],
  rain: [
    { w: 300, h:100, top: -2, dur: 35, delay:   0, op: 1 },
    { w: 380, h:120, top: -5, dur: 45, delay: -16, op: 1 },
    { w: 260, h: 90, top:  3, dur: 55, delay: -35, op: 0.95 },
  ],
};

let _stopParticles = null;

export function applyBackground(condition, isDay) {
  const sky        = document.getElementById("sky");
  const sunMoon    = document.getElementById("sun-moon");
  const cloudLayer = document.getElementById("cloud-layer");
  const canvas     = document.getElementById("particles");

  if (!sky) return;

  // Sky gradient
  sky.style.background = SKY_GRADIENTS[condition] ?? SKY_GRADIENTS.cloudy;

  // Sun / moon
  sunMoon.innerHTML = "";
  if (condition !== "rain" && condition !== "overcast" && condition !== "snow") {
    const el = document.createElement("div");
    el.className = !isDay || condition === "night" ? "moon" : "sun";
    sunMoon.appendChild(el);
  }

  // Clouds
  cloudLayer.innerHTML = "";
  const cloudConf = CLOUD_CONFIGS[condition];
  if (cloudConf) _buildClouds(cloudLayer, cloudConf, condition);

  // Particles
  if (_stopParticles) { _stopParticles(); _stopParticles = null; }
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  if (condition === "rain") _stopParticles = _startRain(canvas);
  if (condition === "snow") _stopParticles = _startSnow(canvas);
}

// Resize canvas on orientation change without restarting particles
window.addEventListener("resize", () => {
  const canvas = document.getElementById("particles");
  if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
});

// ─── Clouds ───────────────────────────────────────────────────────────────────

function _buildClouds(layer, configs, condition) {
  const isRainy = condition === "rain" || condition === "overcast";
  configs.forEach(({ w, h, top, dur, delay, op }) => {
    const c = document.createElement("div");
    c.className = "cloud";
    c.style.cssText =
      `width:${w}px;height:${h}px;top:${top}%;opacity:${op};` +
      `animation-duration:${dur}s;animation-delay:${delay}s;` +
      (isRainy ? "filter:blur(18px);background:rgba(90,100,110,0.85);" : "");
    layer.appendChild(c);
  });
}

// ─── Rain ─────────────────────────────────────────────────────────────────────

function _startRain(canvas) {
  const ctx = canvas.getContext("2d");
  const N = Math.min(200, Math.max(80, (navigator.hardwareConcurrency || 4) * 28));
  const drops = Array.from({ length: N }, () => ({
    x:     Math.random() * canvas.width,
    y:     Math.random() * canvas.height,
    len:   14 + Math.random() * 10,
    speed: 10 + Math.random() * 9,
    op:    0.2 + Math.random() * 0.45,
  }));

  let raf;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1;
    for (const d of drops) {
      ctx.globalAlpha = d.op;
      ctx.strokeStyle = "#a8cadf";
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 2, d.y + d.len);
      ctx.stroke();
      d.y += d.speed;
      d.x -= 1.8;
      if (d.y > canvas.height) { d.y = -d.len;  d.x = Math.random() * canvas.width; }
      if (d.x < -10)            { d.x = canvas.width + 10; }
    }
    raf = requestAnimationFrame(draw);
  }
  draw();
  return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height); };
}

// ─── Snow ─────────────────────────────────────────────────────────────────────

function _startSnow(canvas) {
  const ctx = canvas.getContext("2d");
  const N = Math.min(90, Math.max(30, (navigator.hardwareConcurrency || 4) * 12));
  const flakes = Array.from({ length: N }, () => ({
    x:     Math.random() * canvas.width,
    y:     Math.random() * canvas.height,
    r:     1.5 + Math.random() * 3,
    speed: 0.6 + Math.random() * 1.2,
    drift: (Math.random() - 0.5) * 0.4,
    phase: Math.random() * Math.PI * 2,
    op:    0.6 + Math.random() * 0.35,
  }));

  let raf;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const f of flakes) {
      ctx.globalAlpha = f.op;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      f.y += f.speed;
      f.x += f.drift + Math.sin(f.phase) * 0.4;
      f.phase += 0.018;
      if (f.y > canvas.height) { f.y = -f.r * 2; f.x = Math.random() * canvas.width; }
    }
    raf = requestAnimationFrame(draw);
  }
  draw();
  return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height); };
}
