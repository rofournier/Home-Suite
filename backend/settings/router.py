from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from .schemas import AppSettings, AppSettingsPatch
from .store import SettingsStore

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
store = SettingsStore(DATA_DIR / "settings.db")

router = APIRouter()


@router.get("", response_model=AppSettings)
async def get_settings() -> AppSettings:
    return AppSettings(**store.get_all())


@router.patch("", response_model=AppSettings)
async def update_settings(payload: AppSettingsPatch) -> AppSettings:
    current = store.get_all()
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    merged = {**current, **patch}
    await store.set_all(patch)
    return AppSettings(**merged)
