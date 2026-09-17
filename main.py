#!/usr/bin/env python
"""CLI do Guitar Slash.

    python main.py runserver              backend em dev (com reload)
    python main.py runserver --port 9000
    python main.py host                   backend + frontend na mesma origem (LAN)
    python main.py demo                   gera a musica de demonstracao
    python main.py assets                 copia magazines/ para dentro do frontend
    python main.py build-index            gera o pacote da biblioteca para o CDN
    python main.py test                   roda os testes do backend
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def cmd_runserver(args: argparse.Namespace) -> int:
    import uvicorn

    from backend.app.config import load_settings

    settings = load_settings()
    print()
    print("  GUITAR SLASH - BACKEND")
    print("  " + "-" * 44)
    print(f"  API:         http://{args.host}:{args.port}/api/songs")
    print(f"  Docs:        http://{args.host}:{args.port}/docs")
    print(f"  Biblioteca:  {settings.songs_dir}")
    print(f"  Storage:     {settings.storage}")
    print()
    print("  Frontend em dev:  cd frontend && npm run dev")
    print()

    uvicorn.run(
        "backend.app.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
        reload_dirs=[str(ROOT / "backend")],
    )
    return 0


def cmd_host(args: argparse.Namespace) -> int:
    from backend.app.host import main as host_main

    sys.argv = ["guitarslash host", "--host", args.host, "--port", str(args.port)]
    if args.reload:
        sys.argv.append("--reload")
    host_main()
    return 0


def cmd_demo(_: argparse.Namespace) -> int:
    from backend.app.tools.make_demo_song import main as demo_main

    sys.argv = ["make_demo_song"]
    demo_main()
    return 0


def cmd_assets(_: argparse.Namespace) -> int:
    from backend.app.tools.sync_decor import main as sync_main

    sys.argv = ["assets"]
    sync_main()
    return 0


def cmd_build_index(args: argparse.Namespace) -> int:
    from backend.app.tools.build_index import main as build_main

    sys.argv = ["build_index", "--out", str(args.out)]
    if args.copy_assets:
        sys.argv.append("--copy-assets")
    if args.skip_video:
        sys.argv.append("--skip-video")
    build_main()
    return 0


def cmd_test(_: argparse.Namespace) -> int:
    return subprocess.call([sys.executable, "-m", "pytest", "backend/tests", "-q"], cwd=ROOT)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python main.py", description="Guitar Slash")
    sub = parser.add_subparsers(dest="command")

    run = sub.add_parser("runserver", help="sobe o backend em modo desenvolvimento")
    run.add_argument("--host", default="127.0.0.1")
    run.add_argument("--port", type=int, default=8000)
    run.add_argument("--no-reload", action="store_true", help="desliga o auto-reload")
    run.set_defaults(func=cmd_runserver)

    host = sub.add_parser("host", help="serve backend + frontend na mesma origem (LAN)")
    host.add_argument("--host", default="0.0.0.0")
    host.add_argument("--port", type=int, default=8000)
    host.add_argument("--reload", action="store_true")
    host.set_defaults(func=cmd_host)

    demo = sub.add_parser("demo", help="gera a musica de demonstracao")
    demo.set_defaults(func=cmd_demo)

    assets = sub.add_parser("assets", help="copia magazines/ para dentro do frontend")
    assets.set_defaults(func=cmd_assets)

    index = sub.add_parser("build-index", help="gera o pacote da biblioteca para o CDN")
    index.add_argument("--out", type=Path, default=Path("dist-songs"))
    index.add_argument("--copy-assets", action="store_true")
    index.add_argument(
        "--skip-video",
        action="store_true",
        help="deixa o video de fundo fora do pacote e do indice",
    )
    index.set_defaults(func=cmd_build_index)

    test = sub.add_parser("test", help="roda os testes do backend")
    test.set_defaults(func=cmd_test)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    return args.func(args) or 0


if __name__ == "__main__":
    raise SystemExit(main())
