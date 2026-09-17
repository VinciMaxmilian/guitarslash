"""Copia a decoracao (revistas) para dentro do frontend.

    python main.py assets

As imagens ficam em magazines/ na raiz, que e conteudo do usuario e nao vai
para o repositorio. Este comando copia para frontend/public/magazines/, de
onde o Vite serve em dev e no build, e escreve um index.json para o frontend
saber o que existe sem precisar de backend.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from ..config import ROOT

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".avif")

SOURCE = ROOT / "magazines"
TARGET = ROOT / "frontend" / "public" / "magazines"


def sync(source: Path = SOURCE, target: Path = TARGET) -> list[str]:
    if not source.is_dir():
        return []

    target.mkdir(parents=True, exist_ok=True)

    names: list[str] = []
    for path in sorted(source.iterdir(), key=lambda p: p.name.lower()):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        destination = target / path.name
        # Copia so quando mudou, para nao invalidar o cache do Vite a toa.
        if not destination.exists() or destination.stat().st_mtime_ns < path.stat().st_mtime_ns:
            shutil.copy2(path, destination)
        names.append(path.name)

    # Remove o que nao existe mais na origem.
    for path in target.iterdir():
        if path.is_file() and path.name != "index.json" and path.name not in names:
            path.unlink()

    (target / "index.json").write_text(json.dumps({"magazines": names}), encoding="utf-8")
    return names


def main() -> None:
    parser = argparse.ArgumentParser(prog="assets")
    parser.add_argument("--source", type=Path, default=SOURCE)
    args = parser.parse_args()

    names = sync(args.source)
    if not names:
        print(f"nenhuma imagem encontrada em {args.source}")
        print("coloque as capas em magazines/ e rode de novo")
        return

    print(f"{len(names)} imagem(ns) copiada(s) para {TARGET}")
    for name in names:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
