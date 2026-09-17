from __future__ import annotations

from pathlib import Path

from backend.app.services.library import find_song_folders, parse_folder, slugify
from backend.app.storage.local import LocalSongStorage


def test_slugify():
    assert slugify("Bulls on Parade") == "bulls-on-parade"
    assert slugify("Ação/Coração") == "acao-coracao"
    assert slugify("!!!") == "song"


def test_encontra_musicas_por_song_ini(song_dir: Path):
    folders = {f.path.name for f in find_song_folders(song_dir)}
    assert folders == {"The Test Band - Slash Test", "Broken Song"}


def test_ignora_pasta_sem_song_ini(tmp_path: Path):
    (tmp_path / "vazia").mkdir()
    assert find_song_folders(tmp_path) == []


def test_diretorio_inexistente_devolve_lista_vazia(tmp_path: Path):
    assert find_song_folders(tmp_path / "nao-existe") == []


def test_inventario_de_arquivos(song_dir: Path):
    folder = next(f for f in find_song_folders(song_dir) if f.path.name.startswith("The Test"))
    assert folder.files["chart"] == "notes.mid"
    assert folder.files["cover"] == "album.jpg"
    assert folder.files["video"] == "background.mp4"
    assert folder.audio["song"] == "song.opus"
    assert folder.missing == []


def test_arquivo_faltando_vira_missing_sem_quebrar(song_dir: Path):
    folder = next(f for f in find_song_folders(song_dir) if f.path.name == "Broken Song")
    summary, parsed = parse_folder(folder)
    assert parsed is None
    assert "notes.mid" in summary["missing"]
    assert "song.opus" in summary["missing"]
    assert summary["title"] == "Broken"


def test_metadata_vem_do_ini(song_dir: Path):
    folder = next(f for f in find_song_folders(song_dir) if f.path.name.startswith("The Test"))
    summary, _ = parse_folder(folder)
    assert summary["title"] == "Slash Test"
    assert summary["artist"] == "The Test Band"
    assert summary["duration"] == 12.0
    assert summary["preview_start"] == 3.0
    assert summary["has_background_video"] is True
    assert summary["has_cover"] is True


def test_instrumentos_detectados_automaticamente(song_dir: Path):
    folder = next(f for f in find_song_folders(song_dir) if f.path.name.startswith("The Test"))
    summary, _ = parse_folder(folder)
    assert set(summary["instruments"]) == {"guitar", "bass"}


def test_fingerprint_muda_quando_arquivo_muda(song_dir: Path):
    folder = next(f for f in find_song_folders(song_dir) if f.path.name.startswith("The Test"))
    antes = folder.fingerprint
    (folder.path / "song.opus").write_bytes(b"OggS-fake-audio-maior")
    assert folder.fingerprint != antes


# ------------------------------------------------------------------ storage


def test_storage_lista_e_ordena(song_dir: Path, tmp_path: Path):
    storage = LocalSongStorage(song_dir, cache_dir=tmp_path / "cache")
    songs, errors = storage.list_songs()
    assert errors == []
    assert [s["title"] for s in songs] == ["Broken", "Slash Test"]


def test_storage_monta_urls_de_assets(song_dir: Path, tmp_path: Path):
    storage = LocalSongStorage(song_dir, cache_dir=tmp_path / "cache")
    song = storage.get_song("the-test-band-slash-test")
    assert song is not None
    assert song["assets"]["cover"].endswith("/files/album.jpg")
    assert song["assets"]["audio"]["song"].endswith("/files/song.opus")
    assert song["assets"]["background_video"].endswith("/files/background.mp4")


def test_storage_nao_vaza_campos_internos(song_dir: Path, tmp_path: Path):
    storage = LocalSongStorage(song_dir, cache_dir=tmp_path / "cache")
    song = storage.get_song("the-test-band-slash-test")
    assert not any(k.startswith("_") for k in song)


def test_storage_serve_chart(song_dir: Path, tmp_path: Path):
    storage = LocalSongStorage(song_dir, cache_dir=tmp_path / "cache")
    chart = storage.get_chart("the-test-band-slash-test", "guitar", "expert")
    assert chart["note_count"] == 7


def test_storage_bloqueia_path_traversal(song_dir: Path, tmp_path: Path):
    storage = LocalSongStorage(song_dir, cache_dir=tmp_path / "cache")
    assert storage.file_path("the-test-band-slash-test", "../Broken Song/song.ini") is None


def test_storage_usa_cache_em_disco(song_dir: Path, tmp_path: Path):
    cache = tmp_path / "cache"
    LocalSongStorage(song_dir, cache_dir=cache).list_songs()
    assert (cache / "library.json").exists()

    # Segundo storage le do cache e chega ao mesmo resultado.
    songs, _ = LocalSongStorage(song_dir, cache_dir=cache).list_songs()
    assert [s["title"] for s in songs] == ["Broken", "Slash Test"]
