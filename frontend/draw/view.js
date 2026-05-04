import { renderPayloadToCanvas, DEFAULT_W, DEFAULT_H } from "./draw-core.js";

const API = "/draw/api/drawings";

/** @type {Array<{ id: string, title: string | null, payload: object, updated_at: string }>} */
let list = [];
let index = 0;

const titleEl = document.getElementById("v-title");
const subEl = document.getElementById("v-sub");
const emptyEl = document.getElementById("view-empty");
const viewShell = document.getElementById("view-shell");
const canvas = document.getElementById("view-canvas");
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
const prevBtn = document.getElementById("nav-prev");
const nextBtn = document.getElementById("nav-next");

function setupHiDpi() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = DEFAULT_W;
  const h = DEFAULT_H;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function replaceUrl(id) {
  if (!id) return;
  const u = new URL(window.location.href);
  u.searchParams.set("id", id);
  window.history.replaceState({}, "", u.toString());
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function renderCurrent() {
  if (!titleEl || !subEl || !emptyEl || !viewShell) return;

  if (list.length === 0) {
    emptyEl.hidden = false;
    viewShell.hidden = true;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  emptyEl.hidden = true;
  viewShell.hidden = false;

  if (index < 0) index = 0;
  if (index >= list.length) index = list.length - 1;

  const d = list[index];
  const name = (d.title && String(d.title).trim()) || "Sans titre";
  titleEl.textContent = name;
  subEl.textContent = `${formatDate(d.updated_at)} · ${index + 1} / ${list.length}`;

  setupHiDpi();
  renderPayloadToCanvas(ctx, d.payload, true);

  if (prevBtn) prevBtn.disabled = list.length <= 1;
  if (nextBtn) nextBtn.disabled = list.length <= 1;
}

const EMPTY_MSG =
  "Aucun tableau enregistré. Créez-en un depuis l’atelier.";
const ERR_MSG = "Impossible de charger les tableaux.";

async function loadList() {
  if (emptyEl) {
    emptyEl.textContent = "Chargement…";
    emptyEl.hidden = false;
  }
  if (viewShell) viewShell.hidden = true;

  const res = await fetch(API);
  if (!res.ok) {
    list = [];
    if (emptyEl) emptyEl.textContent = ERR_MSG;
    renderCurrent();
    return;
  }
  const data = await res.json();
  list = data.drawings || [];

  const params = new URLSearchParams(window.location.search);
  const wantId = params.get("id");
  if (wantId && list.some((x) => x.id === wantId)) {
    index = list.findIndex((x) => x.id === wantId);
  } else {
    index = 0;
  }
  if (list.length === 0 && emptyEl) {
    emptyEl.textContent = EMPTY_MSG;
  }
  renderCurrent();
  if (list[index]) replaceUrl(list[index].id);
}

function go(delta) {
  if (list.length === 0) return;
  index = (index + delta + list.length) % list.length;
  renderCurrent();
  if (list[index]) replaceUrl(list[index].id);
}

prevBtn?.addEventListener("click", () => go(-1));
nextBtn?.addEventListener("click", () => go(1));

window.addEventListener("resize", () => {
  if (list.length > 0) {
    setupHiDpi();
    const d = list[index];
    if (d) renderPayloadToCanvas(ctx, d.payload, true);
  }
});

void loadList();
