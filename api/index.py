"""Entrypoint da Vercel.

A Vercel detecta `app` como aplicacao ASGI. O `vercel.json` manda todas as
rotas para este arquivo.

O mesmo `create_app` e usado pelo modo host local (backend/app/host.py),
entao nao ha duas versoes do backend para manter.

`app` precisa continuar sendo a instancia do FastAPI: o builder da Vercel
inspeciona esse objeto para decidir entre ASGI e WSGI, e um callable qualquer
pode nao ser reconhecido. Por isso o ajuste de caminho abaixo entra como
middleware, e nao como wrapper em volta de `app`.
"""

import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

# A Vercel executa a function a partir da raiz do projeto; garantimos que
# o pacote `backend` esteja importavel tambem em execucao local direta.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import create_app  # noqa: E402

#: Parametro que carrega o caminho original quando a plataforma o substitui.
#:
#: O `rewrites` da Vercel SUBSTITUI o caminho pelo destino: a function recebe
#: sempre `/api/index` e o FastAPI responde 404 para tudo. Em vez de depender
#: de a plataforma preservar o caminho, mandamos o caminho na query string e
#: restauramos aqui. O `vercel.json` faz a parte dele:
#:
#:     { "rewrites": [
#:         { "source": "/(.*)", "destination": "/api/index?__p=$1" }
#:     ] }
#:
#: Sem o parametro na URL este middleware nao faz absolutamente nada, entao
#: ele pode ficar ligado em qualquer ambiente (dev, modo host, testes).
ORIGINAL_PATH_PARAM = "__p"


class RestoreOriginalPath:
    """Devolve o caminho real ao request quando ele veio na query string."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        raw_query = scope.get("query_string") or b""
        if ORIGINAL_PATH_PARAM.encode() not in raw_query:
            await self.app(scope, receive, send)
            return

        pairs = parse_qsl(raw_query.decode("latin-1"), keep_blank_values=True)
        restored = None
        remaining = []
        for key, value in pairs:
            if key == ORIGINAL_PATH_PARAM and restored is None:
                restored = value
            else:
                remaining.append((key, value))

        if restored is not None:
            # O parametro carrega o caminho COMPLETO, e nao so o trecho depois
            # de /api: assim /openapi.json e /docs tambem sobrevivem.
            path = "/" + restored.lstrip("/")
            scope = dict(scope)
            scope["path"] = path
            scope["raw_path"] = path.encode("latin-1")
            scope["query_string"] = urlencode(remaining).encode("latin-1")

        await self.app(scope, receive, send)


app = create_app()
# Adicionado por ultimo = camada mais externa: o caminho e corrigido antes do
# CORS e antes do roteamento.
app.add_middleware(RestoreOriginalPath)
