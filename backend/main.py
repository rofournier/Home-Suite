from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from draw.database import Base as DrawBase
from draw.database import engine as draw_engine
from draw.router import router as draw_router
from home_radar.router import router as home_radar_router
from notes.database import Base as NotesBase
from notes.database import engine as notes_engine
from notes.router import router as notes_router
from watchlist.database import Base as WatchlistBase
from watchlist.database import engine as watchlist_engine
from watchlist.router import router as watchlist_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Home Suite")


@app.on_event("startup")
async def startup() -> None:
    async with notes_engine.begin() as conn:
        await conn.run_sync(NotesBase.metadata.create_all)
    async with watchlist_engine.begin() as conn:
        await conn.run_sync(WatchlistBase.metadata.create_all)
    async with draw_engine.begin() as conn:
        await conn.run_sync(DrawBase.metadata.create_all)


# --- Routers (registered BEFORE static mounts so they take priority) ---
app.include_router(home_radar_router, prefix="/home-radar")
app.include_router(notes_router, prefix="/notes")
app.include_router(watchlist_router, prefix="/watchlist")
app.include_router(draw_router, prefix="/draw")


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


@app.get("/legacy")
async def homepage_legacy() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index_legacy.html")


@app.get("/home.png")
async def root_home_png() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "home.png", media_type="image/png")


@app.get("/home.js")
async def root_home_js() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "home.js", media_type="application/javascript")


@app.get("/weather.js")
async def root_weather_js() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "weather.js", media_type="application/javascript")


@app.get("/weather-bg.js")
async def root_weather_bg_js() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "weather-bg.js", media_type="application/javascript")


@app.get("/draw/view")
async def draw_view_page() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "draw" / "view.html", media_type="text/html")


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
app.mount(
    "/watchlist",
    StaticFiles(directory=FRONTEND_DIR / "watchlist", html=True),
    name="watchlist_static",
)
app.mount(
    "/draw",
    StaticFiles(directory=FRONTEND_DIR / "draw", html=True),
    name="draw_static",
)
