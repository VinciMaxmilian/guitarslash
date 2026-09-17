"""Parser de song.ini.

Os arquivos reais sao bagunçados: secao com nome variado, chaves duplicadas,
encoding inconsistente, valores vazios. O parser nunca levanta excecao por
conteudo malformado - devolve o que conseguiu ler.
"""

from __future__ import annotations

import configparser
import io
import re
from pathlib import Path
from typing import Any

# Chaves numericas conhecidas do formato Clone Hero / Phase Shift.
_INT_KEYS = {
    "song_length",
    "preview_start_time",
    "delay",
    "album_track",
    "playlist_track",
    "diff_band",
    "diff_guitar",
    "diff_rhythm",
    "diff_bass",
    "diff_drums",
    "diff_keys",
    "diff_vocals",
    "diff_guitarghl",
    "diff_bassghl",
}

_ALIASES = {
    "frets": "charter",
    "track": "album_track",
    "year": "year",
}


def _read_text(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def _coerce(key: str, value: str) -> Any:
    value = value.strip()
    if key in _INT_KEYS:
        # Valores como "1234" ou "1234.0" aparecem nos dois formatos.
        match = re.match(r"^-?\d+", value)
        if not match:
            return None
        try:
            return int(match.group(0))
        except ValueError:
            return None
    return value or None


def parse_song_ini(path: Path) -> dict[str, Any]:
    """Le um song.ini e devolve um dicionario normalizado."""
    text = _read_text(path)

    # Alguns arquivos vem sem cabecalho de secao.
    if not re.search(r"^\s*\[", text, flags=re.MULTILINE):
        text = "[song]\n" + text

    parser = configparser.ConfigParser(strict=False, interpolation=None)
    parser.optionxform = str  # preserva a caixa original antes de normalizar
    try:
        parser.read_file(io.StringIO(text))
    except configparser.Error:
        # Ultimo recurso: parse linha a linha, ignorando o que nao entendemos.
        return _parse_loose(text)

    data: dict[str, Any] = {}
    for section in parser.sections():
        for raw_key, raw_value in parser.items(section):
            key = _ALIASES.get(raw_key.strip().lower(), raw_key.strip().lower())
            coerced = _coerce(key, raw_value)
            if coerced is not None:
                data[key] = coerced
    return data


def _parse_loose(text: str) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("[", ";", "#")) or "=" not in line:
            continue
        raw_key, _, raw_value = line.partition("=")
        key = _ALIASES.get(raw_key.strip().lower(), raw_key.strip().lower())
        coerced = _coerce(key, raw_value)
        if coerced is not None:
            data[key] = coerced
    return data


def metadata_from_ini(data: dict[str, Any]) -> dict[str, Any]:
    """Converte o dicionario cru do ini para os campos que a API expoe."""
    length_ms = data.get("song_length")
    preview_ms = data.get("preview_start_time")
    delay_ms = data.get("delay")

    return {
        "title": data.get("name") or "",
        "artist": data.get("artist") or "",
        "album": data.get("album"),
        "year": str(data["year"]) if data.get("year") is not None else None,
        "genre": data.get("genre"),
        "charter": data.get("charter"),
        "duration": (length_ms / 1000.0) if isinstance(length_ms, int) and length_ms > 0 else 0.0,
        "preview_start": (preview_ms / 1000.0) if isinstance(preview_ms, int) and preview_ms > 0 else 0.0,
        "delay": (delay_ms / 1000.0) if isinstance(delay_ms, int) else 0.0,
    }
