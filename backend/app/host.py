"""Modo host: sobe backend + frontend na mesma origem, na rede local.

    python main.py host --port 8000        (recomendado)
    python -m backend.app.host --port 8000  (equivalente)

Serve o SPA buildado, a API, os assets das musicas e o WebSocket da partida.
Origem unica = sem CORS, sem mixed content, sem certificado - e e por isso que
o multiplayer LAN passa por aqui e nao pela Vercel.
"""

from __future__ import annotations

import argparse
import socket

import uvicorn

from .config import load_settings
from .main import FRONTEND_DIST, create_app


def lan_ip() -> str:
    """IP da maquina na rede local. Nao envia pacote algum."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def banner(host: str, port: int) -> str:
    ip = lan_ip() if host == "0.0.0.0" else host
    settings = load_settings()
    lines = [
        "",
        "  GUITAR SLASH - MODO HOST",
        "  " + "-" * 44,
        f"  Nesta maquina:   http://localhost:{port}",
        f"  Na rede local:   http://{ip}:{port}",
        f"  Biblioteca:      {settings.songs_dir}",
        "",
    ]
    if not FRONTEND_DIST.exists():
        lines += [
            "  AVISO: frontend/dist nao existe.",
            "  Rode:  cd frontend && npm install && npm run build",
            "",
        ]
    lines += [
        "  O firewall pode pedir autorizacao na primeira execucao.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(prog="guitarslash host")
    parser.add_argument("--host", default="0.0.0.0", help="interface (default: todas)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="recarrega ao editar o backend")
    args = parser.parse_args()

    print(banner(args.host, args.port))

    if args.reload:
        uvicorn.run(
            "backend.app.host:create_host_app",
            factory=True,
            host=args.host,
            port=args.port,
            reload=True,
        )
    else:
        uvicorn.run(create_host_app(), host=args.host, port=args.port)


def create_host_app():
    return create_app(serve_frontend=True)


if __name__ == "__main__":
    main()
