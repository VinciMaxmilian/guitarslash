"""Gera o pacote estatico da biblioteca para publicar em object storage/CDN.

    python -m backend.app.tools.build_index --out dist-songs

Saida:

    dist-songs/index.json
    dist-songs/charts/<song_id>/<instrument>/<difficulty>.json
    dist-songs/songs/<song_id>/<arquivos>       (com --copy-assets)

Assim a function em producao nao faz parse de MIDI: ela so le JSON pronto.
Os arquivos pesados (audio, video) sao enviados ao bucket, nunca ao deploy.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from ..config import load_settings
from ..parsers.midi_parser import SUPPORTED_INSTRUMENTS, build_chart, parse_midi
from ..services.library import find_song_folders, parse_folder


def build(songs_dir: Path, out_dir: Path, copy_assets: bool) -> dict:
    charts_dir = out_dir / "charts"
    out_dir.mkdir(parents=True, exist_ok=True)

    summaries: list[dict] = []
    written = 0
    skipped: list[str] = []

    for folder in find_song_folders(songs_dir):
        summary, parsed = parse_folder(folder)
        summaries.append(summary)

        if parsed is None:
            skipped.append(f"{folder.id}: chart ilegivel")
            continue

        for instrument, info in summary["instruments"].items():
            if instrument not in SUPPORTED_INSTRUMENTS:
                continue
            for difficulty in info.get("difficulties", []):
                chart = build_chart(parsed, instrument, difficulty)
                chart["song_id"] = folder.id
                target = charts_dir / folder.id / instrument / f"{difficulty}.json"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(chart, separators=(",", ":")), encoding="utf-8")
                written += 1

        if copy_assets:
            destination = out_dir / "songs" / folder.id
            destination.mkdir(parents=True, exist_ok=True)
            for name in {*folder.files.values(), *folder.audio.values()}:
                source = folder.path / name
                if source.is_file():
                    shutil.copy2(source, destination / name)

    index = {"version": 1, "count": len(summaries), "songs": summaries}
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")

    return {"songs": len(summaries), "charts": written, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(prog="build_index")
    parser.add_argument("--songs-dir", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=Path("dist-songs"))
    parser.add_argument(
        "--copy-assets",
        action="store_true",
        help="copia audio/video/capa para a saida (grande; prefira subir direto ao bucket)",
    )
    args = parser.parse_args()

    songs_dir = args.songs_dir or load_settings().songs_dir
    result = build(songs_dir, args.out, args.copy_assets)

    print(f"musicas: {result['songs']}")
    print(f"charts:  {result['charts']}")
    for item in result["skipped"]:
        print(f"  ignorado -> {item}")
    print(f"saida:   {args.out.resolve()}")
    print()
    print("Publique o conteudo no bucket e aponte GUITARSLASH_ASSETS_BASE_URL para ele.")
    print("O bucket precisa de CORS para o dominio do frontend e de Range requests.")


if __name__ == "__main__":
    main()
