"""Selecao do backend de storage a partir da configuracao."""

from __future__ import annotations

from ..config import Settings
from .interface import SongStorage
from .local import LocalSongStorage
from .remote import RemoteSongStorage

__all__ = ["SongStorage", "LocalSongStorage", "RemoteSongStorage", "create_storage"]


def create_storage(settings: Settings) -> SongStorage:
    if settings.storage == "remote":
        return RemoteSongStorage(settings.assets_base_url)
    return LocalSongStorage(settings.songs_dir, cache_dir=settings.cache_dir)
