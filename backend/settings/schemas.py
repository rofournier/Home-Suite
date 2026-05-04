from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AppSettings(BaseModel):
    radar_background: Literal["space", "sky", "ocean", "aurora"] = "space"
    home_name: str = Field(default="Home", max_length=40)


class AppSettingsPatch(BaseModel):
    radar_background: Literal["space", "sky", "ocean", "aurora"] | None = None
    home_name: str | None = Field(default=None, max_length=40)
