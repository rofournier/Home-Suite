from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from home_radar.router import router as home_radar_router
from notes.database import Base, engine
from notes.router import router as notes_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Home Suite")


@app.on_event("startup")
async def startup() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# --- Routers (registered BEFORE static mounts so they take priority) ---
app.include_router(home_radar_router, prefix="/home-radar")
app.include_router(notes_router, prefix="/notes")


# --- Root-level static files (explicit routes first) ---

@app.get("/")
async def homepage() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/sw.js")
async def root_sw() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "sw.js", media_type="application/javascript")


@app.get("/manifest.webmanifest")
async def root_manifest() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "manifest.webmanifest", media_type="application/manifest+json")


# --- Static mounts (registered LAST) ---

# Shared JS utilities (notifications, etc.)
app.mount(
    "/shared",
    StaticFiles(directory=FRONTEND_DIR / "shared"),
    name="shared_static",
)

# Root-level icons (used by homepage manifest + sub-app manifests)
app.mount(
    "/icons",
    StaticFiles(directory=FRONTEND_DIR / "icons"),
    name="icons_static",
)

# Per-app static files
app.mount(
    "/home-radar",
    StaticFiles(directory=FRONTEND_DIR / "home_radar", html=True),
    name="home_radar_static",
)
app.mount(
    "/notes",
    StaticFiles(directory=FRONTEND_DIR / "notes", html=True),
    name="notes_static",
)
