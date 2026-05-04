import {
  DEFAULT_W,
  DEFAULT_H,
  renderPayloadToCanvas,
  normalizeColor,
} from "./draw-core.js";
import { showToast, showConfirm } from "/shared/notifications.js";

const API = "/draw/api/drawings";

/** @type {string | null} */
let currentId = null;
/** @type {Array<{ color: string, width: number, points: number[][] }>} */
let strokes = [];
/** @type {{ color: string, width: number, points: number[][] } | null} */
let currentStroke = null;
let color = "#2d2a26";
let lineWidth = 4;
let dirty = false;

const canvas = document.getElementById("sheet");
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
const canvasFit = document.getElementById("canvas-fit");
const canvasInner = document.getElementById("canvas-inner");

function logicalSize() {
  return { w: DEFAULT_W, h: DEFAULT_H };
}

function setupHiDpi() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const { w, h } = logicalSize();
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getPayload() {
  return {
    v: 1,
    w: DEFAULT_W,
    h: DEFAULT_H,
    strokes: strokes.map((s) => ({
      color: s.color,
      width: s.width,
      points: s.points.map((p) => [Math.round(p[0]), Math.round(p[1])]),
    })),
  };
}

function redraw() {
  setupHiDpi();
  renderPayloadToCanvas(ctx, getPayload(), true);
}

function fitCanvasBox() {
  if (!canvasFit || !canvasInner) {
    redraw();
    return;
  }
  const r = canvasFit.getBoundingClientRect();
  const aw = DEFAULT_W;
  const ah = DEFAULT_H;
  const pad = 8;
  const maxW = Math.max(0, r.width - pad * 2);
  const maxH = Math.max(0, r.height - pad * 2);
  if (maxW < 4 || maxH < 4) {
    redraw();
    return;
  }
  const scale = Math.min(maxW / aw, maxH / ah, 520 / aw);
  const dw = aw * scale;
  const dh = ah * scale;
  canvasInner.style.width = `${dw}px`;
  canvasInner.style.height = `${dh}px`;
  redraw();
}

function clientToLogical(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const { w, h } = logicalSize();
  if (rect.width < 1 || rect.height < 1) return [0, 0];
  const x = ((clientX - rect.left) / rect.width) * w;
  const y = ((clientY - rect.top) / rect.height) * h;
  return [x, y];
}

function beginStroke(clientX, clientY) {
  const [x, y] = clientToLogical(clientX, clientY);
  currentStroke = {
    color: normalizeColor(color),
    width: lineWidth,
    points: [[Math.round(x), Math.round(y)]],
  };
  strokes.push(currentStroke);
  dirty = true;
  redraw();
}

function extendStroke(clientX, clientY) {
  if (!currentStroke) return;
  const [x, y] = clientToLogical(clientX, clientY);
  currentStroke.points.push([Math.round(x), Math.round(y)]);
  redraw();
}

function finishStroke() {
  currentStroke = null;
}

function onPointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  beginStroke(e.clientX, e.clientY);
}

function onPointerMove(e) {
  if (!currentStroke) return;
  e.preventDefault();
  extendStroke(e.clientX, e.clientY);
}

function onPointerUp(e) {
  if (currentStroke) finishStroke();
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onPointerCancel(e) {
  finishStroke();
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

async function saveDrawing() {
  const payload = getPayload();
  const titleEl = document.getElementById("title-input");
  const title = titleEl?.value.trim() || null;
  try {
    if (currentId) {
      const res = await fetch(`${API}/${currentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, payload }),
      });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      currentId = data.id;
    }
    dirty = false;
    showToast("Enregistré.");
  } catch (err) {
    console.error(err);
    showToast("Impossible d'enregistrer.", 3200);
  }
}

async function newCanvas() {
  if (dirty) {
    const ok = await showConfirm("Abandonner les modifications non enregistrées ?", {
      confirmLabel: "Abandonner",
      cancelLabel: "Continuer",
    });
    if (!ok) return;
  }
  currentId = null;
  strokes = [];
  currentStroke = null;
  dirty = false;
  const ti = document.getElementById("title-input");
  if (ti) ti.value = "";
  redraw();
}

function loadPayloadIntoEditor(payload) {
  strokes = (payload.strokes || []).map((s) => ({
    color: normalizeColor(s.color),
    width: Number(s.width) || 4,
    points: (s.points || []).map((p) => [Number(p[0]), Number(p[1])]),
  }));
  dirty = false;
  redraw();
}

async function loadDrawing(id) {
  const res = await fetch(`${API}/${id}`);
  if (!res.ok) return;
  const data = await res.json();
  currentId = data.id;
  const ti = document.getElementById("title-input");
  if (ti) ti.value = data.title || "";
  loadPayloadIntoEditor(data.payload);
}

async function deleteDrawing(id) {
  const ok = await showConfirm("Supprimer ce dessin ?", {
    confirmLabel: "Supprimer",
    cancelLabel: "Annuler",
  });
  if (!ok) return;
  const res = await fetch(`${API}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    showToast("Suppression impossible.", 2800);
    return;
  }
  if (currentId === id) {
    currentId = null;
    strokes = [];
    currentStroke = null;
    dirty = false;
    const ti = document.getElementById("title-input");
    if (ti) ti.value = "";
    redraw();
  }
  await renderLibraryList();
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

async function renderLibraryList() {
  const list = document.getElementById("lib-list");
  if (!list) return;
  let data;
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error("list failed");
    data = await res.json();
  } catch {
    list.innerHTML = '<p class="empty-hint">Impossible de charger la liste.</p>';
    return;
  }
  const items = data.drawings || [];
  if (items.length === 0) {
    list.innerHTML = '<p class="empty-hint">Aucun dessin enregistré.</p>';
    return;
  }
  list.innerHTML = items
    .map((d) => {
      const name = (d.title && String(d.title).trim()) || "Sans titre";
      const esc = (s) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/"/g, "&quot;");
      return `<div class="drawing-row" data-id="${esc(d.id)}">
        <div class="drawing-meta">
          <div class="name">${esc(name)}</div>
          <div class="date">${esc(formatDate(d.updated_at))}</div>
        </div>
        <button type="button" class="open-btn">Ouvrir</button>
        <button type="button" class="danger del-btn">Supprimer</button>
      </div>`;
    })
    .join("");

  list.querySelectorAll(".drawing-row").forEach((row) => {
    const id = row.getAttribute("data-id");
    if (!id) return;
    row.querySelector(".open-btn")?.addEventListener("click", async () => {
      await loadDrawing(id);
      document.getElementById("library")?.close();
    });
    row.querySelector(".del-btn")?.addEventListener("click", () => void deleteDrawing(id));
  });
}

function openLibrary() {
  const dlg = document.getElementById("library");
  if (!dlg) return;
  void renderLibraryList();
  dlg.showModal();
}

function applySwatchSelection(sw) {
  const c = sw.getAttribute("data-color");
  if (!c) return;
  color = normalizeColor(c);
  document.querySelectorAll(".swatch").forEach((b) => {
    b.setAttribute("aria-pressed", b === sw ? "true" : "false");
  });
}

function bindPalette() {
  document.querySelectorAll("#palette .swatch").forEach((sw) => {
    sw.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      applySwatchSelection(sw);
    });
    sw.addEventListener(
      "touchstart",
      () => {
        applySwatchSelection(sw);
      },
      { passive: true }
    );
  });
}

function bind() {
  document.getElementById("btn-save")?.addEventListener("click", () => void saveDrawing());
  document.getElementById("btn-new")?.addEventListener("click", () => void newCanvas());
  document.getElementById("btn-library")?.addEventListener("click", () => openLibrary());
  document.getElementById("lib-close")?.addEventListener("click", () => {
    document.getElementById("library")?.close();
  });
  document.getElementById("width-range")?.addEventListener("input", (e) => {
    const v = Number(/** @type {HTMLInputElement} */ (e.target).value);
    lineWidth = Math.max(1, Math.min(64, v));
  });

  if (window.PointerEvent) {
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerCancel, { passive: false });
    canvas.addEventListener("pointerleave", onPointerUp, { passive: false });
  } else {
    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      beginStroke(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      if (!currentStroke || e.touches.length < 1) return;
      e.preventDefault();
      const t = e.touches[0];
      extendStroke(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener("touchend", (e) => {
      if (!currentStroke) return;
      e.preventDefault();
      finishStroke();
    }, { passive: false });
    canvas.addEventListener("touchcancel", () => finishStroke(), { passive: false });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      beginStroke(e.clientX, e.clientY);
    });
    canvas.addEventListener("mousemove", (e) => {
      if (!currentStroke) return;
      e.preventDefault();
      extendStroke(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", () => finishStroke());
  }
  bindPalette();

  if (canvasFit && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => fitCanvasBox()).observe(canvasFit);
  }
  window.addEventListener("resize", () => fitCanvasBox());
  window.visualViewport?.addEventListener("resize", () => fitCanvasBox());
  window.visualViewport?.addEventListener("scroll", () => fitCanvasBox());
}

bind();
fitCanvasBox();

window.addEventListener("beforeunload", (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = "";
});
