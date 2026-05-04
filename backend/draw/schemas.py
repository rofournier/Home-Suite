from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field, field_validator, model_validator

MAX_PAYLOAD_BYTES = 512 * 1024
MAX_STROKES = 4000
MAX_POINTS_PER_STROKE = 8000
MAX_TOTAL_POINTS = 400_000


class StrokeIn(BaseModel):
    color: str = Field(min_length=1, max_length=32)
    width: float = Field(ge=0.5, le=96)
    points: list[list[int]] = Field(min_length=2)

    @field_validator("color")
    @classmethod
    def color_hex_ok(cls, v: str) -> str:
        s = v.strip()
        if not re.match(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", s):
            raise ValueError("color must be #RGB or #RRGGBB")
        return s

    @field_validator("points")
    @classmethod
    def points_pairs(cls, v: list[list[int]]) -> list[list[int]]:
        if len(v) > MAX_POINTS_PER_STROKE:
            raise ValueError(f"too many points per stroke (max {MAX_POINTS_PER_STROKE})")
        for p in v:
            if len(p) != 2:
                raise ValueError("each point must be [x, y]")
            if not all(isinstance(n, int) and -10_000 <= n <= 50_000 for n in p):
                raise ValueError("point coordinates out of range")
        return v


class PaintingPayload(BaseModel):
    v: int = Field(default=1, ge=1, le=1)
    w: int = Field(ge=200, le=4096)
    h: int = Field(ge=200, le=8192)
    strokes: list[StrokeIn] = Field(default_factory=list)

    @field_validator("strokes")
    @classmethod
    def stroke_count(cls, v: list[StrokeIn]) -> list[StrokeIn]:
        if len(v) > MAX_STROKES:
            raise ValueError(f"too many strokes (max {MAX_STROKES})")
        total = sum(len(s.points) for s in v)
        if total > MAX_TOTAL_POINTS:
            raise ValueError(f"too many points total (max {MAX_TOTAL_POINTS})")
        return v


class DrawingCreate(BaseModel):
    title: str | None = Field(default=None, max_length=128)
    payload: PaintingPayload

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        t = v.strip()
        return t or None

    @model_validator(mode="after")
    def payload_json_size(self) -> DrawingCreate:
        raw = json.dumps(
            self.payload.model_dump(), ensure_ascii=False, separators=(",", ":")
        )
        if len(raw.encode("utf-8")) > MAX_PAYLOAD_BYTES:
            raise ValueError("payload too large")
        return self


class DrawingUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=128)
    payload: PaintingPayload | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        t = v.strip()
        return t or None

    @model_validator(mode="after")
    def payload_json_size(self) -> DrawingUpdate:
        if self.payload is None:
            return self
        raw = json.dumps(
            self.payload.model_dump(), ensure_ascii=False, separators=(",", ":")
        )
        if len(raw.encode("utf-8")) > MAX_PAYLOAD_BYTES:
            raise ValueError("payload too large")
        return self
