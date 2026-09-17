"""Parser de notes.mid no padrao Rock Band / Clone Hero.

Converte o MIDI para o formato interno do jogo. A conversao e feita em duas
etapas para que o scan da biblioteca (que so precisa saber quais instrumentos
e dificuldades existem) nao pague o custo de montar todos os charts.

Faixas reconhecidas:

    PART GUITAR, PART GUITAR COOP, PART RHYTHM, PART BASS,
    PART DRUMS, PART KEYS, PART VOCALS, EVENTS

Faixa de notas por dificuldade (5 lanes):

    easy    60..64      medium  72..76
    hard    84..88      expert  96..100

    base+5  forca HOPO
    base+6  forca strum

Marcadores globais da faixa:

    103  solo
    104  tap (Clone Hero)
    116  star power / overdrive

Nao suportado ainda (FASE 4): open notes (sysex do Phase Shift) e o parse
melodico de PART VOCALS.
"""

from __future__ import annotations

import bisect
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import mido

DEFAULT_TEMPO = 500_000  # 120 BPM em microssegundos por batida

TRACK_INSTRUMENTS: dict[str, str] = {
    "PART GUITAR": "guitar",
    "PART GUITAR COOP": "guitar_coop",
    "PART RHYTHM": "rhythm",
    "PART BASS": "bass",
    "PART DRUMS": "drums",
    "PART KEYS": "keys",
    "PART VOCALS": "vocals",
    "T1 GEMS": "guitar",  # charts antigos de GH1/GH2
}

# Instrumentos que a engine sabe tocar hoje.
SUPPORTED_INSTRUMENTS = {"guitar", "guitar_coop", "rhythm", "bass", "drums"}

# Instrumentos que usam a grade de 5 lanes por dificuldade.
FIVE_LANE_INSTRUMENTS = {"guitar", "guitar_coop", "rhythm", "bass", "keys", "drums"}

DIFFICULTY_BASE: dict[str, int] = {
    "easy": 60,
    "medium": 72,
    "hard": 84,
    "expert": 96,
}
DIFFICULTY_ORDER = ("easy", "medium", "hard", "expert")

LANE_COUNT = 5
FORCE_HOPO_OFFSET = 5
FORCE_STRUM_OFFSET = 6

SOLO_PITCH = 103
TAP_PITCH = 104
STAR_POWER_PITCH = 116

_SECTION_RE = re.compile(r"^\[(?:section|prc)[ _](?P<name>.+)\]$", re.IGNORECASE)


# --------------------------------------------------------------------------- tempo


class TempoMap:
    """Converte ticks em segundos respeitando todas as mudancas de andamento."""

    def __init__(self, ticks_per_beat: int, events: Iterable[tuple[int, int]]):
        self.ticks_per_beat = max(1, int(ticks_per_beat))

        ordered = sorted(set(events), key=lambda e: e[0])
        if not ordered or ordered[0][0] != 0:
            ordered.insert(0, (0, DEFAULT_TEMPO))

        self._ticks: list[int] = []
        self._seconds: list[float] = []
        self._tempos: list[int] = []

        seconds = 0.0
        prev_tick = 0
        prev_tempo = ordered[0][1]
        for tick, tempo in ordered:
            seconds += mido.tick2second(tick - prev_tick, self.ticks_per_beat, prev_tempo)
            self._ticks.append(tick)
            self._seconds.append(seconds)
            self._tempos.append(tempo)
            prev_tick, prev_tempo = tick, tempo

    def seconds_at(self, tick: int) -> float:
        idx = bisect.bisect_right(self._ticks, tick) - 1
        idx = max(0, idx)
        delta = tick - self._ticks[idx]
        return self._seconds[idx] + mido.tick2second(delta, self.ticks_per_beat, self._tempos[idx])

    def duration_seconds(self, tick: int, length_ticks: int) -> float:
        if length_ticks <= 0:
            return 0.0
        return self.seconds_at(tick + length_ticks) - self.seconds_at(tick)

    def bpm_events(self) -> list[dict[str, float]]:
        return [
            {"time": self._seconds[i], "bpm": round(mido.tempo2bpm(self._tempos[i]), 6)}
            for i in range(len(self._ticks))
        ]


# --------------------------------------------------------------------------- dados crus


@dataclass
class RawNote:
    tick: int
    length: int
    pitch: int


@dataclass
class RawTrack:
    instrument: str
    notes: list[RawNote] = field(default_factory=list)
    star_power: list[RawNote] = field(default_factory=list)
    solos: list[RawNote] = field(default_factory=list)
    taps: list[RawNote] = field(default_factory=list)

    def difficulties(self) -> dict[str, int]:
        """Dificuldades presentes -> quantidade de notas."""
        counts: dict[str, int] = {}
        for difficulty, base in DIFFICULTY_BASE.items():
            total = sum(1 for n in self.notes if base <= n.pitch < base + LANE_COUNT)
            if total:
                counts[difficulty] = total
        return counts


@dataclass
class ParsedSong:
    tempo_map: TempoMap
    tracks: dict[str, RawTrack]
    sections: list[tuple[int, str]]
    last_tick: int

    @property
    def length(self) -> float:
        return self.tempo_map.seconds_at(self.last_tick)

    def instrument_summary(self) -> dict[str, dict]:
        summary: dict[str, dict] = {}
        for name, track in self.tracks.items():
            counts = track.difficulties()
            supported = name in SUPPORTED_INSTRUMENTS
            if name == "vocals":
                # Detectamos a faixa, mas ainda nao convertemos o chart.
                summary[name] = {
                    "available": bool(track.notes),
                    "supported": False,
                    "difficulties": [],
                    "note_counts": {},
                }
                continue
            if not counts:
                continue
            summary[name] = {
                "available": True,
                "supported": supported,
                "difficulties": [d for d in DIFFICULTY_ORDER if d in counts],
                "note_counts": counts,
            }
        return summary


class MidiParseError(Exception):
    pass


# --------------------------------------------------------------------------- parse


def _pair_notes(messages: list[tuple[int, mido.Message]]) -> list[RawNote]:
    """Casa note_on com note_off e devolve notas com duracao em ticks."""
    open_notes: dict[int, list[int]] = {}
    result: list[RawNote] = []

    for tick, msg in messages:
        if msg.type == "note_on" and msg.velocity > 0:
            open_notes.setdefault(msg.note, []).append(tick)
        elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
            stack = open_notes.get(msg.note)
            if not stack:
                continue
            start = stack.pop(0)
            result.append(RawNote(tick=start, length=max(0, tick - start), pitch=msg.note))

    # note_on sem note_off correspondente: trata como nota instantanea.
    for pitch, stack in open_notes.items():
        for start in stack:
            result.append(RawNote(tick=start, length=0, pitch=pitch))

    result.sort(key=lambda n: (n.tick, n.pitch))
    return result


def parse_midi(path: Path | str) -> ParsedSong:
    try:
        midi = mido.MidiFile(str(path))
    except Exception as exc:  # mido levanta tipos variados em arquivo corrompido
        raise MidiParseError(f"MIDI invalido: {exc}") from exc

    tempo_events: list[tuple[int, int]] = []
    tracks: dict[str, RawTrack] = {}
    sections: list[tuple[int, str]] = []
    last_tick = 0

    for track in midi.tracks:
        tick = 0
        name = ""
        messages: list[tuple[int, mido.Message]] = []

        for msg in track:
            tick += msg.time
            if msg.type == "track_name" and not name:
                name = msg.name.strip()
            elif msg.type == "set_tempo":
                tempo_events.append((tick, msg.tempo))
            elif msg.type in ("note_on", "note_off"):
                messages.append((tick, msg))
            elif msg.type in ("text", "lyrics", "marker"):
                match = _SECTION_RE.match(msg.text.strip())
                if match:
                    sections.append((tick, match.group("name").strip()))

        last_tick = max(last_tick, tick)

        instrument = TRACK_INSTRUMENTS.get(name.upper())
        if instrument is None or not messages:
            continue

        raw = tracks.setdefault(instrument, RawTrack(instrument=instrument))
        for note in _pair_notes(messages):
            if note.pitch == STAR_POWER_PITCH:
                raw.star_power.append(note)
            elif note.pitch == SOLO_PITCH:
                raw.solos.append(note)
            elif note.pitch == TAP_PITCH:
                raw.taps.append(note)
            else:
                raw.notes.append(note)

    tempo_map = TempoMap(midi.ticks_per_beat, tempo_events)
    sections.sort(key=lambda s: s[0])
    return ParsedSong(tempo_map=tempo_map, tracks=tracks, sections=sections, last_tick=last_tick)


# --------------------------------------------------------------------------- chart


def _hopo_threshold(ticks_per_beat: int) -> int:
    # Clone Hero usa 170 ticks numa resolucao de 480; mantemos a proporcao.
    return round(ticks_per_beat * 170 / 480)


def _sustain_threshold(ticks_per_beat: int) -> int:
    # Sustains muito curtos viram notas normais, senao a highway fica poluida.
    return max(1, ticks_per_beat // 8)


def _spans(notes: list[RawNote], tempo: TempoMap) -> list[dict[str, float]]:
    return [
        {"time": tempo.seconds_at(n.tick), "duration": tempo.duration_seconds(n.tick, n.length)}
        for n in sorted(notes, key=lambda n: n.tick)
    ]


def build_chart(parsed: ParsedSong, instrument: str, difficulty: str) -> dict:
    """Converte uma faixa/dificuldade para o formato interno do jogo."""
    track = parsed.tracks.get(instrument)
    if track is None:
        raise MidiParseError(f"instrumento ausente no chart: {instrument}")
    if instrument not in FIVE_LANE_INSTRUMENTS:
        raise MidiParseError(f"instrumento ainda nao suportado: {instrument}")
    if difficulty not in DIFFICULTY_BASE:
        raise MidiParseError(f"dificuldade invalida: {difficulty}")

    base = DIFFICULTY_BASE[difficulty]
    tempo = parsed.tempo_map
    tpb = tempo.ticks_per_beat
    hopo_threshold = _hopo_threshold(tpb)
    sustain_threshold = _sustain_threshold(tpb)

    # Agrupa por tick: notas simultaneas formam um acorde (gate).
    gates: dict[int, dict] = {}
    for note in track.notes:
        offset = note.pitch - base
        if offset < 0 or offset > FORCE_STRUM_OFFSET:
            continue
        gate = gates.setdefault(note.tick, {"lanes": [], "force_hopo": False, "force_strum": False})
        if offset < LANE_COUNT:
            gate["lanes"].append((offset, note.length))
        elif offset == FORCE_HOPO_OFFSET:
            gate["force_hopo"] = True
        elif offset == FORCE_STRUM_OFFSET:
            gate["force_strum"] = True

    tap_ranges = [(n.tick, n.tick + n.length) for n in track.taps]

    def is_tap(tick: int) -> bool:
        return any(start <= tick <= end for start, end in tap_ranges)

    notes_out: list[dict] = []
    ordered_ticks = sorted(t for t, g in gates.items() if g["lanes"])
    prev_tick: int | None = None
    prev_lanes: set[int] = set()

    for gate_index, tick in enumerate(ordered_ticks):
        gate = gates[tick]
        lanes = sorted(gate["lanes"])
        lane_set = {lane for lane, _ in lanes}
        is_chord = len(lane_set) > 1

        natural_hopo = (
            not is_chord
            and prev_tick is not None
            and (tick - prev_tick) <= hopo_threshold
            and not lane_set.issubset(prev_lanes)
        )

        if is_tap(tick) and not is_chord:
            note_type = "tap"
        elif gate["force_strum"]:
            note_type = "normal"
        elif gate["force_hopo"]:
            note_type = "hopo"
        elif natural_hopo:
            note_type = "hopo"
        else:
            note_type = "normal"

        time = tempo.seconds_at(tick)
        for lane, length in lanes:
            duration = (
                tempo.duration_seconds(tick, length) if length >= sustain_threshold else 0.0
            )
            notes_out.append(
                {
                    "time": time,
                    "lane": lane,
                    "duration": duration,
                    "type": note_type,
                    "gate": gate_index,
                }
            )

        prev_tick, prev_lanes = tick, lane_set

    length = parsed.length
    if notes_out:
        last = max(n["time"] + n["duration"] for n in notes_out)
        length = max(length, last)

    return {
        "instrument": instrument,
        "difficulty": difficulty,
        "resolution": tpb,
        "length": length,
        "note_count": len(notes_out),
        "notes": notes_out,
        "star_power": _spans(track.star_power, tempo),
        "solos": _spans(track.solos, tempo),
        "sections": [{"time": tempo.seconds_at(t), "name": n} for t, n in parsed.sections],
        "bpm": tempo.bpm_events(),
    }
