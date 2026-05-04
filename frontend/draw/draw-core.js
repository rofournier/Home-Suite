/** Shared logical canvas + payload rendering for paint and viewer. */

export const DEFAULT_W = 800;
export const DEFAULT_H = 1200;

export function emptyPayload() {
  return { v: 1, w: DEFAULT_W, h: DEFAULT_H, strokes: [] };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ v?: number, w?: number, h?: number, strokes?: Array<{ color: string, width: number, points: number[][] }> }} payload
 * @param {boolean} [clear]
 */
export function renderPayloadToCanvas(ctx, payload, clear = true) {
  const w = payload.w ?? DEFAULT_W;
  const h = payload.h ?? DEFAULT_H;
  if (clear) {
    ctx.fillStyle = "#faf6ef";
    ctx.fillRect(0, 0, w, h);
  }
  for (const s of payload.strokes ?? []) {
    const pts = s.points;
    if (!pts || pts.length < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();
  }
}

/**
 * @param {string} color
 * @returns {string}
 */
export function normalizeColor(color) {
  const s = String(color).trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) {
    if (s.length === 4) {
      const r = s[1];
      const g = s[2];
      const b = s[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return s.toLowerCase();
  }
  return "#2d2a26";
}
