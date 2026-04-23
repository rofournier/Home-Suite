import { notifyAlarm, showToast } from "./alarm.js";
import { requestNotifPermission } from "/shared/notifications.js";
import { EditorController } from "./editor.js";
import { flushQueue, apiRequest } from "./offline-queue.js";
import { SocketClient } from "./socket.js";

const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${wsProtocol}://${window.location.host}/notes/ws/sheet/main`;

let connectedCount = 1;
const presenceEl = document.getElementById("presence");
const presenceAvatars = document.getElementById("presence-avatars");
const offlineBanner = document.getElementById("offline-banner");

function setOfflineMode(offline) {
  document.body.classList.toggle("offline", offline);
  if (offlineBanner) offlineBanner.classList.toggle("hidden", !offline);
}

function renderPresence() {
  presenceEl.textContent = `${connectedCount}`;
  presenceAvatars.innerHTML = "";
  const shown = Math.min(connectedCount, 4);
  for (let i = 0; i < shown; i += 1) {
    const avatar = document.createElement("span");
    avatar.className = "presence-avatar";
    avatar.textContent = "👤";
    presenceAvatars.appendChild(avatar);
  }
}

const socket = new SocketClient(
  wsUrl,
  (event) => {
    if (event.type === "presence_snapshot") {
      connectedCount = Math.max(0, Number(event.payload.count || 0));
      renderPresence();
      return;
    }

    editor.onSocketEvent(event);
  },
  replayOfflineMutations,
);

const editor = new EditorController(socket);
await editor.bootstrap();
setOfflineMode(editor.isOffline);
socket.connect();
renderPresence();

const globalAlarmBtn = document.getElementById("global-alarm-btn");
globalAlarmBtn.addEventListener("click", async () => {
  const message = "Mise a jour urgente de la liste de courses";
  const response = await apiRequest("/notes/api/alarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (response.queued) {
    showToast("Alerte en file d'attente (hors ligne)");
    return;
  }

  if (!response.ok) {
    showToast("Alerte impossible a envoyer");
    return;
  }

  notifyAlarm(message);
});

async function replayOfflineMutations() {
  const result = await flushQueue();
  if (result.flushed > 0) {
    socket.send("resync_request");
    showToast(`${result.flushed} action(s) synchronisee(s)`);
  }
}

window.addEventListener("online", () => {
  setOfflineMode(false);
  replayOfflineMutations();
});

window.addEventListener("offline", () => setOfflineMode(true));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/notes/sw.js").catch(() => {});
}

// Request notification permission after first user interaction
document.addEventListener("pointerup", () => requestNotifPermission(), { once: true });
