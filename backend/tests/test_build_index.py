"""Testes do gerador do pacote estatico da biblioteca (para o CDN)."""

from __future__ import annotations

import json
from pathlib import Path

from backend.app.tools.build_index import build

SONG_ID = "the-test-band-slash-test"


def ler_indice(out: Path) -> dict:
    return json.loads((out / "index.json").read_text(encoding="utf-8"))


def musica(indice: dict, song_id: str = SONG_ID) -> dict:
    return next(s for s in indice["songs"] if s["id"] == song_id)


def test_gera_indice_e_charts(song_dir: Path, tmp_path: Path):
    out = tmp_path / "dist"
    resultado = build(song_dir, out, copy_assets=False)

    assert resultado["charts"] > 0
    indice = ler_indice(out)
    assert indice["count"] == resultado["songs"]
    assert (out / "charts" / SONG_ID / "guitar" / "expert.json").is_file()


def test_chart_gerado_tem_notas(song_dir: Path, tmp_path: Path):
    out = tmp_path / "dist"
    build(song_dir, out, copy_assets=False)
    chart = json.loads(
        (out / "charts" / SONG_ID / "guitar" / "expert.json").read_text(encoding="utf-8")
    )
    assert chart["song_id"] == SONG_ID
    assert len(chart["notes"]) > 0


def test_sem_copy_assets_nao_copia_midia(song_dir: Path, tmp_path: Path):
    out = tmp_path / "dist"
    build(song_dir, out, copy_assets=False)
    assert not (out / "songs").exists()


def test_copy_assets_copia_audio_video_e_capa(song_dir: Path, tmp_path: Path):
    out = tmp_path / "dist"
    resultado = build(song_dir, out, copy_assets=True)

    destino = out / "songs" / SONG_ID
    nomes = {f.name for f in destino.iterdir()}
    assert "song.opus" in nomes
    assert "background.mp4" in nomes
    assert "album.jpg" in nomes
    assert resultado["copiedBytes"] > 0
    assert resultado["droppedVideo"] == 0


def test_skip_video_nao_copia_o_video(song_dir: Path, tmp_path: Path):
    out = tmp_path / "dist"
    resultado = build(song_dir, out, copy_assets=True, skip_video=True)

    nomes = {f.name for f in (out / "songs" / SONG_ID).iterdir()}
    assert "background.mp4" not in nomes
    # O resto continua indo.
    assert "song.opus" in nomes
    assert "album.jpg" in nomes
    assert resultado["droppedVideo"] == 1


def test_skip_video_tira_o_video_do_indice(song_dir: Path, tmp_path: Path):
    """Nao basta deixar de copiar.

    Se o index.json continuasse anunciando o video, o RemoteSongStorage
    montaria a URL dele e o navegador tomaria 404 em toda partida.
    """
    out = tmp_path / "dist"
    build(song_dir, out, copy_assets=True, skip_video=True)
    assert "video" not in musica(ler_indice(out))["_files"]


def test_sem_skip_video_o_indice_anuncia_o_video(song_dir: Path, tmp_path: Path):
    out = tmp_path / "dist"
    build(song_dir, out, copy_assets=False)
    assert musica(ler_indice(out))["_files"]["video"] == "background.mp4"


def test_skip_video_sem_copy_assets_so_mexe_no_indice(song_dir: Path, tmp_path: Path):
    out = tmp_path / "dist"
    build(song_dir, out, copy_assets=False, skip_video=True)
    assert "video" not in musica(ler_indice(out))["_files"]
    assert not (out / "songs").exists()


def test_pacote_gerado_alimenta_o_storage_remoto(song_dir: Path, tmp_path: Path):
    """O que o build gera tem que ser exatamente o que o backend le do CDN."""
    import functools
    import http.server
    import threading

    from backend.app.storage.remote import RemoteSongStorage

    out = tmp_path / "dist"
    build(song_dir, out, copy_assets=True, skip_video=True)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(out))
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    porta = servidor.server_address[1]
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    try:
        storage = RemoteSongStorage(f"http://127.0.0.1:{porta}")
        musicas, erros = storage.list_songs()
        assert erros == []
        assert len(musicas) == 2

        alvo = next(m for m in musicas if m["id"] == SONG_ID)
        # Video fora do pacote -> o backend nao pode oferecer URL de video.
        assert alvo["assets"]["background_video"] is None
        assert alvo["assets"]["audio"]["song"].endswith("/songs/" + SONG_ID + "/song.opus")

        chart = storage.get_chart(SONG_ID, "guitar", "expert")
        assert chart is not None and len(chart["notes"]) > 0
    finally:
        servidor.shutdown()
