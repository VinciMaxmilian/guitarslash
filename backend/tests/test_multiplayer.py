"""Testes do servidor da partida (LAN e online usam o mesmo servidor).

Usam o TestClient do Starlette, que fala WebSocket de verdade contra o app.
Cada teste comeca com o registry de salas zerado.

Convencao: JOIN sem `roomCode` CRIA uma sala; JOIN com `roomCode` entra numa
existente. Por isso os testes de dois jogadores passam o codigo do primeiro.
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
    multiplayer.reset_registry()
    yield
    multiplayer.reset_registry()


def sala() -> multiplayer.Room:
    """A sala do teste. A maioria dos casos so tem uma."""
    salas = list(multiplayer.get_registry().rooms.values())
    assert len(salas) == 1, f"esperava 1 sala, ha {len(salas)}"
    return salas[0]


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


def join(ws, name: str = "Player", version: str = "1", code: str | None = None) -> dict:
    """Entra numa sala e devolve o payload do WELCOME.

    Sem `code` o servidor CRIA uma sala nova e devolve o codigo dela. Com
    `code`, entra na sala existente.
    """
    payload = {"name": name, "version": version}
    if code is not None:
        payload["roomCode"] = code
    ws.send_json({"type": "JOIN", "payload": payload})
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
    """Dois jogadores NA MESMA sala, com instrumento e dificuldade escolhidos."""
    me_a = join(ws_a, "Ana")
    me_b = join(ws_b, "Beto", code=me_a["roomCode"])
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
            me_b = join(ws_b, "Beto", code=me_a["roomCode"])
            # Ids distintos mesmo com sessoes criadas em sequencia.
            assert me_b["playerId"] != me_a["playerId"]
            state = latest_state(ws_b)
            assert state["hostId"] == me_a["playerId"]


def test_jogadores_com_mesmo_nome_tem_ids_diferentes(client: TestClient):
    """O cliente se acha pelo id do servidor, nunca pelo nome."""
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        me_a = join(ws_a, "Player 1")
        me_b = join(ws_b, "Player 1", code=me_a["roomCode"])
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
        assert len(sala().players) == 1


def test_sala_cheia_recusa_o_quinto(client: TestClient):
    sockets = [client.websocket_connect("/ws").__enter__() for _ in range(4)]
    try:
        codigo = join(sockets[0], "P0")["roomCode"]
        for index, ws in enumerate(sockets[1:], start=1):
            join(ws, f"P{index}", code=codigo)
        with client.websocket_connect("/ws") as extra:
            send(extra, "JOIN", name="Tarde", version="1", roomCode=codigo)
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
        assert sala().players[0].instrument is None


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
        codigo = join(ws_a, "Ana")["roomCode"]
        join(ws_b, "Beto", code=codigo)

        send(ws_b, "SELECT_SONG", songId="qualquer", mode="versus")
        assert drain_until(ws_b, "ERROR")["code"] == multiplayer.ErrorCode.NOT_HOST
        assert sala().song_id is None

        send(ws_a, "SELECT_SONG", songId="musica-1", mode="coop")
        state = latest_state(ws_a)
        assert state["songId"] == "musica-1"
        assert state["mode"] == "coop"


def test_host_passa_para_o_proximo_quando_o_primeiro_sai(client: TestClient):
    conexao_a = client.websocket_connect("/ws")
    ws_a = conexao_a.__enter__()
    me_a = join(ws_a, "Ana")

    with client.websocket_connect("/ws") as ws_b:
        me_b = join(ws_b, "Beto", code=me_a["roomCode"])
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
        assert sala().phase == "loading"

        send(ws_a, "LOAD_PROGRESS", progress=1.0)
        assert sala().phase == "loading"
        send(ws_b, "LOAD_PROGRESS", progress=1.0)

        start = drain_until(ws_a, "START_AT")
        assert start["startAt"] > start["serverTime"]
        assert start["timedOut"] is False
        assert sala().phase == "playing"

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
        assert sala().phase == "results"


def test_ready_parcial_nao_comeca_o_carregamento(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        prepare(ws_a, ws_b)
        send(ws_a, "SELECT_SONG", songId="musica-1")
        send(ws_a, "SET_READY", ready=True)
        send(ws_a, "PING", clientTime=1)
        drain_until(ws_a, "PONG")
        assert sala().phase == "lobby"


def test_sem_musica_selecionada_ready_nao_comeca_nada(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SET_INSTRUMENT", instrument="guitar")
        send(ws, "SET_DIFFICULTY", difficulty="expert")
        send(ws, "SET_READY", ready=True)
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert sala().phase == "lobby"


def test_ready_sem_instrumento_nao_comeca(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SELECT_SONG", songId="musica-1")
        send(ws, "SET_READY", ready=True)
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert sala().phase == "lobby"


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
        codigo = join(ws_a, "Ana")["roomCode"]
        send(ws_a, "SET_INSTRUMENT", instrument="guitar")
        send(ws_a, "SET_DIFFICULTY", difficulty="expert")
        send(ws_a, "SELECT_SONG", songId="musica-1")
        send(ws_a, "SET_READY", ready=True)
        drain_until(ws_a, "BEGIN_LOAD")
        send(ws_a, "LOAD_PROGRESS", progress=1.0)
        drain_until(ws_a, "START_AT")

        with client.websocket_connect("/ws") as ws_b:
            me_b = join(ws_b, "Beto", code=codigo)
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
        codigo = join(ws_a, "Ana")["roomCode"]
        send(ws_a, "SET_INSTRUMENT", instrument="guitar")
        send(ws_a, "SET_DIFFICULTY", difficulty="expert")

        with client.websocket_connect("/ws") as ws_b:
            join(ws_b, "Beto", code=codigo)
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
        assert sala().phase == "playing"


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
        codigo = join(ws_a, "Ana")["roomCode"]
        join(ws_b, "Beto", code=codigo)
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
        # PING antes do JOIN nao cria sala nenhuma.
        assert multiplayer.get_registry().rooms == {}


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
        room = sala()
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
        estado = sala().players[0].score
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
        assert sala().players[0].load_progress == pytest.approx(0.8)


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
        codigo = join(ws_a, "Ana")["roomCode"]
        with client.websocket_connect("/ws") as ws_b:
            join(ws_b, "Beto", code=codigo)
            assert len(sala().players) == 2
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
        assert len(sala().players) == 1


def test_sala_vazia_esquece_a_musica(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SELECT_SONG", songId="musica-1")
        latest_state(ws)
    room = sala()
    assert room.players == []
    assert room.song_id is None
    assert room.phase == "lobby"


# ------------------------------------------------------------- salas por codigo


def test_join_sem_codigo_cria_sala_e_devolve_o_codigo(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        welcome = join(ws, "Ana")
        codigo = welcome["roomCode"]
        assert len(codigo) == multiplayer.CODE_LENGTH
        assert set(codigo) <= set(multiplayer.CODE_ALPHABET)
        assert latest_state(ws)["code"] == codigo


def test_codigo_nao_usa_caracteres_ambiguos(client: TestClient):
    """Quem entra vai digitar o codigo ditado por voz: sem O/0 nem I/1."""
    assert not (set("O0I1") & set(multiplayer.CODE_ALPHABET))


def test_join_com_codigo_entra_na_mesma_sala(client: TestClient):
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        codigo = join(ws_a, "Ana")["roomCode"]
        assert join(ws_b, "Beto", code=codigo)["roomCode"] == codigo
        assert len(multiplayer.get_registry().rooms) == 1
        assert [p["name"] for p in latest_state(ws_b)["players"]] == ["Ana", "Beto"]


def test_codigo_aceita_minuscula_e_espaco(client: TestClient):
    """A pessoa digita o que ouviu; normalizar e problema do servidor."""
    with client.websocket_connect("/ws") as ws_a, client.websocket_connect("/ws") as ws_b:
        codigo = join(ws_a, "Ana")["roomCode"]
        bagunçado = f" {codigo[:2].lower()} {codigo[2:].lower()} "
        assert join(ws_b, "Beto", code=bagunçado)["roomCode"] == codigo


def test_codigo_inexistente_e_recusado(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        send(ws, "JOIN", name="Ana", version="1", roomCode="ZZZZ")
        message = ws.receive_json()
        assert message["type"] == "ERROR"
        assert message["payload"]["code"] == multiplayer.ErrorCode.ROOM_NOT_FOUND
        assert "ZZZZ" in message["payload"]["message"]


def test_duas_salas_nao_se_enxergam(client: TestClient):
    """O ponto do codigo: online, dois grupos jogam ao mesmo tempo."""
    with client.websocket_connect("/ws") as a1, client.websocket_connect("/ws") as a2, \
         client.websocket_connect("/ws") as b1, client.websocket_connect("/ws") as b2:
        codigo_a = join(a1, "Ana")["roomCode"]
        join(a2, "Alan", code=codigo_a)
        codigo_b = join(b1, "Bia")["roomCode"]
        join(b2, "Bruno", code=codigo_b)

        assert codigo_a != codigo_b
        assert len(multiplayer.get_registry().rooms) == 2

        # A musica escolhida numa sala nao vaza para a outra.
        send(a1, "SELECT_SONG", songId="musica-da-sala-a")
        assert latest_state(a2)["songId"] == "musica-da-sala-a"

        estado_b = latest_state(b2)
        assert estado_b["songId"] is None
        assert {p["name"] for p in estado_b["players"]} == {"Bia", "Bruno"}


def test_cada_sala_tem_o_proprio_host(client: TestClient):
    with client.websocket_connect("/ws") as a1, client.websocket_connect("/ws") as b1:
        me_a = join(a1, "Ana")
        me_b = join(b1, "Bia")
        assert latest_state(a1)["hostId"] == me_a["playerId"]
        assert latest_state(b1)["hostId"] == me_b["playerId"]


def test_sala_cheia_nao_impede_criar_outra(client: TestClient):
    sockets = [client.websocket_connect("/ws").__enter__() for _ in range(4)]
    try:
        codigo = join(sockets[0], "P0")["roomCode"]
        for i, ws in enumerate(sockets[1:], start=1):
            join(ws, f"P{i}", code=codigo)

        with client.websocket_connect("/ws") as outro:
            novo = join(outro, "Fulano")
            assert novo["roomCode"] != codigo
            assert len(multiplayer.get_registry().rooms) == 2
    finally:
        for ws in sockets:
            ws.__exit__(None, None, None)


def test_teto_de_salas_do_processo(client: TestClient, monkeypatch):
    """Online qualquer um abre conexao; sem teto, da para encher a memoria."""
    monkeypatch.setattr(multiplayer, "MAX_ROOMS", 1)
    with client.websocket_connect("/ws") as ws_a:
        join(ws_a, "Ana")
        with client.websocket_connect("/ws") as ws_b:
            send(ws_b, "JOIN", name="Beto", version="1")
            message = ws_b.receive_json()
            assert message["type"] == "ERROR"
            assert message["payload"]["code"] == multiplayer.ErrorCode.TOO_MANY_ROOMS


def test_sala_vazia_e_descartada_depois_do_ttl(client: TestClient, monkeypatch):
    with client.websocket_connect("/ws") as ws:
        codigo = join(ws, "Ana")["roomCode"]
    registry = multiplayer.get_registry()
    # Ainda existe: o jogador pode ter so recarregado a pagina.
    assert codigo in registry.rooms

    monkeypatch.setattr(multiplayer, "EMPTY_ROOM_TTL", -1.0)
    assert registry.discard_expired() == 1
    assert registry.rooms == {}


def test_sala_com_gente_nunca_e_descartada(client: TestClient, monkeypatch):
    monkeypatch.setattr(multiplayer, "EMPTY_ROOM_TTL", -1.0)
    with client.websocket_connect("/ws") as ws:
        codigo = join(ws, "Ana")["roomCode"]
        assert multiplayer.get_registry().discard_expired() == 0
        assert codigo in multiplayer.get_registry().rooms


def test_normalize_code():
    assert multiplayer.normalize_code(" k7 qm ") == "K7QM"
    assert multiplayer.normalize_code("") == ""
    assert multiplayer.normalize_code(None) == ""


# ------------------------------------------------------------ origem permitida


def test_origin_allowed():
    """WebSocket nao passa por CORS: a checagem de origem e nossa."""
    permitidas = ("https://guitarslash.netlify.app",)
    assert multiplayer.origin_allowed("https://guitarslash.netlify.app", permitidas)
    # Barra final nao pode mudar o veredito.
    assert multiplayer.origin_allowed("https://guitarslash.netlify.app/", permitidas)
    assert not multiplayer.origin_allowed("https://site-malicioso.com", permitidas)
    # Cliente nao-navegador (sem Origin) passa; navegador SEMPRE manda Origin.
    assert multiplayer.origin_allowed(None, permitidas)
    assert multiplayer.origin_allowed("https://qualquer.com", ("*",))


def test_conexao_de_origem_estranha_e_fechada(client: TestClient):
    with pytest.raises(Exception):
        with client.websocket_connect(
            "/ws", headers={"origin": "https://site-malicioso.com"}
        ) as ws:
            ws.receive_json()


def test_conexao_da_origem_permitida_passa(client: TestClient):
    with client.websocket_connect(
        "/ws", headers={"origin": "http://localhost:5173"}
    ) as ws:
        assert join(ws, "Ana")["roomCode"]


def test_origem_da_mesma_origem_sempre_passa():
    """Modo host: o IP da LAN muda de rede para rede e nunca estaria na lista.

    Sem esta regra o multiplayer LAN nao conectaria em lugar nenhum.
    """
    permitidas = ("https://guitarslash.netlify.app",)
    assert multiplayer.origin_allowed(
        "http://192.168.0.42:8000", permitidas, host="192.168.0.42:8000"
    )
    assert multiplayer.origin_allowed(
        "http://localhost:8000", permitidas, host="localhost:8000"
    )
    # Host diferente da origem continua sendo checado contra a lista.
    assert not multiplayer.origin_allowed(
        "https://site-malicioso.com", permitidas, host="192.168.0.42:8000"
    )


def test_mesma_origem_ignora_maiuscula_no_host():
    assert multiplayer.origin_allowed("http://Casa.local:8000", (), host="casa.local:8000")


def test_lan_conecta_no_modo_host(client: TestClient):
    """Simula o jogador da LAN: Origin e Host sao o IP do host."""
    with client.websocket_connect(
        "/ws",
        headers={"origin": "http://192.168.0.42:8000", "host": "192.168.0.42:8000"},
    ) as ws:
        assert join(ws, "Jogador da LAN")["roomCode"]


# ------------------------------------------------- acertos para a faixa espelho


def test_acertos_viajam_no_placar_agregado(client: TestClient):
    """Os outros desenham a faixa do jogador a partir destes eventos."""
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SCORE_UPDATE", score=100, hits=[[1500, 2, 3], [1620, 0, 1]])
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")

        placar = sala().scoreboard()
        assert placar["players"][0]["hits"] == [[1500, 2, 3], [1620, 0, 1]]


def test_drain_consome_os_acertos_uma_vez_so(client: TestClient):
    """Dois leitores nao podem competir pelos mesmos eventos."""
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SCORE_UPDATE", score=10, hits=[[100, 1, 2]])
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")

        quarto = sala()
        assert quarto.scoreboard(drain=True)["players"][0]["hits"] == [[100, 1, 2]]
        assert quarto.scoreboard()["players"][0]["hits"] == []


def test_acertos_invalidos_sao_descartados_sem_derrubar(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(
            ws,
            "SCORE_UPDATE",
            score=10,
            hits=[
                [100, 9, 1],        # lane fora do intervalo
                [100, 1, 77],       # julgamento invalido
                ["x", 1, 1],        # tempo nao numerico
                [100, 1],           # curto demais
                "nem lista",
                [200, 4, 0],        # este e valido
            ],
        )
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert sala().players[0].recent_hits == [[200, 4, 0]]


def test_hits_nao_sendo_lista_e_ignorado(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SCORE_UPDATE", score=10, hits="isto nao e lista")
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert sala().players[0].recent_hits == []


def test_cliente_travado_nao_faz_a_lista_crescer_sem_fim(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        for _ in range(6):
            send(ws, "SCORE_UPDATE", hits=[[i, i % 5, 1] for i in range(40)])
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert len(sala().players[0].recent_hits) <= multiplayer.MAX_HITS_PER_FLUSH


def test_nova_partida_zera_os_acertos(client: TestClient):
    with client.websocket_connect("/ws") as ws:
        join(ws, "Ana")
        send(ws, "SET_INSTRUMENT", instrument="guitar")
        send(ws, "SET_DIFFICULTY", difficulty="expert")
        send(ws, "SELECT_SONG", songId="m1")
        send(ws, "SCORE_UPDATE", hits=[[1, 1, 1]])
        send(ws, "SELECT_SONG", songId="m2")
        send(ws, "PING", clientTime=1)
        drain_until(ws, "PONG")
        assert sala().players[0].recent_hits == []
