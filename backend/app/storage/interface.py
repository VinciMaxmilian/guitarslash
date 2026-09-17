"""Abstracao de biblioteca de musicas.

A API nunca toca no filesystem diretamente: ela conversa com um SongStorage.
Isso e o que permite rodar a mesma aplicacao lendo songs/ em dev e lendo um
CDN em producao, onde o filesystem da function e efemero.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class SongStorage(ABC):
    """Contrato de acesso a biblioteca."""

    #: Identificador do backend de storage, exposto na API para diagnostico.
    kind: str = "abstract"

    @abstractmethod
    def list_songs(self) -> tuple[list[dict], list[str]]:
        """Devolve (resumos, erros). Erros nunca derrubam a listagem."""

    @abstractmethod
    def get_song(self, song_id: str) -> dict | None:
        """Resumo de uma musica, ou None se nao existir."""

    @abstractmethod
    def get_chart(self, song_id: str, instrument: str, difficulty: str) -> dict | None:
        """Chart convertido, ou None se a combinacao nao existir."""

    def file_path(self, song_id: str, filename: str) -> Path | None:
        """Caminho local do arquivo, quando o storage for local."""
        return None

    def file_url(self, song_id: str, filename: str) -> str:
        """URL publica do arquivo."""
        return f"/api/songs/{song_id}/files/{filename}"

    def invalidate(self) -> None:
        """Descarta caches. Usado pelo endpoint de rescan."""
