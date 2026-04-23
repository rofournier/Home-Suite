from __future__ import annotations

from datetime import datetime
from decimal import Decimal, getcontext

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from notes.models import NoteLine, SharedSheet

getcontext().prec = 28
GAP = Decimal("1024")
EPSILON = Decimal("0.0000001")


async def get_or_create_main_sheet(session: AsyncSession) -> SharedSheet:
    stmt: Select[tuple[SharedSheet]] = select(SharedSheet).where(SharedSheet.slug == "main")
    sheet = (await session.execute(stmt)).scalar_one_or_none()
    if sheet:
        return sheet

    sheet = SharedSheet(slug="main")
    session.add(sheet)
    await session.flush()
    return sheet


async def list_lines(session: AsyncSession, sheet_id: str) -> list[NoteLine]:
    stmt = select(NoteLine).where(NoteLine.sheet_id == sheet_id).order_by(NoteLine.order_key.asc())
    return list((await session.execute(stmt)).scalars().all())


def _dec(raw: str) -> Decimal:
    return Decimal(raw)


def _fmt(value: Decimal) -> str:
    normalized = value.normalize()
    return f"{normalized:f}" if normalized != normalized.to_integral() else str(normalized.to_integral())


async def compute_insert_order_key(
    session: AsyncSession,
    sheet_id: str,
    after_line_id: str | None,
) -> str:
    lines = await list_lines(session, sheet_id)

    if not lines:
        return _fmt(GAP)

    if after_line_id is None:
        first_key = _dec(lines[0].order_key)
        return _fmt(first_key / 2)

    idx = next((i for i, line in enumerate(lines) if line.id == after_line_id), None)
    if idx is None:
        last_key = _dec(lines[-1].order_key)
        return _fmt(last_key + GAP)

    prev_key = _dec(lines[idx].order_key)
    if idx == len(lines) - 1:
        return _fmt(prev_key + GAP)

    next_key = _dec(lines[idx + 1].order_key)
    midpoint = (prev_key + next_key) / 2
    if (next_key - prev_key) <= EPSILON:
        await rebalance_order_keys(session, lines)
        lines = await list_lines(session, sheet_id)
        idx = next((i for i, line in enumerate(lines) if line.id == after_line_id), None)
        if idx is None or idx == len(lines) - 1:
            return _fmt(_dec(lines[-1].order_key) + GAP)
        prev_key = _dec(lines[idx].order_key)
        next_key = _dec(lines[idx + 1].order_key)
        midpoint = (prev_key + next_key) / 2

    return _fmt(midpoint)


async def rebalance_order_keys(session: AsyncSession, lines: list[NoteLine]) -> None:
    current = GAP
    for line in lines:
        line.order_key = _fmt(current)
        line.updated_at = datetime.utcnow()
        current += GAP
    await session.flush()
