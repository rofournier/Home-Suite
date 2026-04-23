import { showToast, triggerPing, requestNotifPermission } from "/shared/notifications.js";

const TASK_TYPES = [
  { id: "linge", emoji: "🧺", label: "Linge" },
  { id: "vaisselle", emoji: "🍽️", label: "Vaisselle" },
  { id: "litiere", emoji: "🐱", label: "Litière" },
  { id: "croquettes", emoji: "🐾", label: "Croquettes" },
  { id: "bazar", emoji: "📦", label: "Bazar" },
  { id: "chaussures", emoji: "👟", label: "Chaussures" },
  { id: "fourmis", emoji: "🐜", label: "Fourmis" },
  { id: "poubelle", emoji: "🗑️", label: "Poubelle" },
  { id: "aspirateur", emoji: "🌀", label: "Aspirateur" },
  { id: "ampoule", emoji: "💡", label: "Ampoule" },
];

const state = {
  tasks: [],
  transform: { x: 0, y: 0, scale: 1 },
  pan: { active: false, startX: 0, startY: 0, originX: 0, originY: 0, moved: false, startTime: 0 },
  pinch: { active: false, startDistance: 0 },
  drawer: { open: false, x: 0, y: 0, selectedType: "linge", urgency: 1 },
  backgroundMode: "space",
};

const viewport = document.getElementById("viewport");
const stage = document.getElementById("map-stage");
const planImage = document.getElementById("plan-image");
const markersLayer = document.getElementById("markers-layer");
const drawer = document.getElementById("event-drawer");
const doneDrawer = document.getElementById("done-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const typeGrid = document.getElementById("type-grid");
const addTaskBtn = document.getElementById("add-task-btn");
const cancelBtn = document.getElementById("cancel-btn");
const confirmDoneBtn = document.getElementById("confirm-done-btn");
const cancelDoneBtn = document.getElementById("cancel-done-btn");
const doneTaskLabel = document.getElementById("done-task-label");
const connectionPill = document.getElementById("connection-pill");
const connectionText = document.getElementById("connection-text");
const bgCanvas = document.getElementById("bg-canvas");
const bgSelect = document.getElementById("background-select");
const urgencyBtns = Array.from(document.querySelectorAll(".urgency-btn"));

let ws = null;
let animationId = null;
let bgParticles = [];
let bgClouds = [];
let bgBubbles = [];
let auroraTime = 0;
let minScale = 0.2;
let maxScale = 8;
let pendingDoneTaskId = null;
let bgWidth = 0;
let bgHeight = 0;
let suppressTapOpenUntil = 0;

const emojiById = Object.fromEntries(TASK_TYPES.map((item) => [item.id, item.emoji]));

function updateConnectionStatus(online) {
  connectionPill.classList.toggle("online", online);
  connectionPill.classList.toggle("offline", !online);
  connectionText.textContent = online ? "Connecté" : "Offline";
}

function connectWs() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://${window.location.host}/home-radar/ws`);
  ws.addEventListener("open", () => updateConnectionStatus(true));
  ws.addEventListener("close", () => {
    updateConnectionStatus(false);
    setTimeout(connectWs, 1200);
  });
  ws.addEventListener("error", () => updateConnectionStatus(false));
  ws.addEventListener("message", (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (_) {
      return;
    }
    if (data.type === "init" && Array.isArray(data.tasks)) {
      state.tasks = data.tasks;
      renderMarkers();
    } else if (data.type === "add" && data.task) {
      if (!state.tasks.some((task) => task.id === data.task.id)) {
        state.tasks.push(data.task);
        renderMarkers();
        triggerPing("Nouvelle tâche !");
      }
    } else if (data.type === "done" && data.id) {
      state.tasks = state.tasks.filter((task) => task.id !== data.id);
      renderMarkers();
    }
  });
}

function applyTransform() {
  stage.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;
}

function clampTransform() {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const iw = planImage.naturalWidth || 1;
  const ih = planImage.naturalHeight || 1;
  const scaledW = iw * state.transform.scale;
  const scaledH = ih * state.transform.scale;
  if (scaledW <= vw) {
    state.transform.x = (vw - scaledW) / 2;
  } else {
    const minX = vw - scaledW;
    state.transform.x = Math.min(0, Math.max(minX, state.transform.x));
  }
  if (scaledH <= vh) {
    state.transform.y = (vh - scaledH) / 2;
  } else {
    const minY = vh - scaledH;
    state.transform.y = Math.min(0, Math.max(minY, state.transform.y));
  }
}

function zoomAt(clientX, clientY, factor) {
  const oldScale = state.transform.scale;
  const nextScale = Math.min(maxScale, Math.max(minScale, oldScale * factor));
  if (nextScale === oldScale) return;
  const mapX = (clientX - state.transform.x) / oldScale;
  const mapY = (clientY - state.transform.y) / oldScale;
  state.transform.scale = nextScale;
  state.transform.x = clientX - mapX * nextScale;
  state.transform.y = clientY - mapY * nextScale;
  clampTransform();
  applyTransform();
}

function fitMapToViewport() {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const iw = planImage.naturalWidth || 1;
  const ih = planImage.naturalHeight || 1;
  const fitScale = Math.min(vw / iw, vh / ih);
  minScale = Math.max(0.15, fitScale * 0.5);
  maxScale = Math.max(fitScale * 10, 8);
  state.transform.scale = fitScale;
  state.transform.x = (vw - iw * fitScale) / 2;
  state.transform.y = (vh - ih * fitScale) / 2;
  clampTransform();
  applyTransform();
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function screenToNormalized(screenX, screenY) {
  const iw = planImage.naturalWidth || 1;
  const ih = planImage.naturalHeight || 1;
  return {
    x: Math.min(1, Math.max(0, (screenX - state.transform.x) / state.transform.scale / iw)),
    y: Math.min(1, Math.max(0, (screenY - state.transform.y) / state.transform.scale / ih)),
  };
}

function renderMarkers() {
  markersLayer.innerHTML = "";
  const iw = planImage.naturalWidth || 1;
  const ih = planImage.naturalHeight || 1;
  markersLayer.style.width = `${iw}px`;
  markersLayer.style.height = `${ih}px`;
  state.tasks.forEach((task) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `marker u${task.urgency}`;
    marker.style.left = `${task.x * iw}px`;
    marker.style.top = `${task.y * ih}px`;
    marker.textContent = emojiById[task.type] || "!";
    marker.addEventListener("pointerup", (event) => {
      event.stopPropagation();
      openDoneDrawer(task);
    });
    markersLayer.appendChild(marker);
  });
}

function openDrawer(coords) {
  state.drawer.open = true;
  state.drawer.x = coords.x;
  state.drawer.y = coords.y;
  drawer.classList.add("open");
  drawerBackdrop.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  state.drawer.open = false;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  if (doneDrawer.classList.contains("open")) return;
  drawerBackdrop.classList.add("hidden");
}

function openDoneDrawer(task) {
  pendingDoneTaskId = task.id;
  doneTaskLabel.textContent = `${emojiById[task.type] || ""} ${task.type} · urgence ${task.urgency}`;
  doneDrawer.classList.add("open");
  doneDrawer.setAttribute("aria-hidden", "false");
  drawerBackdrop.classList.remove("hidden");
}

function closeDoneDrawer() {
  pendingDoneTaskId = null;
  doneDrawer.classList.remove("open");
  doneDrawer.setAttribute("aria-hidden", "true");
  if (drawer.classList.contains("open")) return;
  drawerBackdrop.classList.add("hidden");
}

function confirmDoneTask() {
  if (!pendingDoneTaskId) return;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "done", id: pendingDoneTaskId }));
  } else {
    showToast("Connexion indisponible");
  }
  closeDoneDrawer();
}

function suppressTapToOpen(ms = 320) {
  suppressTapOpenUntil = performance.now() + ms;
}

function canOpenDrawerFromTap() {
  return performance.now() >= suppressTapOpenUntil;
}

function createTaskTypeButtons() {
  TASK_TYPES.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "type-btn";
    btn.dataset.type = item.id;
    btn.innerHTML = `<span>${item.emoji}</span><span>${item.label}</span>`;
    if (item.id === state.drawer.selectedType) btn.classList.add("active");
    btn.addEventListener("click", () => {
      state.drawer.selectedType = item.id;
      document.querySelectorAll(".type-btn").forEach((node) => {
        node.classList.toggle("active", node.dataset.type === item.id);
      });
    });
    typeGrid.appendChild(btn);
  });
}

function sendAddTask() {
  if (ws?.readyState !== WebSocket.OPEN) {
    showToast("Connexion indisponible");
    return;
  }
  const taskId =
    window.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const task = {
    id: taskId,
    type: state.drawer.selectedType,
    urgency: state.drawer.urgency,
    x: state.drawer.x,
    y: state.drawer.y,
    createdAt: new Date().toISOString(),
  };
  try {
    ws.send(JSON.stringify({ type: "add", task }));
    closeDrawer();
  } catch (_) {
    showToast("Echec envoi tâche");
  }
}

function isInteractiveTarget(target) {
  return Boolean(target.closest(".marker, .drawer, .top-ui, #hs-toast"));
}

function setupInteractions() {
  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.08 : 0.92);
    },
    { passive: false }
  );

  viewport.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (isInteractiveTarget(event.target)) return;
    state.pan.active = true;
    state.pan.moved = false;
    state.pan.startTime = performance.now();
    state.pan.startX = event.clientX;
    state.pan.startY = event.clientY;
    state.pan.originX = state.transform.x;
    state.pan.originY = state.transform.y;
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.pan.active) return;
    const dx = event.clientX - state.pan.startX;
    const dy = event.clientY - state.pan.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.pan.moved = true;
    state.transform.x = state.pan.originX + dx;
    state.transform.y = state.pan.originY + dy;
    clampTransform();
    applyTransform();
  });

  window.addEventListener("mouseup", (event) => {
    if (!state.pan.active) return;
    const elapsed = performance.now() - state.pan.startTime;
    const isTap = !state.pan.moved && elapsed < 250;
    state.pan.active = false;
    if (isTap && !state.drawer.open && !doneDrawer.classList.contains("open") && canOpenDrawerFromTap()) {
      openDrawer(screenToNormalized(event.clientX, event.clientY));
    }
  });

  viewport.addEventListener(
    "touchstart",
    (event) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.touches.length === 1) {
        const t = event.touches[0];
        state.pan.active = true;
        state.pan.moved = false;
        state.pan.startTime = performance.now();
        state.pan.startX = t.clientX;
        state.pan.startY = t.clientY;
        state.pan.originX = state.transform.x;
        state.pan.originY = state.transform.y;
      } else if (event.touches.length === 2) {
        state.pan.active = false;
        state.pinch.active = true;
        state.pinch.startDistance = getTouchDistance(event.touches);
        state.pinch.startScale = state.transform.scale;
      }
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchmove",
    (event) => {
      if (state.pinch.active && event.touches.length === 2) {
        event.preventDefault();
        const distance = getTouchDistance(event.touches);
        const ratio = distance / state.pinch.startDistance;
        const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        zoomAt(centerX, centerY, (state.pinch.startScale * ratio) / state.transform.scale);
      } else if (state.pan.active && event.touches.length === 1) {
        const t = event.touches[0];
        const dx = t.clientX - state.pan.startX;
        const dy = t.clientY - state.pan.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.pan.moved = true;
        state.transform.x = state.pan.originX + dx;
        state.transform.y = state.pan.originY + dy;
        clampTransform();
        applyTransform();
      }
    },
    { passive: false }
  );

  viewport.addEventListener("touchend", (event) => {
    if (state.pinch.active && event.touches.length < 2) state.pinch.active = false;
    if (state.pan.active && event.touches.length === 0) {
      const elapsed = performance.now() - state.pan.startTime;
      const isTap = !state.pan.moved && elapsed < 250;
      const touch = event.changedTouches[0];
      state.pan.active = false;
      if (
        isTap &&
        !state.drawer.open &&
        !doneDrawer.classList.contains("open") &&
        canOpenDrawerFromTap() &&
        touch
      ) {
        openDrawer(screenToNormalized(touch.clientX, touch.clientY));
      }
    }
  });
}

function initBackgroundObjects() {
  const width = bgWidth;
  const height = bgHeight;
  bgParticles = Array.from({ length: 180 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    z: Math.random() * 1 + 0.2,
  }));
  bgClouds = Array.from({ length: 8 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    w: 90 + Math.random() * 110,
    h: 28 + Math.random() * 22,
    speed: 0.15 + Math.random() * 0.35,
  }));
  bgBubbles = Array.from({ length: 55 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 2 + Math.random() * 6,
    speed: 0.3 + Math.random() * 1.2,
  }));
}

function drawBackground() {
  const ctx = bgCanvas.getContext("2d");
  const width = bgWidth;
  const height = bgHeight;
  if (!ctx) return;

  if (state.backgroundMode === "space") {
    ctx.fillStyle = "#03060d";
    ctx.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    bgParticles.forEach((p) => {
      const vx = (p.x - cx) * 0.012 * p.z;
      const vy = (p.y - cy) * 0.012 * p.z;
      p.x += vx;
      p.y += vy;
      if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
        p.x = cx + (Math.random() - 0.5) * 30;
        p.y = cy + (Math.random() - 0.5) * 30;
      }
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - vx * 8, p.y - vy * 8);
      ctx.stroke();
    });
  } else if (state.backgroundMode === "sky") {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#73c3ff");
    gradient.addColorStop(1, "#2f86e8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.76)";
    bgClouds.forEach((c) => {
      c.x += c.speed;
      if (c.x - c.w > width) {
        c.x = -c.w;
        c.y = Math.random() * height;
      }
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w * 0.45, c.h * 0.45, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - c.w * 0.2, c.y + 3, c.w * 0.32, c.h * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.2, c.y + 5, c.w * 0.35, c.h * 0.33, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (state.backgroundMode === "ocean") {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#0a3d74");
    gradient.addColorStop(1, "#011729");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(132,229,255,0.35)";
    bgBubbles.forEach((b) => {
      b.y -= b.speed;
      if (b.y < -10) {
        b.y = height + 5;
        b.x = Math.random() * width;
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    auroraTime += 0.02;
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, "#100427");
    skyGradient.addColorStop(0.45, "#1a0a3b");
    skyGradient.addColorStop(1, "#07031a");
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);
    const bandCount = 6;
    const bandColors = [
      "rgba(0,255,178,0.22)",
      "rgba(20,197,255,0.22)",
      "rgba(102,131,255,0.2)",
      "rgba(188,86,255,0.21)",
      "rgba(255,88,198,0.2)",
      "rgba(255,180,65,0.19)",
    ];
    for (let i = 0; i < bandCount; i += 1) {
      ctx.beginPath();
      for (let x = 0; x <= width; x += 12) {
        const y =
          height * (0.16 + i * 0.11) +
          Math.sin(x * 0.0055 + auroraTime * (1 + i * 0.06) + i * 0.9) * (24 + i * 3) +
          Math.sin(x * 0.017 + auroraTime * 0.8 + i) * (7 + i * 0.9);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 26 + i * 4;
      ctx.strokeStyle = bandColors[i];
      ctx.stroke();
    }
  }
  animationId = requestAnimationFrame(drawBackground);
}

function resizeCanvas() {
  const prevWidth = bgWidth || window.innerWidth;
  const prevHeight = bgHeight || window.innerHeight;
  const nextWidth = window.innerWidth;
  const nextHeight = window.innerHeight;
  bgWidth = nextWidth;
  bgHeight = nextHeight;

  const dpr = window.devicePixelRatio || 1;
  bgCanvas.width = Math.floor(nextWidth * dpr);
  bgCanvas.height = Math.floor(nextHeight * dpr);
  bgCanvas.style.width = `${nextWidth}px`;
  bgCanvas.style.height = `${nextHeight}px`;
  const ctx = bgCanvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  const canRescaleExisting = bgParticles.length && bgClouds.length && bgBubbles.length;
  if (!canRescaleExisting) {
    initBackgroundObjects();
    return;
  }

  const rx = nextWidth / prevWidth;
  const ry = nextHeight / prevHeight;
  bgParticles.forEach((p) => { p.x *= rx; p.y *= ry; });
  bgClouds.forEach((c) => { c.x *= rx; c.y *= ry; c.w *= rx; c.h *= ry; });
  bgBubbles.forEach((b) => { b.x *= rx; b.y *= ry; });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/home-radar/sw.js").catch(() => {});
    });
  }
}

function init() {
  createTaskTypeButtons();
  connectWs();
  setupInteractions();
  registerServiceWorker();

  // Request notification permission after first interaction
  document.addEventListener("pointerup", () => requestNotifPermission(), { once: true });

  addTaskBtn.addEventListener("click", sendAddTask);
  cancelBtn.addEventListener("pointerup", closeDrawer);
  confirmDoneBtn.addEventListener("pointerup", confirmDoneTask);
  cancelDoneBtn.addEventListener("pointerup", closeDoneDrawer);
  drawerBackdrop.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    suppressTapToOpen();
    closeDrawer();
    closeDoneDrawer();
  });
  urgencyBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.drawer.urgency = Number(btn.dataset.urgency);
      urgencyBtns.forEach((node) => node.classList.toggle("active", node === btn));
    });
  });
  bgSelect.addEventListener("change", () => {
    state.backgroundMode = bgSelect.value;
  });

  planImage.addEventListener("load", () => {
    fitMapToViewport();
    renderMarkers();
  });
  window.addEventListener("resize", () => {
    resizeCanvas();
    fitMapToViewport();
  });

  resizeCanvas();
  state.backgroundMode = bgSelect.value;
  if (animationId) cancelAnimationFrame(animationId);
  drawBackground();
  if (planImage.complete) {
    fitMapToViewport();
    renderMarkers();
  }
}

init();
