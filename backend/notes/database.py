from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

_DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "notes.db"
DATABASE_URL = os.getenv("NOTES_DATABASE_URL", f"sqlite+aiosqlite:///{_DEFAULT_DB}")

engine = create_async_engine(DATABASE_URL, future=True, echo=False)
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


@asynccontextmanager
async def get_session() -> AsyncSession:
    session = AsyncSessionLocal()
    try:
        yield session
    finally:
        await session.close()
