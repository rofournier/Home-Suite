from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from notes.database import get_session
from notes.models import AlarmEvent, NoteLine
from notes.schemas import AlarmCreate, LineCreate, LineMove, LineUpdate
from notes.services.line_ops import compute_insert_order_key, get_or_create_main_sheet, list_lines
from notes.ws import manager

router = APIRouter()


@router.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@router.get("/api/sheet")
async def get_sheet() -> dict:
    async with get_session() as session:
        sheet = await get_or_create_main_sheet(session)
        lines = await list_lines(session, sheet.id)
        await session.commit()
    return {
        "lines": [
            {
                "id": l.id,
                "order_key": l.order_key,
                "text": l.text,
                "checked": l.checked,
                "updated_at": l.updated_at.isoformat(),
                "updated_by_session": l.updated_by_session,
            }
            for l in lines
        ],
        "server_time": datetime.utcnow().isoformat(),
    }


@router.post("/api/lines")
async def create_line(payload: LineCreate, session_id: str = "http") -> dict:
    async with get_session() as session:
        sheet = await get_or_create_main_sheet(session)
        order_key = await compute_insert_order_key(session, sheet.id, payload.after_line_id)
        line = NoteLine(
            sheet_id=sheet.id,
            order_key=order_key,
            text=payload.text,
            checked=payload.checked,
            updated_by_session=session_id,
            updated_at=datetime.utcnow(),
        )
        session.add(line)
        await session.flush()
        await session.commit()

        line_payload = {
            "id": line.id,
            "order_key": line.order_key,
            "text": line.text,
            "checked": line.checked,
            "updated_at": line.updated_at.isoformat(),
            "updated_by_session": line.updated_by_session,
        }
    await manager.broadcast("sheet:main", "line_created", {"line": line_payload})
    return line_payload


@router.patch("/api/lines/{line_id}")
async def update_line(line_id: str, payload: LineUpdate, session_id: str = "http") -> dict:
    async with get_session() as session:
        stmt = select(NoteLine).where(NoteLine.id == line_id)
        line = (await session.execute(stmt)).scalar_one_or_none()
        if not line:
            raise HTTPException(status_code=404, detail="Line not found")

        if payload.text is not None:
            line.text = payload.text
        if payload.checked is not None:
            line.checked = payload.checked

        line.updated_by_session = session_id
        line.updated_at = datetime.utcnow()
        await session.commit()

        line_payload = {
            "id": line.id,
            "order_key": line.order_key,
            "text": line.text,
            "checked": line.checked,
            "updated_at": line.updated_at.isoformat(),
            "updated_by_session": line.updated_by_session,
        }
    await manager.broadcast("sheet:main", "line_updated", {"line": line_payload})
    return line_payload


@router.post("/api/lines/{line_id}/move")
async def move_line(line_id: str, payload: LineMove, session_id: str = "http") -> dict:
    async with get_session() as session:
        stmt = select(NoteLine).where(NoteLine.id == line_id)
        line = (await session.execute(stmt)).scalar_one_or_none()
        if not line:
            raise HTTPException(status_code=404, detail="Line not found")

        order_key = await compute_insert_order_key(session, line.sheet_id, payload.after_line_id)
        line.order_key = order_key
        line.updated_by_session = session_id
        line.updated_at = datetime.utcnow()
        await session.commit()

        line_payload = {
            "id": line.id,
            "order_key": line.order_key,
            "text": line.text,
            "checked": line.checked,
            "updated_at": line.updated_at.isoformat(),
            "updated_by_session": line.updated_by_session,
        }
    await manager.broadcast("sheet:main", "line_moved", {"line": line_payload})
    return line_payload


@router.delete("/api/lines/{line_id}")
async def delete_line(line_id: str) -> dict:
    async with get_session() as session:
        stmt = select(NoteLine).where(NoteLine.id == line_id)
        line = (await session.execute(stmt)).scalar_one_or_none()
        if not line:
            raise HTTPException(status_code=404, detail="Line not found")

        await session.delete(line)
        await session.commit()

    await manager.broadcast("sheet:main", "line_deleted", {"line_id": line_id})
    return {"ok": True}


@router.post("/api/alarm")
async def trigger_alarm(payload: AlarmCreate, session_id: str = "http") -> dict:
    async with get_session() as session:
        sheet = await get_or_create_main_sheet(session)
        event = AlarmEvent(
            sheet_id=sheet.id,
            line_id=payload.line_id,
            message=payload.message,
            created_by_session=session_id,
            created_at=datetime.utcnow(),
        )
        session.add(event)
        await session.commit()

        alarm_payload = {
            "id": event.id,
            "line_id": event.line_id,
            "message": event.message,
            "created_at": event.created_at.isoformat(),
            "created_by_session": event.created_by_session,
        }

    await manager.broadcast("sheet:main", "alarm_triggered", alarm_payload)
    return alarm_payload


@router.websocket("/ws/sheet/main")
async def sheet_ws(websocket: WebSocket) -> None:
    disconnected = False
    await manager.connect("sheet:main", websocket)
    count = await manager.count("sheet:main")
    await manager.send_to(websocket, "presence_snapshot", {"count": count})
    await manager.broadcast("sheet:main", "presence_snapshot", {"count": count}, exclude=websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_to(websocket, "error", {"message": "invalid_json"})
                continue
            event_type = data.get("type")
            payload = data.get("payload", {})

            if event_type == "ping":
                await manager.send_to(websocket, "pong", {"ts": datetime.utcnow().isoformat()})
                continue

            if event_type in {"cursor", "presence"}:
                await manager.broadcast("sheet:main", event_type, payload, exclude=websocket)
                continue

            if event_type == "resync_request":
                async with get_session() as session:
                    sheet = await get_or_create_main_sheet(session)
                    lines = await list_lines(session, sheet.id)
                    await session.commit()
                await manager.send_to(
                    websocket,
                    "resync",
                    {
                        "lines": [
                            {
                                "id": l.id,
                                "order_key": l.order_key,
                                "text": l.text,
                                "checked": l.checked,
                                "updated_at": l.updated_at.isoformat(),
                                "updated_by_session": l.updated_by_session,
                            }
                            for l in lines
                        ]
                    },
                )

    except WebSocketDisconnect:
        disconnected = True
    finally:
        await manager.disconnect("sheet:main", websocket)
        if not disconnected:
            try:
                await websocket.close()
            except Exception:
                pass
        count = await manager.count("sheet:main")
        await manager.broadcast("sheet:main", "presence_snapshot", {"count": count})
