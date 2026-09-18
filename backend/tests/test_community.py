"""Testes do endpoint de charts da comunidade.

O foco esta na validacao do caminho: e ela que impede SSRF (usar a function
como proxy) e path traversal.
"""

from __future__ import annotations

import functools
import http.server
import shutil
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.api import community
from backend.app.config import Settings
from backend.app.main import create_app

UID = "0a1b2c3d"
SLUG = "musica-da-comunidade"
OBJ = f"{UID}/{SLUG}/notes.mid"


@pytest.fixture(autouse=True)
def cache_limpo():
    community.clear_cache()
    yield
    community.clear_cache()


@pytest.fixture
def bucket(song_dir: Path, tmp_path: Path) -> str:
    """Servidor estatico fazendo o papel do Supabase Storage."""
    raiz = tmp_path / "bucket"
    destino = raiz / UID / SLUG
    destino.mkdir(parents=True)
    origem = next(song_dir.glob("*/notes.mid"))
    shutil.copy2(origem, destino / "notes.mid")
    (destino / "quebrado.mid").write_bytes(b"isto nao e midi")

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(raiz))
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{servidor.server_address[1]}"
    servidor.shutdown()


def build(tmp_path: Path, song_dir: Path, base: str) -> TestClient:
    return TestClient(
        create_app(
            Settings(
                songs_dir=song_dir,
                allowed_origins=("http://localhost:5173",),
                storage="local",
                assets_base_url="",
                cache_dir=tmp_path / "cache",
                community_base_url=base,
            )
        )
    )


@pytest.fixture
def client(tmp_path: Path, song_dir: Path, bucket: str) -> TestClient:
    return build(tmp_path, song_dir, bucket)


# ------------------------------------------------------------ caminho seguro


@pytest.mark.parametrize(
    "caminho",
    [
        "../../etc/passwd",
        f"{UID}/../../../secret.mid",
        "http://169.254.169.254/latest/meta-data/notes.mid",
        "https://exemplo.com/notes.mid",
        "file:///etc/passwd",
        "//exemplo.com/notes.mid",
        "notes.mid",  # sem pasta: nao e caminho de objeto
        "a/b/c/d/e/f/g/notes.mid",  # fundo demais
        f"{UID}/{SLUG}/notes.mid\x00.txt",
    ],
)
def test_caminho_suspeito_e_recusado(client: TestClient, caminho: str):
    """Aceitar URL arbitraria aqui seria SSRF: a function viraria proxy."""
    resposta = client.get("/api/community/chart", params={
        "path": caminho, "instrument": "guitar", "difficulty": "expert",
    })
    assert resposta.status_code == 400, caminho


def test_caminho_precisa_apontar_para_midi(client: TestClient):
    resposta = client.get("/api/community/inspect", params={"path": f"{UID}/{SLUG}/song.opus"})
    assert resposta.status_code == 400
    assert "mid" in resposta.json()["detail"]


def test_caminho_valido_passa(client: TestClient):
    assert client.get("/api/community/inspect", params={"path": OBJ}).status_code == 200


def test_barra_inicial_e_tolerada(client: TestClient):
    assert client.get("/api/community/inspect", params={"path": f"/{OBJ}"}).status_code == 200


# ------------------------------------------------------------------ inspect


def test_inspect_devolve_instrumentos_e_duracao(client: TestClient):
    dados = client.get("/api/community/inspect", params={"path": OBJ}).json()
    assert dados["length"] > 0
    assert "guitar" in dados["instruments"]
    assert dados["instruments"]["guitar"]["difficulties"]


# -------------------------------------------------------------------- chart


def test_chart_leva_o_slug_como_song_id(client: TestClient):
    dados = client.get("/api/community/chart", params={
        "path": OBJ, "instrument": "guitar", "difficulty": "expert",
    }).json()
    assert dados["songId"] == SLUG


def test_chart_e_igual_ao_da_biblioteca_local(client: TestClient):
    """O parser e o MESMO: comunidade e local nao podem divergir."""
    comunidade = client.get("/api/community/chart", params={
        "path": OBJ, "instrument": "guitar", "difficulty": "expert",
    }).json()
    local = client.get("/api/songs/the-test-band-slash-test/chart/guitar/expert").json()

    assert comunidade["noteCount"] == local["noteCount"]
    assert comunidade["notes"] == local["notes"]
    assert comunidade["bpm"] == local["bpm"]


def test_dificuldade_invalida(client: TestClient):
    r = client.get("/api/community/chart", params={
        "path": OBJ, "instrument": "guitar", "difficulty": "impossivel",
    })
    assert r.status_code == 400


def test_instrumento_nao_suportado(client: TestClient):
    r = client.get("/api/community/chart", params={
        "path": OBJ, "instrument": "vocals", "difficulty": "expert",
    })
    assert r.status_code == 400


def test_midi_invalido_da_422(client: TestClient):
    r = client.get("/api/community/inspect", params={"path": f"{UID}/{SLUG}/quebrado.mid"})
    assert r.status_code == 422


def test_arquivo_ausente_da_404(client: TestClient):
    r = client.get("/api/community/inspect", params={"path": f"{UID}/{SLUG}/nao-existe.mid"})
    assert r.status_code == 404


def test_cache_evita_reparse(client: TestClient):
    client.get("/api/community/inspect", params={"path": OBJ})
    antes = len(community._parsed_cache)
    client.get("/api/community/chart", params={
        "path": OBJ, "instrument": "guitar", "difficulty": "expert",
    })
    assert len(community._parsed_cache) == antes == 1


def test_cache_tem_teto(client: TestClient):
    community._parsed_cache.update({f"x{i}/y/z.mid": object() for i in range(100)})
    client.get("/api/community/inspect", params={"path": OBJ})
    assert len(community._parsed_cache) <= community._CACHE_MAX


# ------------------------------------------------------- nao configurado


def test_sem_base_url_responde_503(tmp_path: Path, song_dir: Path):
    """Servidor sem comunidade configurada diz isso, em vez de erro obscuro."""
    client = build(tmp_path, song_dir, "")
    r = client.get("/api/community/inspect", params={"path": OBJ})
    assert r.status_code == 503
    assert "GUITARSLASH_COMMUNITY_BASE_URL" in r.json()["detail"]
