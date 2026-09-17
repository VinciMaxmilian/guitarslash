"""Testes do entrypoint da Vercel (api/index.py).

O que esta em jogo: a plataforma pode entregar a function um caminho diferente
do que o cliente pediu. Ver DEPLOY.md secao 1.6.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]


def load_entrypoint():
    """Importa api/index.py, que nao e um pacote."""
    spec = importlib.util.spec_from_file_location("vercel_entry", ROOT / "api" / "index.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def entry():
    return load_entrypoint()


@pytest.fixture
def client(entry) -> TestClient:
    return TestClient(entry.app)


def test_o_app_exportado_e_a_instancia_do_fastapi(entry):
    """O builder da Vercel inspeciona `app` para decidir entre ASGI e WSGI.

    Envolver `app` num callable qualquer fez a invocacao da function falhar
    (FUNCTION_INVOCATION_FAILED). O ajuste de caminho tem que ser middleware.
    """
    from fastapi import FastAPI

    assert isinstance(entry.app, FastAPI)


def test_rotas_normais_funcionam_sem_o_parametro(client: TestClient):
    """Sem __p na URL, o wrapper nao interfere em nada."""
    assert client.get("/api/health").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_caminho_na_query_string_e_restaurado(client: TestClient):
    """Plano B: o caminho viaja na query e o FastAPI roteia normalmente."""
    response = client.get("/api/index?__p=health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_caminho_restaurado_aceita_barra_inicial(client: TestClient):
    assert client.get("/api/index?__p=/health").status_code == 200


def test_caminho_restaurado_com_varios_segmentos(client: TestClient):
    """`/api/songs/rescan` tem que sobreviver a viagem pela query string."""
    response = client.post("/api/index?__p=songs/rescan")
    assert response.status_code == 200
    assert "count" in response.json()


def test_outros_parametros_de_query_sobrevivem(client: TestClient, entry):
    """__p e consumido; o resto da query continua chegando na aplicacao."""
    capturado: dict = {}

    async def espiao(scope, receive, send):
        capturado["path"] = scope["path"]
        capturado["query"] = scope["query_string"].decode()
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    spy_client = TestClient(entry.RestoreOriginalPath(espiao))
    spy_client.get("/api/index?__p=songs&limit=10&q=abc")

    assert capturado["path"] == "/api/songs"
    assert "limit=10" in capturado["query"]
    assert "q=abc" in capturado["query"]
    assert "__p" not in capturado["query"]


def test_query_sem_o_parametro_passa_intacta(client: TestClient, entry):
    capturado: dict = {}

    async def espiao(scope, receive, send):
        capturado["path"] = scope["path"]
        capturado["query"] = scope["query_string"].decode()
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    spy_client = TestClient(entry.RestoreOriginalPath(espiao))
    spy_client.get("/api/songs?limit=5")

    assert capturado["path"] == "/api/songs"
    assert capturado["query"] == "limit=5"
