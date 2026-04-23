from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from home_radar.store import TaskStore, validate_task_payload

logger = logging.getLogger("homeradar")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DB_PATH = DATA_DIR / "home_radar.db"

store = TaskStore(DB_PATH)

router = APIRouter()


class ConnectionHub:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.connections.add(websocket)
            count = len(self.connections)
        logger.info("HomeRadar WS connected from=%s active=%s", websocket.client, count)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.connections.discard(websocket)
            count = len(self.connections)
        logger.info("HomeRadar WS disconnected from=%s active=%s", websocket.client, count)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        message = json.dumps(payload)
        async with self._lock:
            sockets = list(self.connections)
        stale: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_text(message)
            except Exception:
                logger.exception("Broadcast failed to socket=%s", socket.client)
                stale.append(socket)
        if stale:
            async with self._lock:
                for socket in stale:
                    self.connections.discard(socket)


hub = ConnectionHub()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await hub.connect(websocket)
    try:
        tasks = await store.list_tasks()
        logger.info("Sending init payload with %s tasks to=%s", len(tasks), websocket.client)
        await websocket.send_text(json.dumps({"type": "init", "tasks": tasks}))
        while True:
            raw = await websocket.receive_text()
            logger.info("Received WS payload from=%s raw=%s", websocket.client, raw)
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Invalid JSON from=%s", websocket.client)
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            event_type = payload.get("type")
            if event_type == "add":
                try:
                    task = validate_task_payload(payload.get("task", {}))
                    await store.add_task(task)
                    logger.info(
                        "Task added id=%s type=%s urgency=%s from=%s",
                        task["id"],
                        task["type"],
                        task["urgency"],
                        websocket.client,
                    )
                except Exception as error:
                    logger.exception("Cannot add task from=%s", websocket.client)
                    await websocket.send_text(
                        json.dumps({"type": "error", "message": f"Cannot add task: {error}"})
                    )
                    continue
                await hub.broadcast({"type": "add", "task": task})
            elif event_type == "done":
                task_id = str(payload.get("id", "")).strip()
                if not task_id:
                    logger.warning("Missing task id for done event from=%s", websocket.client)
                    await websocket.send_text(
                        json.dumps({"type": "error", "message": "Missing task id"})
                    )
                    continue
                removed = await store.remove_task(task_id)
                if removed:
                    logger.info("Task done id=%s by=%s", task_id, websocket.client)
                    await hub.broadcast({"type": "done", "id": task_id})
                else:
                    logger.warning("Done for unknown task id=%s by=%s", task_id, websocket.client)
            else:
                logger.warning("Unknown event type=%s from=%s", event_type, websocket.client)
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "Unknown event type"})
                )
    except WebSocketDisconnect:
        logger.info("HomeRadar WS disconnect from=%s", websocket.client)
    except Exception:
        logger.exception("Unexpected HomeRadar WS error from=%s", websocket.client)
    finally:
        await hub.disconnect(websocket)
