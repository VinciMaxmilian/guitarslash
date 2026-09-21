"""Servidor da partida: salas identificadas por codigo, WebSocket, JSON tipado.

Serve os dois cenarios com o mesmo codigo:

    - LAN (modo host): um jogador roda o processo na propria maquina;
    - online: o processo roda num servidor que aguenta conexao aberta
      (Serverless Function NAO aguenta, por isso nao e a Vercel).

A diferenca entre os dois e so onde o processo roda. Por isso as salas tem
CODIGO: na LAN daria para ter uma sala unica, mas online todo mundo abriria a
mesma sala de 4 lugares.

Regras que este modulo assume (e que o resto do jogo depende):

    - o host e a fonte da verdade do LOBBY (quem esta na sala, qual musica,
      qual modo, quando comeca);
    - cada cliente e a fonte da verdade do PROPRIO score. O servidor nao
      valida placar: sem anti-cheat, por decisao de projeto. O codigo de sala
      e privacidade, nao seguranca;
    - a sincronia audio/nota nunca depende da rede. A rede so carrega estado
      de sala, um timestamp de inicio e placar em baixa frequencia.

O placar NAO e reenviado a cada mensagem recebida: o host acumula e faz um
unico broadcast agregado a `SCOREBOARD_HZ`, senao 4 jogadores tocando viram
centenas de mensagens por segundo e o React do lobby re-renderiza sem parar.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()

PROTOCOL_VERSION = "1"
MAX_PLAYERS = 4
MODES = ("versus", "coop")
INSTRUMENTS = ("guitar", "guitar_coop", "rhythm", "bass", "drums")
DIFFICULTIES = ("easy", "medium", "hard", "expert")

#: Broadcast agregado do placar. O plano pede 5-10 Hz, nunca por frame.
SCOREBOARD_HZ = 10.0
#: Sem PING (ou qualquer mensagem) por este tempo, o jogador conta como caido.
#: Generoso de proposito: LAN por wifi oscila.
HEARTBEAT_TIMEOUT = 15.0
#: Jogador que ainda esta baixando quando todos os outros terminaram nao
#: bloqueia a partida para sempre.
LOAD_TIMEOUT = 90.0
#: Delay entre "todos prontos" e o primeiro sample de audio.
COUNTDOWN_MS = 3000

NAME_MAX = 24

#: Acertos acumulados por jogador entre dois broadcasts de placar.
#:
#: Servem para os OUTROS desenharem a faixa dele em miniatura. Nao mandamos a
#: faixa pela rede: todo mundo toca a mesma musica, entao cada cliente ja tem o
#: chart e so precisa saber o que o outro acertou. Sao ~13 notas por segundo,
#: entao cada flush a 10 Hz leva pouco mais de uma nota.
MAX_HITS_PER_FLUSH = 64

#: Alfabeto do codigo de sala: sem O/0 e I/1, que as pessoas confundem ao
#: ditar o codigo por voz.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 4

#: Teto de salas simultaneas no processo. Online qualquer um abre conexao;
#: sem teto, criar salas vazias em loop consome memoria do servidor.
MAX_ROOMS = 200

#: Sala sem ninguem dentro e descartada; este prazo cobre o caso do jogador
#: que recarrega a pagina e volta para a mesma sala.
EMPTY_ROOM_TTL = 120.0


def now_ms() -> int:
    """Relogio de parede em ms. E o relogio que vai dentro do START_AT."""
    return int(time.time() * 1000)


class ErrorCode:
    PROTOCOL = "PROTOCOL_VERSION"
    ROOM_FULL = "ROOM_FULL"
    ROOM_NOT_FOUND = "ROOM_NOT_FOUND"
    TOO_MANY_ROOMS = "TOO_MANY_ROOMS"
    FORBIDDEN_ORIGIN = "FORBIDDEN_ORIGIN"
    NOT_HOST = "NOT_HOST"
    ALREADY_JOINED = "ALREADY_JOINED"
    BAD_PAYLOAD = "BAD_PAYLOAD"
    IN_PROGRESS = "IN_PROGRESS"


def _clean_name(raw: Any, fallback: str) -> str:
    name = str(raw or "").strip()[:NAME_MAX]
    return name or fallback


def _clamp01(raw: Any) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return min(1.0, max(0.0, value))


def _pick(value: Any, allowed: Iterable[str]) -> str | None:
    text = str(value or "").lower().strip()
    return text if text in allowed else None


@dataclass
class ScoreState:
    """O que o cliente reporta durante a musica. Numeros crus, sem validacao."""

    score: int = 0
    combo: int = 0
    max_combo: int = 0
    multiplier: int = 1
    accuracy: float = 0.0
    notes_hit: int = 0
    notes_missed: int = 0
    star_power_active: bool = False
    stars: int = 0

    def apply(self, payload: dict) -> None:
        def as_int(key: str, current: int) -> int:
            try:
                return max(0, int(payload[key]))
            except (KeyError, TypeError, ValueError):
                return current

        self.score = as_int("score", self.score)
        self.combo = as_int("combo", self.combo)
        self.max_combo = as_int("maxCombo", self.max_combo)
        self.multiplier = as_int("multiplier", self.multiplier) or 1
        self.notes_hit = as_int("notesHit", self.notes_hit)
        self.notes_missed = as_int("notesMissed", self.notes_missed)
        self.stars = min(5, as_int("stars", self.stars))
        if "accuracy" in payload:
            self.accuracy = _clamp01(payload["accuracy"])
        if "starPowerActive" in payload:
            self.star_power_active = bool(payload["starPowerActive"])

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "combo": self.combo,
            "maxCombo": self.max_combo,
            "multiplier": self.multiplier,
            "accuracy": self.accuracy,
            "notesHit": self.notes_hit,
            "notesMissed": self.notes_missed,
            "starPowerActive": self.star_power_active,
            "stars": self.stars,
        }


class PlayerSession:
    def __init__(self, ws: WebSocket, name: str):
        self.ws = ws
        # uuid, nao id(self): CPython reaproveita enderecos de memoria, entao
        # `id()` pode repetir entre jogadores que entram em sequencia.
        self.id = uuid.uuid4().hex[:12]
        self.name = name
        self.instrument: str | None = None
        self.difficulty: str | None = None
        self.ready = False
        self.load_progress = 0.0
        self.score = ScoreState()
        #: [tempoMs, lane, codigoDoJulgamento] desde o ultimo flush.
        self.recent_hits: list[list[int]] = []
        self.finished = False
        self.connected = True
        #: Espectador nao bloqueia o inicio: entrou com a partida rolando.
        self.spectator = False
        self.last_seen = time.monotonic()
        #: Placar da SALA, acumulado entre as partidas (so conta no versus).
        #:
        #: Vive no jogador, e nao num dicionario da sala, porque cada JOIN cria
        #: um id novo: um dicionario por id viraria lixo a cada reconexao, e um
        #: por nome deixaria dois jogadores homonimos dividirem o mesmo placar.
        self.wins = 0
        self.ties = 0
        self.matches = 0
        #: Soma dos pontos que ele fez nas partidas da sala.
        self.total_points = 0

    def touch(self) -> None:
        self.last_seen = time.monotonic()

    @property
    def stale(self) -> bool:
        return time.monotonic() - self.last_seen > HEARTBEAT_TIMEOUT

    def reset_for_match(self) -> None:
        self.ready = False
        self.load_progress = 0.0
        self.finished = False
        self.score = ScoreState()
        self.recent_hits.clear()

    def queue_hits(self, raw: Any) -> None:
        """Guarda acertos ate o proximo broadcast agregado.

        Formato compacto de proposito: [[tempoMs, lane, julgamento], ...].
        Lixo e descartado em silencio - o cliente nao e confiavel, mas tambem
        nao vale derrubar a partida por um payload torto.
        """
        if not isinstance(raw, list):
            return
        for item in raw[:MAX_HITS_PER_FLUSH]:
            if not isinstance(item, (list, tuple)) or len(item) < 3:
                continue
            try:
                tempo, lane, julgamento = int(item[0]), int(item[1]), int(item[2])
            except (TypeError, ValueError):
                continue
            if 0 <= lane < 5 and 0 <= julgamento <= 3:
                self.recent_hits.append([tempo, lane, julgamento])
        # Cliente travado nao pode fazer a lista crescer sem fim.
        if len(self.recent_hits) > MAX_HITS_PER_FLUSH:
            del self.recent_hits[:-MAX_HITS_PER_FLUSH]

    def to_dict(self, host_id: str | None) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "instrument": self.instrument,
            "difficulty": self.difficulty,
            "ready": self.ready,
            "loadProgress": self.load_progress,
            "connected": self.connected,
            "spectator": self.spectator,
            "finished": self.finished,
            "isHost": self.id == host_id,
            "scoreState": self.score.to_dict(),
        }


def _tiebreak(player: PlayerSession) -> tuple:
    score = player.score
    return (score.score, score.accuracy, score.max_combo, score.notes_hit)


class Room:
    """Uma partida. Identificada por um codigo curto que os jogadores digitam."""

    def __init__(self, code: str = "LOCAL") -> None:
        self.code = code
        self.players: list[PlayerSession] = []
        self.mode: str = "versus"
        self.song_id: str | None = None
        #: lobby -> loading -> playing -> results -> lobby
        self.phase: str = "lobby"
        self.start_at: int | None = None
        self.lock = asyncio.Lock()
        self._scoreboard_dirty = False
        self._ticker: asyncio.Task | None = None
        self._load_deadline: float | None = None
        #: Quando a sala ficou vazia. O registry descarta depois do TTL.
        self.empty_since: float | None = time.monotonic()

    # ------------------------------------------------------------------ estado

    @property
    def host_id(self) -> str | None:
        """O primeiro que entrou e o host. Se ele sai, o proximo assume."""
        return self.players[0].id if self.players else None

    def find(self, player_id: str) -> PlayerSession | None:
        return next((p for p in self.players if p.id == player_id), None)

    def active(self) -> list[PlayerSession]:
        """Quem conta para "todos prontos": jogando, nao espectando, de pe."""
        return [p for p in self.players if not p.spectator and p.connected]

    def to_dict(self) -> dict:
        host_id = self.host_id
        return {
            "code": self.code,
            "phase": self.phase,
            "mode": self.mode,
            "songId": self.song_id,
            "hostId": host_id,
            "maxPlayers": MAX_PLAYERS,
            "players": [p.to_dict(host_id) for p in self.players],
        }

    # --------------------------------------------------------------- transporte

    async def _send(self, player: PlayerSession, message: str) -> bool:
        try:
            await player.ws.send_text(message)
            return True
        except Exception:
            # Socket morto. Marca como caido; o reaper remove no proximo tick.
            player.connected = False
            return False

    async def broadcast(
        self, type_: str, payload: dict, exclude: PlayerSession | None = None
    ) -> None:
        message = json.dumps({"type": type_, "payload": payload})
        # Copia a lista: os `await` abaixo deixam outras corrotinas entrarem e
        # mutarem `self.players` no meio da iteracao.
        for player in tuple(self.players):
            if player is not exclude:
                await self._send(player, message)

    async def send_to(self, player: PlayerSession, type_: str, payload: dict) -> None:
        await self._send(player, json.dumps({"type": type_, "payload": payload}))

    async def send_state(self) -> None:
        await self.broadcast("ROOM_STATE", self.to_dict())

    async def send_error(self, player: PlayerSession, code: str, message: str) -> None:
        await self.send_to(player, "ERROR", {"code": code, "message": message})

    # ------------------------------------------------------------------ placar

    def mark_scoreboard_dirty(self) -> None:
        self._scoreboard_dirty = True

    def scoreboard(self, *, drain: bool = False) -> dict:
        """Placar agregado.

        `drain=True` consome os acertos acumulados: use so no broadcast de
        verdade, senao dois leitores competiriam pelos mesmos eventos.
        """
        players = []
        for p in self.players:
            if p.spectator:
                continue
            linha = {
                "id": p.id,
                "name": p.name,
                "connected": p.connected,
                "finished": p.finished,
                "hits": list(p.recent_hits),
                **p.score.to_dict(),
            }
            if drain:
                p.recent_hits.clear()
            players.append(linha)
        payload: dict = {"players": players}
        if self.mode == "coop":
            # Co-op: o BAND SCORE e a soma, inclusive de quem caiu (o score
            # dele congela no ultimo valor recebido).
            payload["bandScore"] = sum(row["score"] for row in players)
        return payload

    def results(self) -> dict:
        players = sorted(
            (p for p in self.players if not p.spectator),
            key=_tiebreak,
            reverse=True,
        )
        rows = [
            {
                "id": p.id,
                "name": p.name,
                "instrument": p.instrument,
                "difficulty": p.difficulty,
                "connected": p.connected,
                **p.score.to_dict(),
            }
            for p in players
        ]
        payload: dict = {"mode": self.mode, "songId": self.song_id, "players": rows}

        if self.mode == "coop":
            payload["bandScore"] = sum(row["score"] for row in rows)
            return payload

        # Versus: vence quem fez mais pontos. Desempate: accuracy, max combo,
        # notas acertadas. Se tudo empatar, empate declarado.
        payload["winnerId"] = rows[0]["id"] if rows else None
        payload["tie"] = bool(
            len(players) > 1 and _tiebreak(players[0]) == _tiebreak(players[1])
        )
        # Dificuldades diferentes deixam o score incomparavel: a tela avisa.
        difficulties = {p.difficulty for p in players if p.difficulty}
        payload["mixedDifficulty"] = len(difficulties) > 1
        return payload

    def record_match(self, payload: dict) -> None:
        """Fecha a partida no placar da sala.

        So no versus: em co-op nao ha vencedor, a banda inteira faz um score
        so, e uma coluna de vitorias nao significaria nada.

        Empate nao da vitoria a ninguem - e contado a parte, senao dois
        empates pareceriam uma vitoria de cada.
        """
        if self.mode != "versus":
            return

        winner = payload.get("winnerId")
        empate = bool(payload.get("tie"))
        for player in self.players:
            if player.spectator:
                continue
            player.matches += 1
            player.total_points += int(player.score.score)
            if empate:
                player.ties += 1
            elif player.id == winner:
                player.wins += 1

    def standings(self) -> list[dict]:
        """Placar acumulado da sala, do primeiro para o ultimo."""
        linhas = [
            {
                "id": p.id,
                "name": p.name,
                "wins": p.wins,
                "ties": p.ties,
                "matches": p.matches,
                "points": p.total_points,
                "connected": p.connected,
            }
            for p in self.players
            if p.matches > 0
        ]
        # Vitorias mandam; pontos so desempatam. Quem ganha duas partidas
        # apertadas esta na frente de quem ganhou uma por muito.
        linhas.sort(key=lambda r: (r["wins"], r["points"]), reverse=True)
        return linhas

    # ------------------------------------------------------------- ciclo da sala

    async def begin_load_if_ready(self) -> None:
        active = self.active()
        if self.phase != "lobby" or not self.song_id or not active:
            return
        if not all(p.ready and p.instrument and p.difficulty for p in active):
            return

        self.phase = "loading"
        self._load_deadline = time.monotonic() + LOAD_TIMEOUT
        for player in active:
            player.load_progress = 0.0
            player.finished = False
            player.score = ScoreState()
        await self.send_state()
        await self.broadcast("BEGIN_LOAD", {"songId": self.song_id, "mode": self.mode})

    async def start_if_loaded(self, *, force: bool = False) -> None:
        active = self.active()
        if self.phase != "loading" or not active:
            return
        if not force and not all(p.load_progress >= 1.0 for p in active):
            return

        self.phase = "playing"
        self._load_deadline = None
        self.start_at = now_ms() + COUNTDOWN_MS
        await self.send_state()
        await self.broadcast(
            "START_AT",
            {"startAt": self.start_at, "serverTime": now_ms(), "timedOut": force},
        )

    async def finish_if_done(self) -> None:
        active = self.active()
        if self.phase != "playing" or not active:
            return
        if not all(p.finished for p in active):
            return

        self.phase = "results"
        self.start_at = None
        payload = self.results()
        # A ordem importa: o placar da sala so pode contar esta partida depois
        # que o vencedor dela foi decidido.
        self.record_match(payload)
        if self.mode == "versus":
            payload["standings"] = self.standings()
        await self.send_state()
        await self.broadcast("RESULTS", payload)

    async def return_to_lobby(self) -> None:
        self.phase = "lobby"
        self.start_at = None
        for player in self.players:
            player.spectator = False
            player.reset_for_match()
        await self.send_state()

    # ---------------------------------------------------------------- jogadores

    async def add(self, player: PlayerSession) -> None:
        # Quem chega com a partida rolando entra como espectador: contar ele em
        # "todos prontos" travaria o inicio (ou o fim) da musica.
        player.spectator = self.phase in ("loading", "playing")
        self.players.append(player)
        self.empty_since = None
        self._ensure_ticker()
        await self.send_state()

    async def remove(self, player: PlayerSession) -> None:
        if player not in self.players:
            return
        self.players.remove(player)
        try:
            await player.ws.close()
        except Exception:
            pass

        if not self.players:
            self.phase = "lobby"
            self.song_id = None
            self.start_at = None
            self.empty_since = time.monotonic()
            self._stop_ticker()
            return

        await self.send_state()
        # A saida pode ter sido a ultima pendencia de um gate.
        await self.begin_load_if_ready()
        await self.start_if_loaded()
        await self.finish_if_done()

    # ------------------------------------------------------------------- ticker

    def _ensure_ticker(self) -> None:
        if self._ticker is None or self._ticker.done():
            self._ticker = asyncio.create_task(self._tick_loop())

    def _stop_ticker(self) -> None:
        ticker, self._ticker = self._ticker, None
        if ticker is None or ticker.done():
            return
        # O proprio ticker chama isto (reap -> remove -> sala vazia). Cancelar a
        # si mesmo levantaria CancelledError dentro do lock; o `while` do loop
        # ja termina sozinho quando a sala fica vazia.
        if ticker is not asyncio.current_task():
            ticker.cancel()

    async def _tick_loop(self) -> None:
        """Placar agregado + reaper de jogadores caidos, num unico timer."""
        interval = 1.0 / SCOREBOARD_HZ
        try:
            while self.players:
                await asyncio.sleep(interval)
                async with self.lock:
                    await self.reap()
                    if self._scoreboard_dirty and self.phase == "playing":
                        self._scoreboard_dirty = False
                        await self.broadcast("SCOREBOARD", self.scoreboard(drain=True))
                    if self._load_deadline and time.monotonic() > self._load_deadline:
                        logger.warning("timeout de carregamento; comecando sem todo mundo")
                        await self.start_if_loaded(force=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("ticker da sala morreu")

    async def reap(self) -> None:
        """Remove quem parou de responder ao heartbeat ou cujo socket morreu."""
        dead = [p for p in self.players if p.stale or not p.connected]
        for player in dead:
            logger.info("removendo jogador sem resposta: %s", player.name)
            await self.remove(player)


class RoomRegistry:
    """Todas as salas do processo, por codigo.

    Uma instancia so. Se o servidor rodar com MAIS DE UM processo (worker ou
    replica), cada um tera o proprio registry e dois jogadores com o mesmo
    codigo podem cair em salas diferentes. Rode com um processo, ou ponha
    sticky session na frente. Ver DEPLOY.md.
    """

    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    def _new_code(self) -> str | None:
        for _ in range(50):
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
            if code not in self.rooms:
                return code
        return None

    def create(self) -> Room | None:
        """Sala nova com codigo inedito, ou None se o processo estiver cheio."""
        self.discard_expired()
        if len(self.rooms) >= MAX_ROOMS:
            return None
        code = self._new_code()
        if code is None:
            return None
        room = Room(code)
        self.rooms[code] = room
        logger.info("sala criada: %s (%d ativas)", code, len(self.rooms))
        return room

    def get(self, code: str) -> Room | None:
        return self.rooms.get(normalize_code(code))

    def discard_expired(self) -> int:
        """Remove salas vazias ha mais tempo que EMPTY_ROOM_TTL."""
        agora = time.monotonic()
        mortas = [
            code
            for code, room in self.rooms.items()
            if not room.players
            and room.empty_since is not None
            and agora - room.empty_since > EMPTY_ROOM_TTL
        ]
        for code in mortas:
            self.rooms.pop(code)._stop_ticker()
        if mortas:
            logger.info("salas descartadas: %s", ", ".join(mortas))
        return len(mortas)

    def clear(self) -> None:
        for room in self.rooms.values():
            room._stop_ticker()
        self.rooms.clear()


def normalize_code(raw: Any) -> str:
    """Codigo digitado pelo jogador -> forma canonica.

    Aceita minuscula e espacos, porque a pessoa vai digitar o que ouviu.
    """
    return "".join(str(raw or "").split()).upper()


REGISTRY = RoomRegistry()


def get_registry() -> RoomRegistry:
    return REGISTRY


def reset_registry() -> None:
    """Usado pelos testes: derruba o estado global entre casos."""
    REGISTRY.clear()


async def _handle(room: Room, player: PlayerSession, msg_type: str, payload: dict) -> bool:
    """Processa uma mensagem de um jogador ja dentro da sala.

    Retorna False quando o jogador pediu para sair.
    """
    player.touch()

    if msg_type == "SET_NAME":
        player.name = _clean_name(payload.get("name"), player.name)
        await room.send_state()

    elif msg_type == "SET_INSTRUMENT":
        chosen = _pick(payload.get("instrument"), INSTRUMENTS)
        if chosen is None:
            await room.send_error(player, ErrorCode.BAD_PAYLOAD, "Instrumento invalido.")
        elif chosen != player.instrument:
            # Guarda de igualdade: sem ela, o ROOM_STATE que volta faz o cliente
            # reenviar a escolha e os clientes ficam num loop de mensagens.
            player.instrument = chosen
            await room.send_state()

    elif msg_type == "SET_DIFFICULTY":
        chosen = _pick(payload.get("difficulty"), DIFFICULTIES)
        if chosen is None:
            await room.send_error(player, ErrorCode.BAD_PAYLOAD, "Dificuldade invalida.")
        elif chosen != player.difficulty:
            player.difficulty = chosen
            await room.send_state()

    elif msg_type == "SET_READY":
        ready = bool(payload.get("ready", False))
        if room.phase != "lobby":
            await room.send_error(player, ErrorCode.IN_PROGRESS, "A partida ja comecou.")
        elif ready != player.ready:
            player.ready = ready
            await room.send_state()
            await room.begin_load_if_ready()

    elif msg_type == "SET_MODE":
        if player.id != room.host_id:
            await room.send_error(player, ErrorCode.NOT_HOST, "So o host escolhe o modo.")
            return True
        chosen = _pick(payload.get("mode"), MODES)
        if chosen is None:
            await room.send_error(player, ErrorCode.BAD_PAYLOAD, "Modo invalido.")
        elif chosen != room.mode:
            room.mode = chosen
            for other in room.players:
                other.ready = False
            await room.send_state()

    elif msg_type == "SELECT_SONG":
        # O host e a fonte da verdade do lobby. Sem isso, dois jogadores
        # escolhendo musica ao mesmo tempo zeram o ready um do outro em loop.
        if player.id != room.host_id:
            await room.send_error(player, ErrorCode.NOT_HOST, "So o host escolhe a musica.")
            return True
        if room.phase not in ("lobby", "results"):
            await room.send_error(player, ErrorCode.IN_PROGRESS, "A partida ja comecou.")
            return True
        song_id = str(payload.get("songId") or "").strip()
        if not song_id:
            await room.send_error(player, ErrorCode.BAD_PAYLOAD, "songId vazio.")
            return True
        mode = _pick(payload.get("mode"), MODES)
        if mode:
            room.mode = mode
        if song_id != room.song_id or room.phase == "results":
            room.song_id = song_id
            room.phase = "lobby"
            for other in room.players:
                other.spectator = False
                other.reset_for_match()
            await room.send_state()

    elif msg_type == "LOAD_PROGRESS":
        progress = _clamp01(payload.get("progress"))
        # Progresso so avanca: chegada fora de ordem nao regride a barra.
        if progress > player.load_progress:
            player.load_progress = progress
            await room.send_state()
            await room.start_if_loaded()

    elif msg_type == "SCORE_UPDATE":
        player.score.apply(payload)
        player.queue_hits(payload.get("hits"))
        # Nao faz broadcast aqui: o ticker agrega e manda a SCOREBOARD_HZ.
        room.mark_scoreboard_dirty()

    elif msg_type == "STAR_POWER":
        player.score.star_power_active = bool(payload.get("active", True))
        await room.broadcast(
            "STAR_POWER",
            {"playerId": player.id, "active": player.score.star_power_active},
            exclude=player,
        )

    elif msg_type == "FINISHED":
        player.score.apply(payload)
        player.finished = True
        room.mark_scoreboard_dirty()
        await room.broadcast("SCOREBOARD", room.scoreboard(drain=True))
        await room.finish_if_done()

    elif msg_type == "RETURN_TO_LOBBY":
        if player.id != room.host_id:
            await room.send_error(
                player, ErrorCode.NOT_HOST, "So o host volta a sala para o lobby."
            )
        else:
            await room.return_to_lobby()

    elif msg_type == "LEAVE":
        return False

    return True


async def _reject(websocket: WebSocket, code: str, message: str) -> None:
    try:
        await websocket.send_text(
            json.dumps({"type": "ERROR", "payload": {"code": code, "message": message}})
        )
        await websocket.close()
    except Exception:
        pass


def origin_allowed(origin: str | None, allowed: Iterable[str], host: str | None = None) -> bool:
    """WebSocket nao passa por CORS: a checagem de origem e nossa.

    Sem isto, qualquer pagina na internet abre conexao com o servidor de
    partidas em nome de quem estiver visitando.

    Tres casos passam:

    1. Origem ausente: o navegador SEMPRE manda Origin, entao a ausencia e
       cliente nativo/curl/teste, e nao um navegador se disfarcando.
    2. MESMA ORIGEM do proprio servidor. E o modo host: o jogador abre
       http://192.168.0.42:8000 e esse vira o Origin dele. Esse endereco nunca
       estaria numa lista fixa, porque o IP da LAN muda de rede para rede - e
       sem esta regra o multiplayer LAN simplesmente nao conectaria.
    3. Origem na lista configurada (GUITARSLASH_ALLOWED_ORIGINS).
    """
    if origin is None:
        return True

    permitidas = tuple(allowed)
    if "*" in permitidas:
        return True

    if host and _origin_host(origin) == host.strip().lower():
        return True

    return origin.rstrip("/") in {o.rstrip("/") for o in permitidas}


def _origin_host(origin: str) -> str:
    """"http://192.168.0.42:8000" -> "192.168.0.42:8000"."""
    sem_esquema = origin.split("://", 1)[-1]
    return sem_esquema.split("/", 1)[0].strip().lower()


def _allowed_origins(websocket: WebSocket) -> tuple[str, ...]:
    settings = getattr(websocket.app.state, "settings", None)
    return tuple(getattr(settings, "allowed_origins", ()) or ())


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    origem = websocket.headers.get("origin")
    if not origin_allowed(origem, _allowed_origins(websocket), websocket.headers.get("host")):
        logger.warning("conexao recusada por origem: %s", origem)
        await websocket.close(code=4403)
        return

    await websocket.accept()
    registry = get_registry()
    room: Room | None = None
    player: PlayerSession | None = None

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
                msg_type = str(message.get("type", ""))
                payload = message.get("payload") or {}
                if not isinstance(payload, dict):
                    payload = {}
            except (ValueError, AttributeError):
                continue

            # PING fica fora do lock: e a unica mensagem de caminho quente e o
            # cliente usa a resposta para estimar o offset de relogio.
            if msg_type == "PING":
                if player is not None:
                    player.touch()
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "PONG",
                            "payload": {
                                # Ambos em ms, para o cliente calcular offset e
                                # RTT sem converter unidade.
                                "clientTime": payload.get("clientTime", 0),
                                "serverTime": now_ms(),
                            },
                        }
                    )
                )
                continue

            if msg_type == "JOIN":
                if player is not None and room is not None:
                    async with room.lock:
                        await room.send_error(
                            player, ErrorCode.ALREADY_JOINED, "Ja entrou na sala."
                        )
                    continue
                if str(payload.get("version", "")) != PROTOCOL_VERSION:
                    await _reject(
                        websocket,
                        ErrorCode.PROTOCOL,
                        "Versao de protocolo incompativel. O servidor fala a versao "
                        f"{PROTOCOL_VERSION}. Recarregue a pagina.",
                    )
                    return

                # Sem codigo = criar sala. Com codigo = entrar na existente.
                pedido = normalize_code(payload.get("roomCode"))
                if pedido:
                    room = registry.get(pedido)
                    if room is None:
                        await _reject(
                            websocket,
                            ErrorCode.ROOM_NOT_FOUND,
                            f"Nao existe sala com o codigo {pedido}.",
                        )
                        return
                else:
                    room = registry.create()
                    if room is None:
                        await _reject(
                            websocket,
                            ErrorCode.TOO_MANY_ROOMS,
                            "O servidor esta com salas demais. Tente em instantes.",
                        )
                        return

                async with room.lock:
                    if len(room.players) >= MAX_PLAYERS:
                        await _reject(
                            websocket,
                            ErrorCode.ROOM_FULL,
                            f"A sala {room.code} esta cheia ({MAX_PLAYERS} jogadores).",
                        )
                        return
                    player = PlayerSession(websocket, _clean_name(payload.get("name"), "Player"))
                    # WELCOME antes do ROOM_STATE: o cliente precisa do proprio
                    # id para se achar na lista. Comparar por nome nao funciona,
                    # dois jogadores podem ter o mesmo nome.
                    await room.send_to(
                        player,
                        "WELCOME",
                        {
                            "playerId": player.id,
                            "roomCode": room.code,
                            "protocol": PROTOCOL_VERSION,
                            "serverTime": now_ms(),
                            "maxPlayers": MAX_PLAYERS,
                            "heartbeatTimeout": HEARTBEAT_TIMEOUT,
                        },
                    )
                    await room.add(player)
                continue

            if player is None or room is None:
                continue

            async with room.lock:
                keep_going = await _handle(room, player, msg_type, payload)
            if not keep_going:
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("erro no websocket da partida")
    finally:
        if player is not None and room is not None:
            async with room.lock:
                await room.remove(player)
        registry.discard_expired()
