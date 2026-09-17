"""Entrega de arquivos com suporte a Range requests.

Sem Range o navegador nao consegue dar seek em audio e video, e o
VideoEngine nao consegue corrigir sincronia. O Starlette so ganhou suporte
a Range recentemente, entao implementamos aqui para nao depender da versao.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterator

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

CHUNK_SIZE = 256 * 1024

MEDIA_TYPES = {
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mid": "audio/midi",
    ".midi": "audio/midi",
    ".ini": "text/plain; charset=utf-8",
}

_RANGE_RE = re.compile(r"^bytes=(?P<start>\d*)-(?P<end>\d*)$")


def media_type_for(path: Path) -> str:
    return MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")


def _iter_file(path: Path, start: int, length: int) -> Iterator[bytes]:
    with path.open("rb") as handle:
        handle.seek(start)
        remaining = length
        while remaining > 0:
            chunk = handle.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def file_response(path: Path, request: Request):
    """FileResponse normal, ou 206 parcial quando houver header Range."""
    size = path.stat().st_size
    media_type = media_type_for(path)
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"},
        )

    match = _RANGE_RE.match(range_header.strip())
    if not match:
        raise HTTPException(status_code=416, detail="Range invalido")

    raw_start, raw_end = match.group("start"), match.group("end")
    if raw_start == "":
        # bytes=-N -> ultimos N bytes
        if raw_end == "":
            raise HTTPException(status_code=416, detail="Range invalido")
        length = min(int(raw_end), size)
        start = size - length
        end = size - 1
    else:
        start = int(raw_start)
        end = int(raw_end) if raw_end else size - 1

    if start >= size or start > end:
        raise HTTPException(
            status_code=416,
            detail="Range fora do arquivo",
            headers={"Content-Range": f"bytes */{size}"},
        )

    end = min(end, size - 1)
    length = end - start + 1

    return StreamingResponse(
        _iter_file(path, start, length),
        status_code=206,
        media_type=media_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(length),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        },
    )
