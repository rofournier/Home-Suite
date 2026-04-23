from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict
from datetime import datetime

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[channel].add(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[channel].discard(websocket)
            if not self._connections[channel]:
                self._connections.pop(channel, None)

    async def count(self, channel: str) -> int:
        async with self._lock:
            return len(self._connections.get(channel, set()))

    async def send_to(self, websocket: WebSocket, event_type: str, payload: dict) -> None:
        message = {
            "event_id": str(uuid.uuid4()),
            "version": 1,
            "type": event_type,
            "payload": payload,
            "sent_at": datetime.utcnow().isoformat(),
        }
        await websocket.send_text(json.dumps(message))

    async def broadcast(
        self,
        channel: str,
        event_type: str,
        payload: dict,
        exclude: WebSocket | None = None,
    ) -> None:
        message = {
            "event_id": str(uuid.uuid4()),
            "version": 1,
            "type": event_type,
            "payload": payload,
            "sent_at": datetime.utcnow().isoformat(),
        }
        raw = json.dumps(message)
        targets = list(self._connections.get(channel, set()))
        for ws in targets:
            if ws is exclude:
                continue
            try:
                await ws.send_text(raw)
            except Exception:
                await self.disconnect(channel, ws)


manager = ConnectionManager()
