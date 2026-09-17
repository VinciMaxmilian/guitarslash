"""Testes do servidor da partida LAN.

Usam o TestClient do Starlette, que fala WebSocket de verdade contra o app.
Cada teste comeca com a sala global zerada.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import multiplayer
from backend.app.config import Settings
from backend.app.main import create_app


@pytest.fixture(autouse=True)
def sala_limpa():
    multiplayer.reset_room()
    yield
    multiplayer.reset_room()


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


def send(ws, type_: str, **payload) -> None:
    ws.send_json({"type": type_, "payload": payload})


def join(ws, name: str = "Player", version: str = "1") -> dict:
    """Entra na sala e devolve o payload do WELCOME."""
    send(ws, "JOIN", name=name, version=version)
    welcome = ws.receive_json()
    assert welcome["type"] == "WELCOME", welcome
    return welcome["payload"]


def drain_until(ws, type_: str, limit: int = 40) -> dict:
    """Le mensagens ate achar `type_`. Evita depender da ordem exata."""
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == type_:
            return message["payload"]
    raise AssertionError(f"nao chegou nenhum {type_}")


def latest_state(ws, limit: int = 80) -> dict:
    """Estado da sala depois que o host processou tudo o que foi enviado.

    Um PING serve de sentinela: o host responde em ordem, entao o ultimo
    ROOM_STATE antes do PONG e o estado final. Sem isso o teste leria o
    primeiro ROOM_STATE da fila, que pode estar varias mensagens atras.
    """
    send(ws, "PING", clientTime=-1)
    state: dict | None = None
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == "ROOM_STATE":
            state = message["payload"]
        elif message["type"] == "PONG" and message["payload"]["clientTime"] == -1:
            assert state is not None, "nao chegou nenhum ROOM_STATE antes do PONG"
            return state
    raise AssertionError("o PONG sentinela nao voltou")


def prepare(ws_a, ws_b) -> tuple[dict, dict]:
    """Dois jogadores dentro da sala, com instrumento e dificuldade escolhidos."""
    me_a = join(ws_a, "Ana")
    me_b = join(ws_b, "Beto")
    for ws in (ws_a, ws_b):
        send(ws, "SET_INSTRUMENT", instrument="guitar")
        send(ws, "SET_DIFFICULTY", difficulty="expert")
    return me_a, me_b


# ------------------------------------------------------------------ identidade


def test_join_devolve_id_proprio_e_marca_host(client: TestClient):
    with client.websocket_connect("/ws") as ws_a:
        me_a = join(ws_a, "Ana")
        assert me_a["protocol"] == "1"
        assert me_a["maxPlayers"] == multiplayer.MAX_PLAYERS

        state = latest_state(ws_a)
        assert state["hostId"] == me_a["playerId"]
        assert state["players"][0]["isHost"] is True

        with client.websocket_connect("/ws") as ws_b:
            me_b = join(ws_b, "Beto")
            # Ids distintos mesmo com sessoes criadas em sequencia.
            assert me_b["playerId"] != me_a["playerId"]
            state = latest_state(ws_b)
            assert state["hostId"] == me_a["playerId"]


def test_jogadores_com_mesmo_nome_tem_ids_diferentes(client: TestClient):
    """O cliente se acha pelo id do servidor, nunca pelo nome."""
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        me_a = join(ws_a, "Player 1")
        me_b = join(ws_b, "Player 1")
        assert me_a["playerId"] != me_b["playerId"]

        state = latest_state(ws_b)
        ids = {p["id"] for p in state["players"]}
        assert ids == {me_a["playerId"], me_b["playerId"]}


def test_versao_de_protocolo_errada_e_recusada(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        send(ws, "JOIN", name="Ana", version="99")
        message = ws.receive_json()
        assert message["type"] == "ERROR"
        assert message["payload"]["code"] == multiplayer.ErrorCode.PROTOCOL


def test_join_duplicado_no_mesmo_socket_nao_cria_dois_jogadores(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "JOIN", name="Ana de novo", version="1")
        error = drain_until(ws, "ERROR")
        assert error["code"] == multiplayer.ErrorCode.ALREADY_JOINED
        assert len(multiplayer.get_room().players) == 1


def test_sala_cheia_recusa_o_quinto(client: TestClient):
    sockets = [client.websocket_connect("/ws").__enter__() for _ in range(4)]
    try:
        for index, ws in enumerate(sockets):
            join(ws, f"P{index}")
        with client.websocket_connect("/ws") as extra:
            send(extra, "JOIN", name="Tarde", version="1")
            message = extra.receive_json()
            assert message["type"] == "ERROR"
            assert message["payload"]["code"] == multiplayer.ErrorCode.ROOM_FULL
    finally:
        for ws in sockets:
            ws.__exit__(None, None, None)


# ------------------------------------------------------------------- validacao


def test_instrumento_e_dificuldade_invalidos_sao_recusados(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SET_INSTRUMENT", instrument="triangulo")
        assert drain_until(ws, "ERROR")["code"] == multiplayer.ErrorCode.BAD_PAYLOAD
        send(ws, "SET_DIFFICULTY", difficulty="impossivel")
        assert drain_until(ws, "ERROR")["code"] == multiplayer.ErrorCode.BAD_PAYLOAD
        assert multiplayer.get_room().players[0].instrument is None


def test_escolha_repetida_nao_gera_novo_room_state(client: TestClient):
    """Guarda contra o loop de mensagens: reenviar a mesma escolha e no-op."""
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        latest_state(ws)
        send(ws, "SET_INSTRUMENT", instrument="guitar")
        assert latest_state(ws)["players"][0]["instrument"] == "guitar"

        # Mesma escolha de novo: nao deve vir ROOM_STATE. Um PING responde para
        # provar que o socket continua vivo e a fila esta vazia.
        send(ws, "SET_INSTRUMENT", instrument="guitar")
        send(ws, "PING", clientTime=1)
        assert ws.receive_json()["type"] == "PONG"


def test_nome_vazio_cai_no_default_e_longo_e_cortado(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "   ")
        assert latest_state(ws)["players"][0]["name"] == "Player"
        send(ws, "SET_NAME", name="X" * 100)
        assert len(latest_state(ws)["players"][0]["name"]) == multiplayer.NAME_MAX


# ------------------------------------------------------------- host autoritario


def test_so_o_host_escolhe_a_musica(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        join(ws_a, "Ana")
        join(ws_b, "Beto")

        send(ws_b, "SELECT_SONG", songId="qualquer", mode="versus")
        assert drain_until(ws_b, "ERROR")["code"] == multiplayer.ErrorCode.NOT_HOST
        assert multiplayer.get_room().song_id is None

        send(ws_a, "SELECT_SONG", songId="musica-1", mode="coop")
        state = latest_state(ws_a)
        assert state["songId"] == "musica-1"
        assert state["mode"] == "coop"


def test_host_passa_para_o_proximo_quando_o_primeiro_sai(client: TestClient):
    conexao_a = client.websocket_connect("/ws")
    ws_a = conexao_a.__enter__()
    me_a = join(ws_a, "Ana")

    with client.websocket_connect("/ws") as ws_b:
        me_b = join(ws_b, "Beto")
        assert latest_state(ws_b)["hostId"] == me_a["playerId"]

        conexao_a.__exit__(None, None, None)

        # Ana era o host. Sem promover o proximo, ninguem mais escolhe musica.
        assert latest_state(ws_b)["hostId"] == me_b["playerId"]
        send(ws_b, "SELECT_SONG", songId="musica-1")
        assert latest_state(ws_b)["songId"] == "musica-1"


def test_modo_invalido_e_recusado(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SET_MODE", mode="battle-royale")
        assert drain_until(ws, "ERROR")["code"] == multiplayer.ErrorCode.BAD_PAYLOAD


# ---------------------------------------------------------------- ciclo da sala


def test_fluxo_completo_lobby_ate_resultados(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        me_a, me_b = prepare(ws_a, ws_b)
        send(ws_a, "SELECT_SONG", songId="musica-1", mode="versus")

        send(ws_a, "SET_READY", ready=True)
        send(ws_b, "SET_READY", ready=True)

        # BEGIN_LOAD sai so quando os dois estao prontos.
        begin = drain_until(ws_b, "BEGIN_LOAD")
        assert begin["songId"] == "musica-1"
        assert multiplayer.get_room().phase == "loading"

        send(ws_a, "LOAD_PROGRESS", progress=1.0)
        assert multiplayer.get_room().phase == "loading"
        send(ws_b, "LOAD_PROGRESS", progress=1.0)

        start = drain_until(ws_a, "START_AT")
        assert start["startAt"] > start["serverTime"]
        assert start["timedOut"] is False
        assert multiplayer.get_room().phase == "playing"

        send(ws_a, "FINISHED", score=5000, accuracy=0.9, maxCombo=40, notesHit=90)
        send(ws_b, "FINISHED", score=9000, accuracy=0.8, maxCombo=30, notesHit=80)

        results = drain_until(ws_a, "RESULTS")
        assert results["mode"] == "versus"
        assert results["winnerId"] == me_b["playerId"]
        assert results["tie"] is False
        assert [row["id"] for row in results["players"]] == [
            me_b["playerId"],
            me_a["playerId"],
        ]
        assert multiplayer.get_room().phase == "results"


def test_ready_parcial_nao_comeca_o_carregamento(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        prepare(ws_a, ws_b)
        send(ws_a, "SELECT_SONG", songId="musica-1")
        send(ws_a, "SET_READY", ready=True)
        send(ws_a, "PING", clientTime=1)
        drain_until(ws_a, "PONG")
        assert multiplayer.get_room().phase == "lobby"


def test_sem_musica_selecionada_ready_nao_comeca_nada(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SET_INSTRUMENT", instrument="guitar")
        send(ws, "SET_DIFFICULTY", difficulty="expert")
        send(ws, "SET_READY", ready=True)
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert multiplayer.get_room().phase == "lobby"


def test_ready_sem_instrumento_nao_comeca(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SELECT_SONG", songId="musica-1")
        send(ws, "SET_READY", ready=True)
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert multiplayer.get_room().phase == "lobby"


def test_selecionar_musica_nova_depois_do_resultado_volta_ao_lobby(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SET_INSTRUMENT", instrument="guitar")
        send(ws, "SET_DIFFICULTY", difficulty="expert")
        send(ws, "SELECT_SONG", songId="musica-1")
        send(ws, "SET_READY", ready=True)
        drain_until(ws, "BEGIN_LOAD")
        send(ws, "LOAD_PROGRESS", progress=1.0)
        drain_until(ws, "START_AT")
        send(ws, "FINISHED", score=100)
        drain_until(ws, "RESULTS")

        send(ws, "SELECT_SONG", songId="musica-2")
        state = drain_until(ws, "ROOM_STATE")
        assert state["phase"] == "lobby"
        assert state["songId"] == "musica-2"
        assert state["players"][0]["ready"] is False
        assert state["players"][0]["scoreState"]["score"] == 0


def test_ready_durante_a_partida_e_recusado(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SET_INSTRUMENT", instrument="guitar")
        send(ws, "SET_DIFFICULTY", difficulty="expert")
        send(ws, "SELECT_SONG", songId="musica-1")
        send(ws, "SET_READY", ready=True)
        drain_until(ws, "BEGIN_LOAD")
        send(ws, "LOAD_PROGRESS", progress=1.0)
        drain_until(ws, "START_AT")

        send(ws, "SET_READY", ready=False)
        assert drain_until(ws, "ERROR")["code"] == multiplayer.ErrorCode.IN_PROGRESS


def test_quem_entra_durante_a_partida_entra_como_espectador(client: TestClient):
    """Sem isso o jogador atrasado travaria o inicio (ou o fim) da musica."""
    with client.websocket_connect("/ws") as ws_a:
        join(ws_a, "Ana")
        send(ws_a, "SET_INSTRUMENT", instrument="guitar")
        send(ws_a, "SET_DIFFICULTY", difficulty="expert")
        send(ws_a, "SELECT_SONG", songId="musica-1")
        send(ws_a, "SET_READY", ready=True)
        drain_until(ws_a, "BEGIN_LOAD")
        send(ws_a, "LOAD_PROGRESS", progress=1.0)
        drain_until(ws_a, "START_AT")

        with client.websocket_connect("/ws") as ws_b:
            me_b = join(ws_b, "Beto")
            state = latest_state(ws_b)
            atrasado = next(p for p in state["players"] if p["id"] == me_b["playerId"])
            assert atrasado["spectator"] is True

            # Ana termina sozinha: o espectador nao bloqueia o RESULTS.
            send(ws_a, "FINISHED", score=100)
            results = drain_until(ws_a, "RESULTS")
            assert [row["id"] for row in results["players"]] != []
            assert me_b["playerId"] not in {row["id"] for row in results["players"]}


def test_saida_de_um_jogador_libera_o_gate_de_carregamento(client: TestClient):
    with client.websocket_connect("/ws") as ws_a:
        join(ws_a, "Ana")
        send(ws_a, "SET_INSTRUMENT", instrument="guitar")
        send(ws_a, "SET_DIFFICULTY", difficulty="expert")

        with client.websocket_connect("/ws") as ws_b:
            join(ws_b, "Beto")
            send(ws_b, "SET_INSTRUMENT", instrument="bass")
            send(ws_b, "SET_DIFFICULTY", difficulty="hard")
            send(ws_a, "SELECT_SONG", songId="musica-1")
            send(ws_a, "SET_READY", ready=True)
            send(ws_b, "SET_READY", ready=True)
            drain_until(ws_a, "BEGIN_LOAD")
            send(ws_a, "LOAD_PROGRESS", progress=1.0)
            # Beto nunca termina de carregar; ele sai.

        # A saida de Beto era a ultima pendencia: a partida comeca.
        start = drain_until(ws_a, "START_AT")
        assert start["startAt"] > 0
        assert multiplayer.get_room().phase == "playing"


def test_desempate_declarado_quando_tudo_empata(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        prepare(ws_a, ws_b)
        send(ws_a, "SELECT_SONG", songId="musica-1", mode="versus")
        send(ws_a, "SET_READY", ready=True)
        send(ws_b, "SET_READY", ready=True)
        drain_until(ws_a, "BEGIN_LOAD")
        send(ws_a, "LOAD_PROGRESS", progress=1.0)
        send(ws_b, "LOAD_PROGRESS", progress=1.0)
        drain_until(ws_a, "START_AT")

        igual = dict(score=1000, accuracy=0.5, maxCombo=10, notesHit=20)
        send(ws_a, "FINISHED", **igual)
        send(ws_b, "FINISHED", **igual)

        results = drain_until(ws_a, "RESULTS")
        assert results["tie"] is True


def test_versus_avisa_dificuldades_diferentes(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        join(ws_a, "Ana")
        join(ws_b, "Beto")
        send(ws_a, "SET_INSTRUMENT", instrument="guitar")
        send(ws_a, "SET_DIFFICULTY", difficulty="expert")
        send(ws_b, "SET_INSTRUMENT", instrument="guitar")
        send(ws_b, "SET_DIFFICULTY", difficulty="easy")
        send(ws_a, "SELECT_SONG", songId="musica-1", mode="versus")
        send(ws_a, "SET_READY", ready=True)
        send(ws_b, "SET_READY", ready=True)
        drain_until(ws_a, "BEGIN_LOAD")
        send(ws_a, "LOAD_PROGRESS", progress=1.0)
        send(ws_b, "LOAD_PROGRESS", progress=1.0)
        drain_until(ws_a, "START_AT")
        send(ws_a, "FINISHED", score=10)
        send(ws_b, "FINISHED", score=20)

        results = drain_until(ws_a, "RESULTS")
        assert results["mixedDifficulty"] is True


def test_coop_soma_band_score(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        prepare(ws_a, ws_b)
        send(ws_a, "SELECT_SONG", songId="musica-1", mode="coop")
        send(ws_a, "SET_READY", ready=True)
        send(ws_b, "SET_READY", ready=True)
        drain_until(ws_a, "BEGIN_LOAD")
        send(ws_a, "LOAD_PROGRESS", progress=1.0)
        send(ws_b, "LOAD_PROGRESS", progress=1.0)
        drain_until(ws_a, "START_AT")
        send(ws_a, "FINISHED", score=4000)
        send(ws_b, "FINISHED", score=6000)

        results = drain_until(ws_a, "RESULTS")
        assert results["mode"] == "coop"
        assert results["bandScore"] == 10000
        assert "winnerId" not in results


# -------------------------------------------------------------------- relogio


def test_pong_devolve_os_dois_relogios_em_ms(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        send(ws, "PING", clientTime=1234567)
        payload = drain_until(ws, "PONG")
        assert payload["clientTime"] == 1234567
        # ms desde a epoca: em 2026 isto tem 13 digitos.
        assert payload["serverTime"] > 1_600_000_000_000


def test_ping_funciona_antes_do_join(client: TestClient):
    """O cliente mede o offset de relogio durante a conexao, antes de entrar."""
    with client.websocket_connect("/ws") as ws:
        send(ws, "PING", clientTime=1)
        assert drain_until(ws, "PONG")["clientTime"] == 1
        assert multiplayer.get_room().players == []


# --------------------------------------------------------------------- placar


def test_score_update_nao_faz_broadcast_imediato(client: TestClient):
    """O placar sai agregado pelo ticker, nao a cada mensagem recebida."""
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        prepare(ws_a, ws_b)
        send(ws_a, "SELECT_SONG", songId="musica-1")
        send(ws_a, "SET_READY", ready=True)
        send(ws_b, "SET_READY", ready=True)
        drain_until(ws_b, "BEGIN_LOAD")
        send(ws_a, "LOAD_PROGRESS", progress=1.0)
        send(ws_b, "LOAD_PROGRESS", progress=1.0)
        drain_until(ws_b, "START_AT")

        for score in range(0, 500, 50):
            send(ws_a, "SCORE_UPDATE", score=score, combo=score // 10)

        # O estado ficou registrado no host...
        send(ws_a, "PING", clientTime=1)
        drain_until(ws_a, "PONG")
        room = multiplayer.get_room()
        jogador = next(p for p in room.players if p.name == "Ana")
        assert jogador.score.score == 450
        # ...e o agregado tem o ultimo valor, nao dez mensagens em sequencia.
        assert room.scoreboard()["players"][0]["score"] == 450


def test_score_negativo_ou_lixo_nao_quebra_o_placar(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SCORE_UPDATE", score=-10, combo="abc", accuracy=5.0, stars=99)
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        estado = multiplayer.get_room().players[0].score
        assert estado.score == 0
        assert estado.combo == 0
        assert estado.accuracy == 1.0
        assert estado.stars == 5


def test_load_progress_nao_regride(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "LOAD_PROGRESS", progress=0.8)
        assert latest_state(ws)["players"][0]["loadProgress"] == pytest.approx(0.8)
        send(ws, "LOAD_PROGRESS", progress=0.2)
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert multiplayer.get_room().players[0].load_progress == pytest.approx(0.8)


def test_star_power_chega_nos_outros(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        me_a, _ = prepare(ws_a, ws_b)
        send(ws_a, "STAR_POWER", active=True)
        payload = drain_until(ws_b, "STAR_POWER")
        assert payload["playerId"] == me_a["playerId"]
        assert payload["active"] is True


# ---------------------------------------------------------------- desconexoes


def test_saida_remove_o_jogador_da_sala(client: TestClient):
    with client.websocket_connect("/ws") as ws_a:
        join(ws_a, "Ana")
        with client.websocket_connect("/ws") as ws_b:
            join(ws_b, "Beto")
            assert len(multiplayer.get_room().players) == 2
        state = latest_state(ws_a)
        assert [p["name"] for p in state["players"]] == ["Ana"]


def test_leave_explicito_fecha_a_conexao(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "LEAVE")
        with pytest.raises(Exception):
            # O host fecha o socket; qualquer leitura seguinte falha.
            for _ in range(10):
                ws.receive_json()


def test_mensagem_invalida_nao_derruba_a_conexao(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        ws.send_text("isto nao e json")
        ws.send_json({"type": "SET_READY", "payload": "nem isto e um objeto"})
        ws.send_json({"sem": "tipo"})
        send(ws, "PING", clientTime=7)
        assert drain_until(ws, "PONG")["clientTime"] == 7
        assert len(multiplayer.get_room().players) == 1


def test_sala_vazia_esquece_a_musica(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SELECT_SONG", songId="musica-1")
        latest_state(ws)
    room = multiplayer.get_room()
    assert room.players == []
    assert room.song_id is None
    assert room.phase == "lobby"
