from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import desc, select

from draw.database import get_session
from draw.models import Drawing
from draw.schemas import DrawingCreate, DrawingUpdate, PaintingPayload

router = APIRouter()


def _serialize(d: Drawing) -> dict:
    try:
        payload = json.loads(d.payload)
    except json.JSONDecodeError:
        payload = {"v": 1, "w": 800, "h": 1200, "strokes": []}
    return {
        "id": d.id,
        "title": d.title,
        "payload": payload,
        "created_at": d.created_at.isoformat(),
        "updated_at": d.updated_at.isoformat(),
    }


def _payload_to_json(p: PaintingPayload) -> str:
    return json.dumps(p.model_dump(), ensure_ascii=False, separators=(",", ":"))


@router.get("/api/drawings")
async def list_drawings() -> dict:
    async with get_session() as session:
        result = await session.execute(select(Drawing).order_by(desc(Drawing.updated_at)))
        rows = result.scalars().all()
    return {"drawings": [_serialize(d) for d in rows]}


@router.get("/api/drawings/{drawing_id}")
async def get_drawing(drawing_id: str) -> dict:
    async with get_session() as session:
        result = await session.execute(select(Drawing).where(Drawing.id == drawing_id))
        row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Drawing not found")
    return _serialize(row)


@router.post("/api/drawings")
async def create_drawing(body: DrawingCreate) -> dict:
    now = datetime.utcnow()
    async with get_session() as session:
        d = Drawing(
            title=body.title,
            payload=_payload_to_json(body.payload),
            created_at=now,
            updated_at=now,
        )
        session.add(d)
        await session.commit()
        await session.refresh(d)
    return _serialize(d)


@router.patch("/api/drawings/{drawing_id}")
async def update_drawing(drawing_id: str, body: DrawingUpdate) -> dict:
    async with get_session() as session:
        result = await session.execute(select(Drawing).where(Drawing.id == drawing_id))
        d = result.scalar_one_or_none()
        if not d:
            raise HTTPException(status_code=404, detail="Drawing not found")

        if body.title is not None:
            d.title = body.title
        if body.payload is not None:
            d.payload = _payload_to_json(body.payload)
        d.updated_at = datetime.utcnow()

        await session.commit()
        await session.refresh(d)
    return _serialize(d)


@router.delete("/api/drawings/{drawing_id}")
async def delete_drawing(drawing_id: str) -> dict:
    async with get_session() as session:
        result = await session.execute(select(Drawing).where(Drawing.id == drawing_id))
        d = result.scalar_one_or_none()
        if not d:
            raise HTTPException(status_code=404, detail="Drawing not found")
        await session.delete(d)
        await session.commit()
    return {"ok": True}
