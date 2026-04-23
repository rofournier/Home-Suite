import { notifyAlarm, showToast } from "./alarm.js";
import { apiRequest } from "./offline-queue.js";

export class EditorController {
  constructor(socketClient) {
    this.socket = socketClient;
    this.lines = [];
    this.linesRoot = document.getElementById("lines");
    this.seenEvents = new Set();
    this.pendingSyncTimers = new Map();
    this.localDrafts = new Map();
  }

  async bootstrap() {
    const response = await apiRequest("/notes/api/sheet");
    const data = await response.json();
    this.lines = data.lines;
    if (this.lines.length === 0) {
      await this.createLine(null, "", false);
      return;
    }
    this.render();
  }

  onSocketEvent(event) {
    if (!event || !event.type) {
      return;
    }

    if (event.event_id && this.seenEvents.has(event.event_id)) {
      return;
    }
    if (event.event_id) {
      this.seenEvents.add(event.event_id);
      if (this.seenEvents.size > 3000) {
        this.seenEvents.clear();
      }
    }

    if (event.type === "line_created") {
      this.upsertLine(event.payload.line);
    }

    if (event.type === "line_updated" || event.type === "line_moved") {
      this.upsertLine(event.payload.line);
    }

    if (event.type === "line_deleted") {
      this.lines = this.lines.filter((line) => line.id !== event.payload.line_id);
      this.render();
    }

    if (event.type === "alarm_triggered") {
      notifyAlarm(event.payload.message);
    }

    if (event.type === "resync") {
      this.lines = event.payload.lines || [];
      this.render();
    }
  }

  upsertLine(line) {
    const activeInput = document.activeElement;
    const activeId = activeInput?.getAttribute?.("data-line-input");
    const cursorPosition = activeInput?.selectionStart ?? null;

    const idx = this.lines.findIndex((item) => item.id === line.id);
    if (idx >= 0) {
      if (this.localDrafts.has(line.id)) {
        return;
      }
      this.lines[idx] = line;
    } else {
      this.lines.push(line);
    }
    this.lines.sort((a, b) => Number(a.order_key) - Number(b.order_key));
    this.render();

    if (activeId) {
      this.focusLine(activeId, cursorPosition);
    }
  }

  async createLine(afterLineId, text = "", focus = true) {
    const response = await apiRequest("/notes/api/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ after_line_id: afterLineId, text, checked: false }),
    });

    if (response.queued) {
      showToast("Hors ligne: action mise en file");
      return;
    }

    if (!response.ok) {
      showToast("Impossible d'ajouter la ligne");
      return;
    }

    const created = await response.json();
    this.upsertLine(created);
    if (focus) {
      setTimeout(() => this.focusLine(created.id), 20);
    }
  }

  async updateLine(id, patch) {
    const response = await apiRequest(`/notes/api/lines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.queued) {
      showToast("Hors ligne: modification en attente");
    }
  }

  async deleteLine(id) {
    const response = await apiRequest(`/notes/api/lines/${id}`, { method: "DELETE" });
    if (response.queued) {
      showToast("Hors ligne: suppression en attente");
    }
  }

  focusLine(id, cursorPosition = null) {
    const el = this.linesRoot.querySelector(`[data-line-input="${id}"]`);
    if (!el) return;
    el.focus();
    if (cursorPosition !== null) {
      el.setSelectionRange(cursorPosition, cursorPosition);
    }
  }

  syncLineSoon(id) {
    clearTimeout(this.pendingSyncTimers.get(id));
    const timer = setTimeout(async () => {
      const text = this.localDrafts.get(id);
      if (text === undefined) {
        return;
      }
      await this.updateLine(id, { text });
      this.localDrafts.delete(id);
      this.pendingSyncTimers.delete(id);
    }, 220);
    this.pendingSyncTimers.set(id, timer);
  }

  async flushLineSync(id) {
    clearTimeout(this.pendingSyncTimers.get(id));
    this.pendingSyncTimers.delete(id);
    const text = this.localDrafts.get(id);
    if (text === undefined) {
      return;
    }
    await this.updateLine(id, { text });
    this.localDrafts.delete(id);
  }

  lineAfter(id) {
    const index = this.lines.findIndex((line) => line.id === id);
    if (index === -1 || index === this.lines.length - 1) {
      return null;
    }
    return this.lines[index + 1];
  }

  lineBefore(id) {
    const index = this.lines.findIndex((line) => line.id === id);
    if (index <= 0) {
      return null;
    }
    return this.lines[index - 1];
  }

  render() {
    this.linesRoot.innerHTML = "";
    this.lines.sort((a, b) => Number(a.order_key) - Number(b.order_key));

    this.lines.forEach((line) => {
      this.linesRoot.appendChild(this.buildLineRow(line));
    });
  }

  buildLineRow(line) {
    const row = document.createElement("article");
    row.className = "line";

    const input = document.createElement("input");
    input.value = line.text;
    input.className = "line__input";
    input.setAttribute("data-line-input", line.id);
    input.placeholder = "Ajouter un article";

    input.addEventListener("input", () => {
      const localLine = this.lines.find((item) => item.id === line.id);
      if (localLine) {
        localLine.text = input.value;
      }
      this.localDrafts.set(line.id, input.value);
      this.syncLineSoon(line.id);
      this.socket.send("cursor", { line_id: line.id, at: input.selectionStart || 0 });
    });

    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const cursor = input.selectionStart || 0;
        const before = input.value.slice(0, cursor);
        const after = input.value.slice(cursor);
        this.localDrafts.set(line.id, before);
        await this.flushLineSync(line.id);
        await this.createLine(line.id, after, true);
        return;
      }

      if (event.key === "Backspace" && input.value.length === 0) {
        const previous = this.lineBefore(line.id);
        if (!previous) {
          return;
        }
        event.preventDefault();
        this.localDrafts.delete(line.id);
        await this.deleteLine(line.id);
        this.focusLine(previous.id);
      }

      if (event.key === "ArrowDown" && input.selectionStart === input.value.length) {
        const next = this.lineAfter(line.id);
        if (next) {
          event.preventDefault();
          this.focusLine(next.id, 0);
        }
      }

      if (event.key === "ArrowUp" && input.selectionStart === 0) {
        const prev = this.lineBefore(line.id);
        if (prev) {
          event.preventDefault();
          this.focusLine(prev.id);
        }
      }
    });

    input.addEventListener("focus", () => {
      this.socket.send("cursor", { line_id: line.id, at: input.selectionStart || 0 });
    });

    input.addEventListener("blur", async () => {
      await this.flushLineSync(line.id);
    });

    const actions = document.createElement("div");
    actions.className = "inline-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "🗑️";
    deleteBtn.title = "Supprimer";
    deleteBtn.addEventListener("click", async () => {
      await this.deleteLine(line.id);
      if (this.lines.length === 0) {
        await this.createLine(null, "", true);
      }
    });

    actions.append(deleteBtn);
    row.append(input, actions);
    return row;
  }
}
