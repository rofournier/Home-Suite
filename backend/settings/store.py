from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path
from typing import Any


DEFAULTS: dict[str, str] = {
    "radar_background": "space",
    "home_name": "Home",
}


class SettingsStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = asyncio.Lock()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def get_all(self) -> dict[str, Any]:
        with self._connect() as conn:
            rows = conn.execute("SELECT key, value FROM settings").fetchall()
        stored = {row["key"]: row["value"] for row in rows}
        return {**DEFAULTS, **stored}

    async def set_all(self, data: dict[str, str]) -> None:
        async with self._lock:
            with self._connect() as conn:
                for key, value in data.items():
                    conn.execute(
                        "INSERT INTO settings (key, value) VALUES (?, ?)"
                        " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        (key, value),
                    )
                conn.commit()
