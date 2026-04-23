from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class MovieCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    kind: Literal["film", "serie"] = "film"
    genres: list[str] = Field(default_factory=list)
    rating: int | None = Field(default=None, ge=1, le=5)
    watched: bool = False

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be empty")
        return stripped

    @field_validator("genres")
    @classmethod
    def normalize_genres(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        result = []
        for item in value:
            stripped = item.strip()[:60]
            if stripped and stripped not in seen:
                seen.add(stripped)
                result.append(stripped)
        return result


class MovieUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    kind: Literal["film", "serie"] | None = None
    genres: list[str] | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    watched: bool | None = None
    clear_rating: bool = False

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be empty")
        return stripped

    @field_validator("genres")
    @classmethod
    def normalize_genres(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        seen: set[str] = set()
        result = []
        for item in value:
            stripped = item.strip()[:60]
            if stripped and stripped not in seen:
                seen.add(stripped)
                result.append(stripped)
        return result
