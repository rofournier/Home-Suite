export class SocketClient {
  constructor(url, onEvent, onOpen = null) {
    this.url = url;
    this.onEvent = onEvent;
    this.onOpen = onOpen;
    this.ws = null;
    this.pingTimer = null;
    this.retry = 0;
    this.lastPongAt = 0;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.addEventListener("open", () => {
      this.retry = 0;
      this.lastPongAt = Date.now();
      this.startHeartbeat();
      this.send("resync_request");
      if (this.onOpen) {
        this.onOpen();
      }
    });

    this.ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "pong") {
        this.lastPongAt = Date.now();
      }
      this.onEvent(data);
    });

    this.ws.addEventListener("close", () => {
      this.stopHeartbeat();
      setTimeout(() => this.connect(), Math.min(5000, 400 * ++this.retry));
    });
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  startHeartbeat() {
    this.pingTimer = setInterval(() => {
      this.send("ping");
      if (Date.now() - this.lastPongAt > 38000 && this.ws) {
        this.ws.close();
      }
    }, 12000);
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
