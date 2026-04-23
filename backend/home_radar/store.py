from __future__ import annotations

import asyncio
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ALLOWED_TYPES = {
    "linge",
    "vaisselle",
    "litiere",
    "croquettes",
    "bazar",
    "chaussures",
    "fourmis",
    "poubelle",
    "aspirateur",
    "ampoule",
}


class TaskStore:
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
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    urgency INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    async def list_tasks(self) -> list[dict[str, Any]]:
        async with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT id, type, urgency, x, y, created_at FROM tasks ORDER BY created_at ASC"
                ).fetchall()
        return [
            {
                "id": row["id"],
                "type": row["type"],
                "urgency": row["urgency"],
                "x": row["x"],
                "y": row["y"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    async def add_task(self, task: dict[str, Any]) -> None:
        async with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO tasks (id, type, urgency, x, y, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        task["id"],
                        task["type"],
                        task["urgency"],
                        task["x"],
                        task["y"],
                        task["createdAt"],
                    ),
                )
                conn.commit()

    async def remove_task(self, task_id: str) -> bool:
        async with self._lock:
            with self._connect() as conn:
                result = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
                conn.commit()
        return result.rowcount > 0


def validate_task_payload(task: dict[str, Any]) -> dict[str, Any]:
    task_id = str(task.get("id", "")).strip()
    task_type = str(task.get("type", "")).strip()
    urgency = task.get("urgency")
    x = task.get("x")
    y = task.get("y")
    created_at = str(task.get("createdAt", "")).strip()

    if not task_id:
        raise ValueError("Invalid task id")
    if task_type not in ALLOWED_TYPES:
        raise ValueError("Invalid task type")
    if not isinstance(urgency, int) or urgency not in (1, 2, 3):
        raise ValueError("Invalid urgency")
    if not isinstance(x, (int, float)) or not 0 <= x <= 1:
        raise ValueError("Invalid x coordinate")
    if not isinstance(y, (int, float)) or not 0 <= y <= 1:
        raise ValueError("Invalid y coordinate")
    if created_at:
        try:
            datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("Invalid createdAt format") from error
    else:
        created_at = datetime.now(timezone.utc).isoformat()

    return {
        "id": task_id,
        "type": task_type,
        "urgency": urgency,
        "x": float(x),
        "y": float(y),
        "createdAt": created_at,
    }
