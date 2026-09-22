"""Parser de notes.chart, o formato TEXTO do Clone Hero.

Muita pasta da comunidade vem so com `.chart` - e ha pasta que traz o
`.chart` simplesmente RENOMEADO para `notes.mid`, o que enganava o jogo ate
o cabecalho do arquivo ser conferido.

DECISAO CENTRAL: este modulo NAO monta chart. Ele traduz o texto para as
mesmas estruturas do `midi_parser` (`ParsedSong`, `RawTrack`, `RawNote`), e
quem monta o chart continua sendo o `build_chart` de la, um so. Duas
montagens divergiriam - HOPO, sustain e star power sairiam diferentes
conforme o arquivo fosse .mid ou .chart, e dois jogadores com a mesma musica
em formatos diferentes dessincronizariam na partida.

Formato (resumo do que importa aqui):

    [Song]         Resolution, Offset e metadados
    [SyncTrack]    <tick> = B <bpm*1000>     mudanca de andamento
                   <tick> = TS <num>         formula de compasso (ignorada)
    [Events]       <tick> = E "section Nome"
    [ExpertSingle] <tick> = N <lane> <len>   nota ou marcador
                   <tick> = S <tipo> <len>   frase (2 = star power)
                   <tick> = E solo/soloend   marcador de solo

Lanes de `N`:

    0..4  trastes verde..laranja
    5     FORCAGEM: inverte o que seria natural (nao e "vire HOPO")
    6     tap
    7     open note - ainda nao suportado, igual ao parser de MIDI
"""

from __future__ import annotations

import re
from pathlib import Path

from .midi_parser import (
    DIFFICULTY_BASE,
    FORCE_HOPO_OFFSET,
    FORCE_STRUM_OFFSET,
    LANE_COUNT,
    SOLO_PITCH,
    STAR_POWER_PITCH,
    TAP_PITCH,
    MidiParseError,
    ParsedSong,
    RawNote,
    RawTrack,
    TempoMap,
    hopo_threshold,
    natural_hopo,
)

#: Sufixo da secao -> instrumento interno. `Single` e a guitarra principal.
TRACK_INSTRUMENTS: dict[str, str] = {
    "Single": "guitar",
    "DoubleGuitar": "guitar_coop",
    "DoubleRhythm": "rhythm",
    "DoubleBass": "bass",
    "Drums": "drums",
    "Keyboard": "keys",
}

#: Prefixo da secao -> dificuldade.
TRACK_DIFFICULTIES: dict[str, str] = {
    "Easy": "easy",
    "Medium": "medium",
    "Hard": "hard",
    "Expert": "expert",
}

#: Marcador de lane que nao e traste.
FORCE_LANE = 5
TAP_LANE = 6
OPEN_LANE = 7

#: Tipo de frase em `S`. 2 = star power; os outros nao sao usados.
STAR_POWER_PHRASE = 2

#: Ordem em que a dificuldade e consultada para star power, solo e tap.
PREFERENCIA_MARCADOR = ("expert", "hard", "medium", "easy")

#: Teto de tamanho, igual ao do MIDI: chart de musica real fica bem abaixo.
MAX_CHART_BYTES = 8 * 1024 * 1024

_SECTION_HEADER = re.compile(r"^\[(?P<nome>[^\]]+)\]$")
_EVENT = re.compile(r"^\s*(?P<tick>\d+)\s*=\s*(?P<tipo>[A-Za-z]+)\s*(?P<resto>.*)$")
_SECTION_EVENT = re.compile(r'^"?\s*section\s+(?P<nome>.+?)\s*"?$', re.IGNORECASE)


def _blocos(texto: str) -> dict[str, list[str]]:
    """Reparte o arquivo em secoes: nome -> linhas de dentro das chaves."""
    blocos: dict[str, list[str]] = {}
    atual: str | None = None

    for linha_crua in texto.splitlines():
        linha = linha_crua.strip()
        if not linha:
            continue

        cabecalho = _SECTION_HEADER.match(linha)
        if cabecalho:
            atual = cabecalho.group("nome").strip()
            blocos.setdefault(atual, [])
            continue

        if linha in ("{", "}"):
            continue
        if atual is not None:
            blocos[atual].append(linha)

    return blocos


def _resolucao(linhas: list[str]) -> int:
    for linha in linhas:
        chave, _, valor = linha.partition("=")
        if chave.strip().lower() != "resolution":
            continue
        try:
            return max(1, int(float(valor.strip().strip('"'))))
        except ValueError:
            break
    # O Clone Hero grava 192 quando nada e declarado.
    return 192


def _tempos(linhas: list[str]) -> list[tuple[int, int]]:
    """`<tick> = B <bpm*1000>` -> (tick, microssegundos por batida)."""
    eventos: list[tuple[int, int]] = []
    for linha in linhas:
        evento = _EVENT.match(linha)
        if not evento or evento.group("tipo").upper() != "B":
            continue
        try:
            tick = int(evento.group("tick"))
            milesimos = int(evento.group("resto").split()[0])
        except (ValueError, IndexError):
            continue
        if milesimos <= 0:
            continue
        # O .chart grava BPM multiplicado por mil para nao usar decimal.
        eventos.append((tick, round(60_000_000_000 / milesimos)))
    return eventos


def _secoes(linhas: list[str]) -> list[tuple[int, str]]:
    achadas: list[tuple[int, str]] = []
    for linha in linhas:
        evento = _EVENT.match(linha)
        if not evento or evento.group("tipo").upper() != "E":
            continue
        nome = _SECTION_EVENT.match(evento.group("resto").strip())
        if nome:
            achadas.append((int(evento.group("tick")), nome.group("nome").strip()))
    return achadas


def _ler_trilha(linhas: list[str]) -> tuple[dict[int, list[tuple[int, int]]], list[RawNote], list[RawNote], list[RawNote]]:
    """Separa a trilha em gates, frases de star power, solos e taps."""
    gates: dict[int, list[tuple[int, int]]] = {}
    star_power: list[RawNote] = []
    solos: list[RawNote] = []
    taps: list[RawNote] = []
    solo_aberto: int | None = None

    for linha in linhas:
        evento = _EVENT.match(linha)
        if not evento:
            continue
        tick = int(evento.group("tick"))
        tipo = evento.group("tipo").upper()
        resto = evento.group("resto").split()

        if tipo == "N" and len(resto) >= 2:
            try:
                lane, length = int(resto[0]), int(resto[1])
            except ValueError:
                continue
            gates.setdefault(tick, []).append((lane, length))

        elif tipo == "S" and len(resto) >= 2:
            try:
                fase, length = int(resto[0]), int(resto[1])
            except ValueError:
                continue
            if fase == STAR_POWER_PHRASE:
                star_power.append(RawNote(tick=tick, length=length, pitch=STAR_POWER_PITCH))

        elif tipo == "E" and resto:
            marcador = resto[0].strip('"').lower()
            # Solo no .chart e um par abre/fecha, e nao uma nota com duracao.
            if marcador == "solo":
                solo_aberto = tick
            elif marcador == "soloend" and solo_aberto is not None:
                solos.append(
                    RawNote(tick=solo_aberto, length=tick - solo_aberto, pitch=SOLO_PITCH)
                )
                solo_aberto = None

    for tick, eventos in gates.items():
        if any(lane == TAP_LANE for lane, _ in eventos):
            taps.append(RawNote(tick=tick, length=0, pitch=TAP_PITCH))

    return gates, star_power, solos, taps


def _notas_da_dificuldade(
    gates: dict[int, list[tuple[int, int]]],
    dificuldade: str,
    ticks_por_batida: int,
) -> list[RawNote]:
    """Traduz os gates para o espaco de pitch do MIDI.

    A traducao da forcagem e o ponto delicado: no `.chart` o marcador INVERTE
    o que seria natural, enquanto o formato interno tem dois marcadores
    separados (forca HOPO / forca palhetada). Para escolher qual emitir e
    preciso saber o natural - por isso a regra vem do `midi_parser`, e nao de
    uma copia daqui.
    """
    base = DIFFICULTY_BASE[dificuldade]
    limite = hopo_threshold(ticks_por_batida)
    notas: list[RawNote] = []

    prev_tick: int | None = None
    prev_lanes: set[int] = set()

    for tick in sorted(gates):
        eventos = gates[tick]
        trastes = [(lane, length) for lane, length in eventos if lane < LANE_COUNT]
        if not trastes:
            continue

        lane_set = {lane for lane, _ in trastes}
        for lane, length in trastes:
            notas.append(RawNote(tick=tick, length=length, pitch=base + lane))

        if any(lane == FORCE_LANE for lane, _ in eventos):
            natural = natural_hopo(tick, lane_set, prev_tick, prev_lanes, limite)
            # Invertido: o que era HOPO vira palhetada e vice-versa.
            offset = FORCE_STRUM_OFFSET if natural else FORCE_HOPO_OFFSET
            notas.append(RawNote(tick=tick, length=0, pitch=base + offset))

        prev_tick, prev_lanes = tick, lane_set

    return notas


def parse_chart(path: Path | str) -> ParsedSong:
    caminho = Path(path)
    try:
        tamanho = caminho.stat().st_size
    except OSError as exc:
        raise MidiParseError(f"chart ilegivel: {exc}") from exc

    if tamanho > MAX_CHART_BYTES:
        raise MidiParseError("chart grande demais")

    try:
        # `utf-8-sig` come o BOM que o Moonscraper grava no inicio do arquivo.
        texto = caminho.read_text(encoding="utf-8-sig", errors="replace")
    except OSError as exc:
        raise MidiParseError(f"chart ilegivel: {exc}") from exc

    blocos = _blocos(texto)
    if "Song" not in blocos:
        raise MidiParseError("chart invalido: falta a secao [Song]")

    ticks_por_batida = _resolucao(blocos["Song"])
    tempo_map = TempoMap(ticks_por_batida, _tempos(blocos.get("SyncTrack", [])))
    sections = sorted(_secoes(blocos.get("Events", [])), key=lambda s: s[0])

    tracks: dict[str, RawTrack] = {}
    last_tick = 0

    #: (instrumento, dificuldade) -> frases, solos e taps daquela trilha.
    #:
    #: No `.chart` esses marcadores sao POR DIFICULDADE; no formato interno
    #: eles valem para o instrumento inteiro, como no MIDI. A escolha de qual
    #: dificuldade manda fica para o fim, quando sabemos quais existem.
    marcadores: dict[tuple[str, str], tuple[list[RawNote], list[RawNote], list[RawNote]]] = {}

    for nome, linhas in blocos.items():
        dificuldade = instrumento = None
        for prefixo, valor in TRACK_DIFFICULTIES.items():
            if nome.startswith(prefixo):
                sufixo = nome[len(prefixo) :]
                instrumento = TRACK_INSTRUMENTS.get(sufixo)
                dificuldade = valor
                break
        if instrumento is None or dificuldade is None:
            continue

        gates, star_power, solos, taps = _ler_trilha(linhas)
        if not gates:
            continue

        raw = tracks.setdefault(instrumento, RawTrack(instrument=instrumento))
        notas = _notas_da_dificuldade(gates, dificuldade, ticks_por_batida)
        raw.notes.extend(notas)
        marcadores[(instrumento, dificuldade)] = (star_power, solos, taps)

        for nota in notas:
            last_tick = max(last_tick, nota.tick + nota.length)
        for frase in star_power:
            last_tick = max(last_tick, frase.tick + frase.length)

    # O expert manda nos marcadores, caindo para a dificuldade mais alta que
    # existir. E a trilha mais completa: usar a do easy deixaria o expert com
    # menos frases de star power do que o chart realmente tem.
    for (instrumento, dificuldade), (star_power, solos, taps) in sorted(
        marcadores.items(),
        key=lambda item: PREFERENCIA_MARCADOR.index(item[0][1]),
    ):
        raw = tracks[instrumento]
        if not raw.star_power:
            raw.star_power.extend(star_power)
        if not raw.solos:
            raw.solos.extend(solos)
        if not raw.taps:
            raw.taps.extend(taps)

    if not tracks:
        raise MidiParseError("chart invalido: nenhuma trilha de notas encontrada")

    return ParsedSong(
        tempo_map=tempo_map,
        tracks=tracks,
        sections=sections,
        last_tick=last_tick,
    )
