"""Configuracao do backend, lida do ambiente.

Nada aqui depende de FastAPI, para que os parsers e o scanner possam ser
usados por scripts e testes sem subir a aplicacao.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    songs_dir: Path
    allowed_origins: tuple[str, ...]
    storage: str
    assets_base_url: str
    cache_dir: Path

    @property
    def is_local_storage(self) -> bool:
        return self.storage == "local"


def load_settings() -> Settings:
    songs_dir = Path(_env("GUITARSLASH_SONGS_DIR") or (ROOT / "songs"))
    if not songs_dir.is_absolute():
        songs_dir = (ROOT / songs_dir).resolve()

    origins_raw = _env("GUITARSLASH_ALLOWED_ORIGINS")
    if origins_raw:
        origins = tuple(o.strip() for o in origins_raw.split(",") if o.strip())
    else:
        origins = (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        )

    cache_raw = _env("GUITARSLASH_CACHE_DIR")
    # Na Vercel so /tmp e gravavel, por isso o default vai para o temp do SO.
    cache_dir = Path(cache_raw) if cache_raw else Path(tempfile.gettempdir()) / "guitarslash"

    return Settings(
        songs_dir=songs_dir,
        allowed_origins=origins,
        storage=(_env("GUITARSLASH_STORAGE") or "local").lower(),
        assets_base_url=_env("GUITARSLASH_ASSETS_BASE_URL").rstrip("/"),
        cache_dir=cache_dir,
    )
