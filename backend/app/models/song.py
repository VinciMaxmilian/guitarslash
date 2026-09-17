"""Modelos de resposta da API.

Os campos sao expostos em camelCase para o frontend, mas escritos em
snake_case no Python.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class InstrumentInfo(ApiModel):
    available: bool = False
    # supported=False significa: existe no chart, mas a engine ainda nao toca.
    supported: bool = True
    difficulties: list[str] = []
    note_counts: dict[str, int] = {}


class SongAssets(ApiModel):
    cover: str | None = None
    background_video: str | None = None
    audio: dict[str, str] = {}
    chart: str | None = None


class SongSummary(ApiModel):
    id: str
    title: str
    artist: str
    album: str | None = None
    year: str | None = None
    genre: str | None = None
    charter: str | None = None
    duration: float = 0.0
    preview_start: float = 0.0
    # Offset declarado no song.ini, em segundos. Somado ao tempo do audio.
    delay: float = 0.0
    has_background_video: bool = False
    has_cover: bool = False
    instruments: dict[str, InstrumentInfo] = {}
    assets: SongAssets = SongAssets()
    # Arquivos esperados que nao foram encontrados. Nunca quebra a listagem.
    missing: list[str] = []


class ChartNote(ApiModel):
    time: float
    lane: int
    duration: float = 0.0
    type: str = "normal"
    # Indice do acorde: notas simultaneas compartilham o mesmo gate.
    gate: int = 0


class TimeSpan(ApiModel):
    time: float
    duration: float


class Section(ApiModel):
    time: float
    name: str


class BpmEvent(ApiModel):
    time: float
    bpm: float


class Chart(ApiModel):
    song_id: str
    instrument: str
    difficulty: str
    resolution: int
    length: float
    note_count: int
    notes: list[ChartNote]
    star_power: list[TimeSpan] = []
    solos: list[TimeSpan] = []
    sections: list[Section] = []
    bpm: list[BpmEvent] = []


class LibraryResponse(ApiModel):
    count: int
    songs_dir: str | None = None
    storage: str
    songs: list[SongSummary]
    # Pastas que parecem musica mas nao puderam ser lidas.
    errors: list[str] = []
