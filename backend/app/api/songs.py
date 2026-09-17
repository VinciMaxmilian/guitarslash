"""Rotas da biblioteca de musicas."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..models.song import Chart, LibraryResponse, SongAssets, SongSummary
from ..parsers.midi_parser import DIFFICULTY_BASE, SUPPORTED_INSTRUMENTS
from ..storage import SongStorage
from .files import file_response

router = APIRouter(prefix="/api/songs", tags=["songs"])


def get_storage(request: Request) -> SongStorage:
    return request.app.state.storage


@router.get("", response_model=LibraryResponse)
def list_songs(request: Request) -> LibraryResponse:
    storage = get_storage(request)
    songs, errors = storage.list_songs()
    settings = request.app.state.settings
    return LibraryResponse(
        count=len(songs),
        songs_dir=str(settings.songs_dir) if storage.kind == "local" else None,
        storage=storage.kind,
        songs=[SongSummary(**song) for song in songs],
        errors=errors,
    )


@router.post("/rescan", response_model=LibraryResponse)
def rescan(request: Request) -> LibraryResponse:
    get_storage(request).invalidate()
    return list_songs(request)


@router.get("/{song_id}", response_model=SongSummary)
def get_song(song_id: str, request: Request) -> SongSummary:
    song = get_storage(request).get_song(song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="musica nao encontrada")
    return SongSummary(**song)


@router.get("/{song_id}/assets", response_model=SongAssets)
def get_assets(song_id: str, request: Request) -> SongAssets:
    song = get_storage(request).get_song(song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="musica nao encontrada")
    return SongAssets(**song["assets"])


@router.get("/{song_id}/chart")
def list_charts(song_id: str, request: Request) -> dict:
    """Instrumentos e dificuldades disponiveis para a musica."""
    song = get_storage(request).get_song(song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="musica nao encontrada")
    return {"songId": song_id, "instruments": song.get("instruments", {})}


@router.get("/{song_id}/chart/{instrument}/{difficulty}", response_model=Chart)
def get_chart(song_id: str, instrument: str, difficulty: str, request: Request) -> Chart:
    instrument = instrument.lower()
    difficulty = difficulty.lower()

    if difficulty not in DIFFICULTY_BASE:
        raise HTTPException(status_code=400, detail=f"dificuldade invalida: {difficulty}")
    if instrument not in SUPPORTED_INSTRUMENTS:
        raise HTTPException(
            status_code=400, detail=f"instrumento ainda nao suportado: {instrument}"
        )

    chart = get_storage(request).get_chart(song_id, instrument, difficulty)
    if chart is None:
        raise HTTPException(status_code=404, detail="chart nao encontrado")
    if not chart.get("notes"):
        raise HTTPException(
            status_code=404,
            detail=f"{instrument} nao tem notas em {difficulty}",
        )
    return Chart(**chart)


@router.get("/{song_id}/files/{filename}")
def get_file(song_id: str, filename: str, request: Request):
    """Serve um arquivo da musica. So existe no storage local."""
    storage = get_storage(request)
    path = storage.file_path(song_id, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="arquivo nao encontrado")
    return file_response(path, request)
