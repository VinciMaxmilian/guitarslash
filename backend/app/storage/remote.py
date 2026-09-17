"""Storage remoto: le a biblioteca de um object storage / CDN.

Em producao a function nao tem songs/ no disco e nao deve gastar cold start
fazendo parse de MIDI. Por isso o indice e os charts sao GERADOS ANTES do
deploy e publicados junto dos assets:

    <ASSETS_BASE_URL>/index.json
    <ASSETS_BASE_URL>/charts/<song_id>/<instrument>/<difficulty>.json
    <ASSETS_BASE_URL>/songs/<song_id>/<arquivo>

Gere tudo com:

    python -m backend.app.tools.build_index --out dist-songs

O bucket precisa de CORS para o dominio do frontend e de suporte a Range
requests, senao o seek de audio e video nao funciona.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from .interface import SongStorage

log = logging.getLogger(__name__)

INDEX_FILE = "index.json"
_TIMEOUT = 10


class RemoteSongStorage(SongStorage):
    kind = "remote"

    def __init__(self, base_url: str):
        if not base_url:
            raise ValueError(
                "GUITARSLASH_STORAGE=remote exige GUITARSLASH_ASSETS_BASE_URL"
            )
        self.base_url = base_url.rstrip("/")
        self._index: dict[str, dict] | None = None
        self._charts: dict[tuple[str, str, str], dict] = {}
        self._errors: list[str] = []

    # ------------------------------------------------------------------ http
    def _fetch_json(self, path: str) -> Any | None:
        url = f"{self.base_url}/{path.lstrip('/')}"
        try:
            with urllib.request.urlopen(url, timeout=_TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, ValueError, TimeoutError) as exc:
            log.warning("falha ao buscar %s: %s", url, exc)
            return None

    def _ensure_index(self) -> dict[str, dict]:
        if self._index is not None:
            return self._index

        payload = self._fetch_json(INDEX_FILE)
        if not isinstance(payload, dict) or "songs" not in payload:
            self._errors = [f"indice remoto indisponivel em {self.base_url}/{INDEX_FILE}"]
            self._index = {}
            return self._index

        self._errors = []
        self._index = {song["id"]: song for song in payload.get("songs", []) if "id" in song}
        return self._index

    def invalidate(self) -> None:
        self._index = None
        self._charts.clear()

    # ------------------------------------------------------------------ api
    def list_songs(self) -> tuple[list[dict], list[str]]:
        index = self._ensure_index()
        songs = [self._with_urls(s) for s in index.values()]
        songs.sort(key=lambda s: (s.get("artist", "").lower(), s.get("title", "").lower()))
        return songs, list(self._errors)

    def get_song(self, song_id: str) -> dict | None:
        song = self._ensure_index().get(song_id)
        return self._with_urls(song) if song else None

    def get_chart(self, song_id: str, instrument: str, difficulty: str) -> dict | None:
        key = (song_id, instrument, difficulty)
        if key in self._charts:
            return self._charts[key]

        chart = self._fetch_json(f"charts/{song_id}/{instrument}/{difficulty}.json")
        if isinstance(chart, dict):
            self._charts[key] = chart
            return chart
        return None

    def file_url(self, song_id: str, filename: str) -> str:
        return f"{self.base_url}/songs/{song_id}/{filename}"

    # ------------------------------------------------------------------ urls
    def _with_urls(self, summary: dict) -> dict:
        result: dict[str, Any] = {k: v for k, v in summary.items() if not k.startswith("_")}
        files = summary.get("_files", {})
        audio = summary.get("_audio", {})
        song_id = summary["id"]

        result["assets"] = {
            "cover": self.file_url(song_id, files["cover"]) if "cover" in files else None,
            "background_video": self.file_url(song_id, files["video"]) if "video" in files else None,
            "chart": None,
            "audio": {stem: self.file_url(song_id, name) for stem, name in audio.items()},
        }
        return result
