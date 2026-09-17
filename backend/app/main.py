"""Aplicacao FastAPI do Guitar Slash.

O mesmo `create_app` roda em tres lugares:

    - dev local        (uvicorn backend.app.main:app --reload)
    - Vercel           (api/index.py)
    - modo host LAN    (backend/app/host.py, que tambem serve o frontend)
"""

from __future__ import annotations

if __name__ == "__main__":
    # Armadilha comum: existem dois main.py. Este e o modulo da aplicacao e
    # so funciona importado como pacote. O CLI fica na raiz do projeto.
    raise SystemExit(
        'Este arquivo e o modulo da aplicacao, nao o CLI. Rode a partir da RAIZ do projeto: python main.py runserver'
    )


import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .api.songs import router as songs_router
from .multiplayer import router as multiplayer_router
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
        allow_methods=["GET", "HEAD", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )

    app.include_router(songs_router)
    app.include_router(multiplayer_router)

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


#: Marca injetada no index.html servido pelo modo host.
#:
#: Existe porque o MESMO frontend/dist roda em dois lugares: no Netlify (onde
#: VITE_API_URL aponta para a Vercel) e na maquina do host (onde tudo e mesma
#: origem). Se a deteccao dependesse de variavel de build, um dist buildado
#: para o Netlify tentaria falar com a Vercel rodando na LAN - e o multiplayer
#: nao funcionaria offline. Com a marca, um build serve os dois casos.
HOST_MARKER = "<script>window.__GUITARSLASH_HOST__=true</script>"


def _host_index_html() -> str:
    """index.html do dist com a marca de modo host injetada."""
    html = (FRONTEND_DIST / "index.html").read_text(encoding="utf-8")
    if HOST_MARKER in html:
        return html
    if "</head>" in html:
        return html.replace("</head>", HOST_MARKER + "</head>", 1)
    return HOST_MARKER + html


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

    # Lido uma vez: o dist nao muda com o processo rodando.
    index_html = _host_index_html()
    dist_root = FRONTEND_DIST.resolve()
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    def index_response() -> HTMLResponse:
        return HTMLResponse(index_html, headers={"Cache-Control": "no-cache"})

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file():
            try:
                candidate.relative_to(dist_root)
            except ValueError:
                # Tentativa de sair do dist (../): devolve o SPA, nao o arquivo.
                return index_response()
            return FileResponse(candidate)
        return index_response()


app = create_app()
