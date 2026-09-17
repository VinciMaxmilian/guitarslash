"""Storage local: le songs/ do disco.

Usado em desenvolvimento e no modo host da LAN. O parse de MIDI e caro,
entao o resultado fica em cache por fingerprint (mtime + tamanho) de cada
pasta, em memoria e em disco.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from ..services.library import SongFolder, build_chart_for, find_song_folders, parse_folder
from .interface import SongStorage

log = logging.getLogger(__name__)

# Suba este numero sempre que a saida dos parsers mudar de forma. Sem isso, um
# cache gravado por uma versao antiga continuaria sendo servido mesmo depois de
# corrigirmos o parser, porque o fingerprint dos arquivos nao muda.
CACHE_VERSION = 2


class LocalSongStorage(SongStorage):
    kind = "local"

    def __init__(self, root: Path, cache_dir: Path | None = None):
        self.root = root
        self.cache_dir = cache_dir
        self._folders: dict[str, SongFolder] = {}
        self._summaries: dict[str, dict] = {}
        self._errors: list[str] = []
        self._charts: dict[tuple[str, str, str], dict] = {}
        self._loaded = False
        self._force_refresh = False

    # ------------------------------------------------------------------ cache
    @property
    def _cache_file(self) -> Path | None:
        if self.cache_dir is None:
            return None
        return self.cache_dir / "library.json"

    def _load_disk_cache(self) -> dict[str, dict]:
        path = self._cache_file
        if path is None or not path.exists() or self._force_refresh:
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        if not isinstance(payload, dict) or payload.get("version") != CACHE_VERSION:
            return {}
        entries = payload.get("entries")
        return entries if isinstance(entries, dict) else {}

    def _save_disk_cache(self, data: dict[str, dict]) -> None:
        path = self._cache_file
        if path is None:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps({"version": CACHE_VERSION, "entries": data}), encoding="utf-8"
            )
        except OSError as exc:  # filesystem somente leitura nao e erro fatal
            log.debug("cache da biblioteca nao pode ser gravado: %s", exc)

    # ------------------------------------------------------------------ scan
    def _ensure_loaded(self) -> None:
        if self._loaded:
            return

        disk_cache = self._load_disk_cache()
        fresh_cache: dict[str, dict] = {}
        self._folders.clear()
        self._summaries.clear()
        self._errors.clear()

        for folder in find_song_folders(self.root):
            self._folders[folder.id] = folder
            fingerprint = folder.fingerprint
            cached = disk_cache.get(folder.id)

            if cached and cached.get("fingerprint") == fingerprint:
                summary = cached["summary"]
            else:
                try:
                    summary, _ = parse_folder(folder)
                except Exception as exc:  # pasta corrompida nao derruba o scan
                    log.warning("falha ao ler %s: %s", folder.path, exc)
                    self._errors.append(f"{folder.path.name}: {exc}")
                    continue

            fresh_cache[folder.id] = {"fingerprint": fingerprint, "summary": summary}
            self._summaries[folder.id] = summary

        self._save_disk_cache(fresh_cache)
        self._loaded = True
        self._force_refresh = False

    def invalidate(self) -> None:
        # Rescan explicito ignora o cache em disco: e o que o usuario espera
        # quando clica em "Reescanear".
        self._loaded = False
        self._force_refresh = True
        self._charts.clear()

    # ------------------------------------------------------------------ api
    def list_songs(self) -> tuple[list[dict], list[str]]:
        self._ensure_loaded()
        songs = [self._with_urls(s) for s in self._summaries.values()]
        songs.sort(key=lambda s: (s["artist"].lower(), s["title"].lower()))
        return songs, list(self._errors)

    def get_song(self, song_id: str) -> dict | None:
        self._ensure_loaded()
        summary = self._summaries.get(song_id)
        return self._with_urls(summary) if summary else None

    def get_chart(self, song_id: str, instrument: str, difficulty: str) -> dict | None:
        self._ensure_loaded()
        key = (song_id, instrument, difficulty)
        if key in self._charts:
            return self._charts[key]

        folder = self._folders.get(song_id)
        if folder is None:
            return None

        chart = build_chart_for(folder, instrument, difficulty)
        if chart is not None:
            self._charts[key] = chart
        return chart

    def file_path(self, song_id: str, filename: str) -> Path | None:
        self._ensure_loaded()
        folder = self._folders.get(song_id)
        if folder is None:
            return None

        # Impede sair da pasta da musica com ../ ou caminho absoluto.
        candidate = (folder.path / filename).resolve()
        try:
            candidate.relative_to(folder.path.resolve())
        except ValueError:
            return None
        return candidate if candidate.is_file() else None

    # ------------------------------------------------------------------ urls
    def _with_urls(self, summary: dict) -> dict:
        result: dict[str, Any] = {k: v for k, v in summary.items() if not k.startswith("_")}
        files = summary.get("_files", {})
        audio = summary.get("_audio", {})
        song_id = summary["id"]

        result["assets"] = {
            "cover": self.file_url(song_id, files["cover"]) if "cover" in files else None,
            "background_video": self.file_url(song_id, files["video"]) if "video" in files else None,
            "chart": self.file_url(song_id, files["chart"]) if "chart" in files else None,
            "audio": {stem: self.file_url(song_id, name) for stem, name in audio.items()},
        }
        return result
