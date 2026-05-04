/**
 * Home Suite — Shared Notification System
 * Toast, Web Audio, Vibration, Web Notifications API
 * ES module — import from both apps
 */

// ── Internal state ────────────────────────────────────────────────────────────

const _s = {
  audioCtx: null,
  toastEl: null,
  toastTimer: null,
  cssInjected: false,
  confirmCssInjected: false,
};

// ── Toast ─────────────────────────────────────────────────────────────────────

function _injectCSS() {
  if (_s.cssInjected) return;
  _s.cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    #hs-toast {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%) translateY(6px);
      z-index: 999999;
      padding: 0.55rem 1rem;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      max-width: calc(100vw - 2rem);
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.16s ease, transform 0.16s ease;
      background: rgba(15, 15, 25, 0.92);
      color: #f0f2ff;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #hs-toast.hs-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;
  document.head.appendChild(style);
}

function _getToastEl() {
  if (_s.toastEl && document.body.contains(_s.toastEl)) return _s.toastEl;
  _injectCSS();
  const el = document.createElement("div");
  el.id = "hs-toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  _s.toastEl = el;
  return el;
}

/**
 * Show an in-app toast message.
 * @param {string} message
 * @param {number} [durationMs=2200]
 */
export function showToast(message, durationMs = 2200) {
  const el = _getToastEl();
  el.textContent = message;
  el.classList.add("hs-visible");
  clearTimeout(_s.toastTimer);
  _s.toastTimer = setTimeout(() => el.classList.remove("hs-visible"), durationMs);
}

// ── Confirm dialog (native dialog element, mobile-friendly) ─────────────────

function _injectConfirmCSS() {
  if (_s.confirmCssInjected) return;
  _s.confirmCssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    dialog.hs-confirm {
      margin: auto;
      padding: 0;
      border: none;
      border-radius: 16px;
      max-width: min(100vw - 1.5rem, 360px);
      width: 100%;
      background: #fdfaf5;
      color: #2d2a26;
      box-shadow: 0 16px 48px rgba(45, 42, 38, 0.22);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }
    dialog.hs-confirm::backdrop {
      background: rgba(45, 42, 38, 0.4);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
    }
    .hs-confirm-box {
      padding: 1.1rem 1.15rem 1rem;
    }
    .hs-confirm-msg {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.45;
    }
    .hs-confirm-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-top: 1.1rem;
      flex-wrap: wrap;
    }
    .hs-confirm-actions button {
      min-height: 44px;
      min-width: 5rem;
      padding: 0.45rem 1rem;
      border-radius: 999px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid rgba(45, 42, 38, 0.14);
      background: rgba(255, 255, 255, 0.85);
      color: #2d2a26;
      -webkit-tap-highlight-color: transparent;
    }
    .hs-confirm-actions button.hs-confirm-primary {
      border-color: rgba(0, 0, 0, 0.08);
      background: linear-gradient(145deg, #c45c3e, #a84a32);
      color: #fff;
    }
    .hs-confirm-actions button:active {
      transform: scale(0.97);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Affiche une boîte de confirmation (remplace window.confirm sur mobile / PWA).
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string }} [options]
 * @returns {Promise<boolean>} true = confirmer
 */
export function showConfirm(message, options = {}) {
  const confirmLabel = options.confirmLabel ?? "OK";
  const cancelLabel = options.cancelLabel ?? "Annuler";
  return new Promise((resolve) => {
    _injectConfirmCSS();
    const dialog = document.createElement("dialog");
    dialog.className = "hs-confirm";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `
      <div class="hs-confirm-box">
        <p class="hs-confirm-msg"></p>
        <div class="hs-confirm-actions">
          <button type="button" class="hs-confirm-cancel"></button>
          <button type="button" class="hs-confirm-primary hs-confirm-ok"></button>
        </div>
      </div>
    `;
    const msgEl = dialog.querySelector(".hs-confirm-msg");
    if (msgEl) msgEl.textContent = message;
    const cancelBtn = dialog.querySelector(".hs-confirm-cancel");
    const okBtn = dialog.querySelector(".hs-confirm-ok");
    if (cancelBtn) cancelBtn.textContent = cancelLabel;
    if (okBtn) okBtn.textContent = confirmLabel;

    const finish = (v) => {
      dialog.removeEventListener("cancel", onCancel);
      try {
        dialog.close();
      } catch {
        /* ignore */
      }
      dialog.remove();
      resolve(v);
    };

    function onCancel(e) {
      e.preventDefault();
      finish(false);
    }

    cancelBtn?.addEventListener("click", () => finish(false));
    okBtn?.addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) finish(false);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    okBtn?.focus();
  });
}

// ── Audio ─────────────────────────────────────────────────────────────────────

function _ensureAudio() {
  if (!_s.audioCtx) {
    _s.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_s.audioCtx.state === "suspended") _s.audioCtx.resume();
  return _s.audioCtx;
}

/** Short ping — for new task / new event. */
export function playPing() {
  try {
    const ctx = _ensureAudio();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.linearRampToValueAtTime(700, now + 0.15);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (_) {}
}

/** Melodic alarm — for urgent notifications. */
export function playAlarm() {
  try {
    const ctx = _ensureAudio();
    const notes = [440, 493.88, 523.25, 587.33, 493.88, 392.0, 440.0];
    const durations = [0.12, 0.08, 0.13, 0.09, 0.12, 0.08, 0.18];
    let cursor = ctx.currentTime + 0.01;
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = notes[i];
      gain.gain.setValueAtTime(0.001, cursor);
      gain.gain.exponentialRampToValueAtTime(0.05, cursor + 0.016);
      gain.gain.exponentialRampToValueAtTime(0.001, cursor + durations[i]);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(cursor);
      osc.stop(cursor + durations[i] + 0.015);
      cursor += durations[i] + (i % 2 === 0 ? 0.03 : 0.02);
    }
  } catch (_) {}
}

// ── Vibration ─────────────────────────────────────────────────────────────────

/**
 * Trigger haptic feedback if supported.
 * @param {number | number[]} pattern
 */
export function vibrate(pattern = [80]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) {}
}

// ── Web Notifications ─────────────────────────────────────────────────────────

/**
 * Request notification permission (must be called from a user gesture).
 * @returns {Promise<NotificationPermission | "unavailable">}
 */
export async function requestNotifPermission() {
  if (!("Notification" in window)) return "unavailable";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Show a system notification (via SW if available, else Notification API).
 * Falls back silently to nothing if permissions not granted.
 * @param {string} title
 * @param {string} [body]
 * @param {NotificationOptions} [opts]
 */
export async function pushNotif(title, body = "", opts = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const defaults = {
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    lang: "fr",
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, ...defaults, ...opts });
    } else {
      new Notification(title, { body, ...defaults, ...opts });
    }
  } catch (_) {}
}

// ── Combined helpers ──────────────────────────────────────────────────────────

/**
 * Full alarm: toast + vibrate + melody + system notification.
 * @param {string} message
 */
export async function triggerAlarm(message) {
  showToast(`🔔 ${message}`);
  vibrate([120, 40, 120]);
  playAlarm();
  await pushNotif("🔔 Alerte", message, { tag: "alarm", renotify: true });
}

/**
 * Subtle ping: toast + short sound (for new tasks / updates).
 * @param {string} message
 */
export function triggerPing(message) {
  showToast(message);
  playPing();
}
