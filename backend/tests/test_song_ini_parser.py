from __future__ import annotations

from pathlib import Path

from backend.app.parsers.song_ini_parser import metadata_from_ini, parse_song_ini


def write(tmp_path: Path, content: str, encoding: str = "utf-8") -> Path:
    path = tmp_path / "song.ini"
    path.write_text(content, encoding=encoding)
    return path


def test_le_campos_basicos(tmp_path: Path):
    path = write(
        tmp_path,
        "[song]\nname = Bulls\nartist = RATM\nsong_length = 313000\n",
    )
    data = parse_song_ini(path)
    assert data["name"] == "Bulls"
    assert data["artist"] == "RATM"
    assert data["song_length"] == 313000


def test_secao_com_caixa_diferente(tmp_path: Path):
    path = write(tmp_path, "[Song]\nName = Teste\nARTIST = Banda\n")
    data = parse_song_ini(path)
    assert data["name"] == "Teste"
    assert data["artist"] == "Banda"


def test_arquivo_sem_cabecalho_de_secao(tmp_path: Path):
    path = write(tmp_path, "name = Sem Secao\nartist = Banda\n")
    data = parse_song_ini(path)
    assert data["name"] == "Sem Secao"


def test_chave_duplicada_nao_quebra(tmp_path: Path):
    path = write(tmp_path, "[song]\nname = Primeiro\nname = Segundo\n")
    assert parse_song_ini(path)["name"] == "Segundo"


def test_encoding_latino(tmp_path: Path):
    path = write(tmp_path, "[song]\nname = Coração\nartist = Banda\n", encoding="cp1252")
    assert parse_song_ini(path)["name"] == "Coração"


def test_valor_numerico_sujo(tmp_path: Path):
    path = write(tmp_path, "[song]\nsong_length = 313000.0\npreview_start_time = abc\n")
    data = parse_song_ini(path)
    assert data["song_length"] == 313000
    assert "preview_start_time" not in data


def test_alias_frets_vira_charter(tmp_path: Path):
    path = write(tmp_path, "[song]\nfrets = Alguem\n")
    assert parse_song_ini(path)["charter"] == "Alguem"


def test_metadata_converte_milissegundos_para_segundos():
    meta = metadata_from_ini(
        {"name": "X", "artist": "Y", "song_length": 313000, "preview_start_time": 30000}
    )
    assert meta["duration"] == 313.0
    assert meta["preview_start"] == 30.0


def test_metadata_tolera_ini_vazio():
    meta = metadata_from_ini({})
    assert meta["title"] == ""
    assert meta["duration"] == 0.0
    assert meta["delay"] == 0.0


def test_ini_completamente_invalido_nao_levanta(tmp_path: Path):
    path = write(tmp_path, "]]] lixo [[[\nname = Ainda Leio\n")
    assert parse_song_ini(path).get("name") == "Ainda Leio"
