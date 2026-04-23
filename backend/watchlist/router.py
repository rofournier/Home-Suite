from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import desc, select

from watchlist.database import get_session
from watchlist.models import Movie
from watchlist.schemas import MovieCreate, MovieUpdate

router = APIRouter()


def serialize_movie(movie: Movie) -> dict:
    return {
        "id": movie.id,
        "title": movie.title,
        "kind": movie.kind,
        "genre": movie.genre,
        "rating": movie.rating,
        "watched": movie.watched,
        "created_at": movie.created_at.isoformat(),
    }


@router.get("/api/movies")
async def list_movies() -> dict:
    async with get_session() as session:
        result = await session.execute(select(Movie).order_by(desc(Movie.created_at)))
        movies = result.scalars().all()
    return {"movies": [serialize_movie(movie) for movie in movies]}


@router.post("/api/movies")
async def create_movie(payload: MovieCreate) -> dict:
    async with get_session() as session:
        movie = Movie(
            title=payload.title,
            kind=payload.kind,
            genre=payload.genre,
            rating=payload.rating,
            watched=payload.watched,
            created_at=datetime.utcnow(),
        )
        session.add(movie)
        await session.commit()
        await session.refresh(movie)
    return serialize_movie(movie)


@router.patch("/api/movies/{movie_id}")
async def update_movie(movie_id: str, payload: MovieUpdate) -> dict:
    async with get_session() as session:
        result = await session.execute(select(Movie).where(Movie.id == movie_id))
        movie = result.scalar_one_or_none()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        if payload.title is not None:
            movie.title = payload.title
        if payload.kind is not None:
            movie.kind = payload.kind
        if payload.clear_genre:
            movie.genre = None
        elif payload.genre is not None:
            movie.genre = payload.genre
        if payload.clear_rating:
            movie.rating = None
        elif payload.rating is not None:
            movie.rating = payload.rating
        if payload.watched is not None:
            movie.watched = payload.watched

        await session.commit()
        await session.refresh(movie)
    return serialize_movie(movie)


@router.delete("/api/movies/{movie_id}")
async def delete_movie(movie_id: str) -> dict:
    async with get_session() as session:
        result = await session.execute(select(Movie).where(Movie.id == movie_id))
        movie = result.scalar_one_or_none()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        await session.delete(movie)
        await session.commit()
    return {"ok": True}
