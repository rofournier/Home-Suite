from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from notes.database import Base


class SharedSheet(Base):
    __tablename__ = "shared_sheets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, default="main")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )


class NoteLine(Base):
    __tablename__ = "note_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sheet_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shared_sheets.id", ondelete="CASCADE"), nullable=False
    )
    order_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_by_session: Mapped[str] = mapped_column(String(64), default="system", nullable=False)


class AlarmEvent(Base):
    __tablename__ = "alarm_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sheet_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shared_sheets.id", ondelete="CASCADE"), nullable=False
    )
    line_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("note_lines.id", ondelete="SET NULL"), nullable=True
    )
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    created_by_session: Mapped[str] = mapped_column(String(64), default="system", nullable=False)
