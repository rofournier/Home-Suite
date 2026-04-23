from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class MovieCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    kind: Literal["film", "serie"] = "film"
    genre: str | None = Field(default=None, max_length=80)
    rating: int | None = Field(default=None, ge=1, le=5)
    watched: bool = False

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be empty")
        return stripped

    @field_validator("genre")
    @classmethod
    def normalize_genre(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class MovieUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    kind: Literal["film", "serie"] | None = None
    genre: str | None = Field(default=None, max_length=80)
    rating: int | None = Field(default=None, ge=1, le=5)
    watched: bool | None = None
    clear_rating: bool = False
    clear_genre: bool = False

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be empty")
        return stripped

    @field_validator("genre")
    @classmethod
    def normalize_genre(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None
