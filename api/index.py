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

#: Parametro de escape para plataforma que engole o caminho original.
#:
#: Contexto: o `rewrites` da Vercel SUBSTITUI o caminho pelo destino, entao a
#: function recebia sempre `/api/index` e o FastAPI respondia 404 para tudo.
#: A configuracao do repositorio resolve isso sem gambiarra (DEPLOY.md, secao
#: 1.6). Este parametro e o plano B, ativado somente pelo vercel.json:
#:
#:     { "rewrites": [
#:         { "source": "/api/:path*", "destination": "/api/index?__p=:path*" }
#:     ] }
#:
#: Com isso o caminho viaja na query string e e restaurado aqui. Sem o
#: parametro na URL, este middleware nao faz absolutamente nada.
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
            path = "/api/" + restored.lstrip("/")
            scope = dict(scope)
            scope["path"] = path
            scope["raw_path"] = path.encode("latin-1")
            scope["query_string"] = urlencode(remaining).encode("latin-1")

        await self.app(scope, receive, send)


app = create_app()
# Adicionado por ultimo = camada mais externa: o caminho e corrigido antes do
# CORS e antes do roteamento.
app.add_middleware(RestoreOriginalPath)
