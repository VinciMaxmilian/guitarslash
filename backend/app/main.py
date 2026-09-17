"""Aplicacao FastAPI do Guitar Slash.

O mesmo `create_app` roda em tres lugares:

    - dev local        (uvicorn backend.app.main:app --reload)
    - Vercel           (api/index.py)
    - modo host LAN    (backend/app/host.py, que tambem serve o frontend)
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.songs import router as songs_router
from .config import ROOT, Settings, load_settings
from .storage import create_storage

logging.basicConfig(level=logging.INFO)

FRONTEND_DIST = ROOT / "frontend" / "dist"


def create_app(settings: Settings | None = None, serve_frontend: bool = False) -> FastAPI:
    settings = settings or load_settings()

    app = FastAPI(
        title="Guitar Slash API",
        version="0.1.0",
        description="Biblioteca de musicas, charts e assets do Guitar Slash.",
    )
    app.state.settings = settings
    app.state.storage = create_storage(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )

    app.include_router(songs_router)

    @app.get("/api/health", tags=["health"])
    def health() -> dict:
        storage = app.state.storage
        return {
            "status": "ok",
            "storage": storage.kind,
            "songsDir": str(settings.songs_dir) if storage.kind == "local" else None,
        }

    if serve_frontend:
        _mount_frontend(app)

    return app


def _mount_frontend(app: FastAPI) -> None:
    """Modo host: a mesma origem serve SPA, API e assets.

    E isso que elimina CORS, mixed content e certificado no multiplayer LAN.
    """
    if not FRONTEND_DIST.exists():
        logging.warning(
            "frontend/dist nao encontrado; rode `npm run build` em frontend/ "
            "antes de usar o modo host"
        )
        return

    index = FRONTEND_DIST / "index.html"
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file():
            try:
                candidate.relative_to(FRONTEND_DIST.resolve())
            except ValueError:
                return FileResponse(index)
            return FileResponse(candidate)
        return FileResponse(index)


app = create_app()
