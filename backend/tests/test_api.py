from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app

SONG_ID = "the-test-band-slash-test"


@pytest.fixture
def client(song_dir: Path, tmp_path: Path) -> TestClient:
    settings = Settings(
        songs_dir=song_dir,
        allowed_origins=("http://localhost:5173",),
        storage="local",
        assets_base_url="",
        cache_dir=tmp_path / "cache",
    )
    return TestClient(create_app(settings))


def test_health(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["storage"] == "local"


def test_lista_musicas(client: TestClient):
    payload = client.get("/api/songs").json()
    assert payload["count"] == 2
    assert payload["storage"] == "local"
    titulos = [s["title"] for s in payload["songs"]]
    assert "Slash Test" in titulos


def test_resposta_em_camel_case(client: TestClient):
    song = client.get(f"/api/songs/{SONG_ID}").json()
    assert "hasBackgroundVideo" in song
    assert "previewStart" in song
    assert song["hasBackgroundVideo"] is True


def test_instrumentos_apenas_os_existentes(client: TestClient):
    song = client.get(f"/api/songs/{SONG_ID}").json()
    assert set(song["instruments"]) == {"guitar", "bass"}
    assert song["instruments"]["guitar"]["difficulties"] == ["hard", "expert"]


def test_musica_inexistente_404(client: TestClient):
    assert client.get("/api/songs/nao-existe").status_code == 404


def test_chart_completo(client: TestClient):
    chart = client.get(f"/api/songs/{SONG_ID}/chart/guitar/expert").json()
    assert chart["noteCount"] == 7
    assert chart["notes"][0]["lane"] == 0
    assert chart["starPower"][0]["duration"] == pytest.approx(1.5)


def test_chart_sem_notas_404(client: TestClient):
    assert client.get(f"/api/songs/{SONG_ID}/chart/guitar/easy").status_code == 404


def test_dificuldade_invalida_400(client: TestClient):
    assert client.get(f"/api/songs/{SONG_ID}/chart/guitar/insane").status_code == 400


def test_instrumento_nao_suportado_400(client: TestClient):
    assert client.get(f"/api/songs/{SONG_ID}/chart/vocals/expert").status_code == 400


def test_lista_charts_disponiveis(client: TestClient):
    payload = client.get(f"/api/songs/{SONG_ID}/chart").json()
    assert set(payload["instruments"]) == {"guitar", "bass"}


def test_assets(client: TestClient):
    assets = client.get(f"/api/songs/{SONG_ID}/assets").json()
    assert assets["cover"].endswith("album.jpg")
    assert assets["audio"]["song"].endswith("song.opus")


def test_serve_arquivo(client: TestClient):
    response = client.get(f"/api/songs/{SONG_ID}/files/song.opus")
    assert response.status_code == 200
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-type"] == "audio/ogg"


def test_range_request_devolve_206(client: TestClient):
    response = client.get(
        f"/api/songs/{SONG_ID}/files/song.opus", headers={"Range": "bytes=0-3"}
    )
    assert response.status_code == 206
    assert response.content == b"OggS"
    assert response.headers["content-range"].startswith("bytes 0-3/")


def test_range_sufixo(client: TestClient):
    response = client.get(
        f"/api/songs/{SONG_ID}/files/song.opus", headers={"Range": "bytes=-5"}
    )
    assert response.status_code == 206
    assert response.content == b"audio"


def test_range_fora_do_arquivo_416(client: TestClient):
    response = client.get(
        f"/api/songs/{SONG_ID}/files/song.opus", headers={"Range": "bytes=9999-"}
    )
    assert response.status_code == 416


def test_arquivo_inexistente_404(client: TestClient):
    assert client.get(f"/api/songs/{SONG_ID}/files/nada.opus").status_code == 404


def test_path_traversal_bloqueado(client: TestClient):
    response = client.get(f"/api/songs/{SONG_ID}/files/..%2F..%2Fsong.ini")
    assert response.status_code == 404


def test_musica_quebrada_aparece_com_missing(client: TestClient):
    payload = client.get("/api/songs").json()
    broken = next(s for s in payload["songs"] if s["title"] == "Broken")
    assert "notes.mid" in broken["missing"]
    assert broken["instruments"] == {}


def test_rescan(client: TestClient):
    assert client.post("/api/songs/rescan").json()["count"] == 2


def test_cors_liberado_para_origem_configurada(client: TestClient):
    response = client.get("/api/songs", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_404_informa_o_caminho_recebido(client: TestClient):
    """Sem isto, proxy mal configurado da apenas "Not Found" e nada mais."""
    response = client.get("/api/nao-existe")
    assert response.status_code == 404
    body = response.json()
    assert body["path"] == "/api/nao-existe"
    assert "hint" not in body


def test_404_no_destino_do_rewrite_explica_o_problema(client: TestClient):
    """O `rewrites` da Vercel troca o caminho pelo destino e tudo virava 404.

    Quando o caminho que chega e o proprio destino, o 404 diz que a culpa e da
    camada de rewrite - e nao das rotas da aplicacao.
    """
    for path in ("/api/index", "/api"):
        body = client.get(path).json()
        assert body["path"] == path
        assert "rewrite" in body["hint"]


def test_rotas_reais_respondem_no_caminho_pedido(client: TestClient):
    """Guarda contra regressao de roteamento: o caminho pedido e o que vale."""
    for path in ("/api/health", "/api/songs", "/openapi.json"):
        assert client.get(path).status_code == 200, path
