"""Entrypoint da Vercel.

A Vercel detecta `app` como aplicacao ASGI. Todas as rotas vivem sob /api,
e o vercel.json reescreve tudo para este arquivo.

O mesmo `create_app` e usado pelo modo host local (backend/app/host.py),
entao nao ha duas versoes do backend para manter.
"""

import sys
from pathlib import Path

# A Vercel executa a function a partir da raiz do projeto; garantimos que
# o pacote `backend` esteja importavel tambem em execucao local direta.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import create_app  # noqa: E402

app = create_app()
