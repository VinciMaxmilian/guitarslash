"""Deteccao e leitura da biblioteca de musicas em disco.

Regra: uma pasta e uma musica quando contem song.ini.
Nenhuma musica e codificada individualmente, e arquivo faltando nunca
derruba a aplicacao - vira um aviso no campo `missing`.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Any

from ..parsers import MidiParseError, ParsedSong, build_chart, parse_song_chart
from ..parsers.song_ini_parser import metadata_from_ini, parse_song_ini

AUDIO_EXTENSIONS = (".opus", ".ogg", ".mp3", ".m4a", ".wav", ".flac")
COVER_NAMES = ("album", "cover", "artwork", "background-art")
COVER_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
VIDEO_NAMES = ("background", "video")
VIDEO_EXTENSIONS = (".mp4", ".webm")
#: Ordem de preferencia. O MIDI vem primeiro porque, quando a pasta traz os
#: dois, ele costuma ser o formato exportado por ultimo pelo editor.
CHART_NAMES = ("notes.mid", "notes.midi", "notes.chart")
INI_NAME = "song.ini"

# Stems reconhecidos. `song` e a mixagem completa usada no MVP.
STEM_NAMES = (
    "song",
    "guitar",
    "rhythm",
    "bass",
    "vocals",
    "vocals_1",
    "vocals_2",
    "drums",
    "drums_1",
    "drums_2",
    "drums_3",
    "drums_4",
    "keys",
    "crowd",
    "preview",
)

MAX_SCAN_DEPTH = 4

# Ordem em que os instrumentos aparecem na interface.
INSTRUMENT_ORDER = ("guitar", "guitar_coop", "rhythm", "bass", "drums", "keys", "vocals")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower()
    return slug or "song"


class SongFolder:
    """Inventario dos arquivos de uma pasta de musica."""

    def __init__(self, song_id: str, path: Path, root: Path):
        self.id = song_id
        self.path = path
        self.root = root
        self.files: dict[str, str] = {}
        self.audio: dict[str, str] = {}
        self.missing: list[str] = []
        self._inventory()

    def _inventory(self) -> None:
        entries = {p.name.lower(): p.name for p in self.path.iterdir() if p.is_file()}

        for candidate in CHART_NAMES:
            if candidate in entries:
                self.files["chart"] = entries[candidate]
                break
        else:
            self.missing.append("notes.mid")

        if INI_NAME in entries:
            self.files["ini"] = entries[INI_NAME]

        for name in COVER_NAMES:
            found = next(
                (entries[f"{name}{ext}"] for ext in COVER_EXTENSIONS if f"{name}{ext}" in entries),
                None,
            )
            if found:
                self.files["cover"] = found
                break
        else:
            self.missing.append("album.jpg")

        for name in VIDEO_NAMES:
            found = next(
                (entries[f"{name}{ext}"] for ext in VIDEO_EXTENSIONS if f"{name}{ext}" in entries),
                None,
            )
            if found:
                self.files["video"] = found
                break

        for stem in STEM_NAMES:
            found = next(
                (entries[f"{stem}{ext}"] for ext in AUDIO_EXTENSIONS if f"{stem}{ext}" in entries),
                None,
            )
            if found:
                self.audio[stem] = found

        if not self.audio:
            self.missing.append("song.opus")

    @property
    def fingerprint(self) -> str:
        """Muda quando qualquer arquivo relevante muda: base do cache."""
        parts: list[str] = []
        for name in sorted({*self.files.values(), *self.audio.values()}):
            file_path = self.path / name
            try:
                stat = file_path.stat()
            except OSError:
                continue
            parts.append(f"{name}:{stat.st_mtime_ns}:{stat.st_size}")
        return "|".join(parts)

    def chart_path(self) -> Path | None:
        name = self.files.get("chart")
        return self.path / name if name else None


def find_song_folders(root: Path) -> list[SongFolder]:
    if not root.exists() or not root.is_dir():
        return []

    folders: list[SongFolder] = []
    seen_ids: set[str] = set()

    def walk(directory: Path, depth: int) -> None:
        if depth > MAX_SCAN_DEPTH:
            return
        try:
            children = sorted(directory.iterdir(), key=lambda p: p.name.lower())
        except OSError:
            return

        has_ini = any(p.is_file() and p.name.lower() == INI_NAME for p in children)
        if has_ini:
            relative = directory.relative_to(root).as_posix()
            song_id = slugify(relative or directory.name)
            # Colisao de slug entre pastas diferentes: sufixa ate ficar unico.
            base_id, counter = song_id, 2
            while song_id in seen_ids:
                song_id = f"{base_id}-{counter}"
                counter += 1
            seen_ids.add(song_id)
            folders.append(SongFolder(song_id, directory, root))
            return  # nao descemos dentro de uma musica

        for child in children:
            if child.is_dir() and not child.name.startswith("."):
                walk(child, depth + 1)

    walk(root, 0)
    return folders


def parse_folder(folder: SongFolder) -> tuple[dict[str, Any], ParsedSong | None]:
    """Monta o resumo de uma musica. Nunca levanta por chart invalido."""
    metadata: dict[str, Any] = {
        "title": "",
        "artist": "",
        "album": None,
        "year": None,
        "genre": None,
        "charter": None,
        "duration": 0.0,
        "preview_start": 0.0,
        "delay": 0.0,
    }

    ini_name = folder.files.get("ini")
    if ini_name:
        metadata.update(metadata_from_ini(parse_song_ini(folder.path / ini_name)))

    if not metadata["title"]:
        metadata["title"] = folder.path.name
    if not metadata["artist"]:
        metadata["artist"] = "Artista desconhecido"

    parsed: ParsedSong | None = None
    instruments: dict[str, dict] = {}
    missing = list(folder.missing)

    chart_path = folder.chart_path()
    if chart_path is not None:
        try:
            parsed = parse_song_chart(chart_path)
            instruments = parsed.instrument_summary()
            if not metadata["duration"]:
                metadata["duration"] = round(parsed.length, 3)
        except MidiParseError as exc:
            missing.append(f"notes.mid ({exc})")

    if instruments:
        instruments = {
            name: instruments[name]
            for name in sorted(
                instruments,
                key=lambda n: (INSTRUMENT_ORDER.index(n) if n in INSTRUMENT_ORDER else 99, n),
            )
        }
    else:
        missing.append("nenhum instrumento jogavel encontrado")

    summary: dict[str, Any] = {
        "id": folder.id,
        **metadata,
        "has_background_video": "video" in folder.files,
        "has_cover": "cover" in folder.files,
        "instruments": instruments,
        "missing": missing,
        # Nomes reais dos arquivos, resolvidos em URL pela camada de storage.
        "_files": dict(folder.files),
        "_audio": dict(folder.audio),
    }
    return summary, parsed


def build_chart_for(folder: SongFolder, instrument: str, difficulty: str) -> dict | None:
    chart_path = folder.chart_path()
    if chart_path is None:
        return None
    try:
        parsed = parse_song_chart(chart_path)
        chart = build_chart(parsed, instrument, difficulty)
    except MidiParseError:
        return None
    chart["song_id"] = folder.id
    return chart
