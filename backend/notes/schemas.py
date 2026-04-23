from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LineBase(BaseModel):
    text: str = ""
    checked: bool = False


class LineCreate(LineBase):
    after_line_id: str | None = None


class LineUpdate(BaseModel):
    text: str | None = None
    checked: bool | None = None


class LineMove(BaseModel):
    after_line_id: str | None = None


class AlarmCreate(BaseModel):
    message: str = Field(min_length=1, max_length=255)
    line_id: str | None = None


class NoteLineOut(BaseModel):
    id: str
    order_key: str
    text: str
    checked: bool
    updated_at: datetime
    updated_by_session: str


class SheetSnapshot(BaseModel):
    lines: list[NoteLineOut]
    server_time: datetime


class WsEvent(BaseModel):
    event_id: str
    version: int = 1
    type: Literal[
        "line_created",
        "line_updated",
        "line_moved",
        "line_deleted",
        "alarm_triggered",
        "presence",
        "cursor",
        "resync",
        "pong",
    ]
    payload: dict
