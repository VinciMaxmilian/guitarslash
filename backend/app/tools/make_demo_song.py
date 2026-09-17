"""Gera uma musica de demonstracao 100% original.

    python -m backend.app.tools.make_demo_song

Cria songs/Guitar Slash - Neon Highway/ com notes.mid, song.ini e song.wav.
O audio e sintetizado aqui mesmo, a partir do proprio chart, entao o jogo
fica jogavel e verificavel sem nenhum conteudo de terceiros.
"""

from __future__ import annotations

import argparse
import math
import struct
import wave
from pathlib import Path

import mido

from ..config import load_settings

TICKS_PER_BEAT = 480
BPM = 100
BEAT = 60.0 / BPM
SAMPLE_RATE = 44100

EXPERT, HARD, MEDIUM, EASY = 96, 84, 72, 60
STAR_POWER = 116

# Escala pentatonica de Mi menor: da um riff de rock sem copiar nada.
LANE_SEMITONES = [0, 3, 5, 7, 10]
ROOT_HZ = 164.81  # E3

# Riff em colcheias: (posicao em colcheias, lanes, duracao em colcheias)
RIFF: list[tuple[int, tuple[int, ...], int]] = [
    (0, (0,), 1),
    (2, (0,), 1),
    (3, (1,), 1),
    (4, (2,), 1),
    (6, (1,), 1),
    (7, (0,), 1),
    (8, (2,), 1),
    (10, (2,), 1),
    (11, (3,), 1),
    (12, (4,), 1),
    (14, (3,), 1),
    (15, (2,), 1),
]

CHORUS: list[tuple[int, tuple[int, ...], int]] = [
    (0, (0, 1), 2),
    (4, (1, 2), 2),
    (8, (2, 3), 2),
    (12, (0,), 4),
]

OUTRO: list[tuple[int, tuple[int, ...], int]] = [
    (0, (4,), 1),
    (1, (3,), 1),
    (2, (2,), 1),
    (3, (1,), 1),
    (4, (0,), 8),
]


def build_events() -> tuple[list[tuple[float, tuple[int, ...], float]], list[tuple[float, float]]]:
    """Devolve (notas, frases de star power) em BATIDAS."""
    notes: list[tuple[float, tuple[int, ...], float]] = []
    star_power: list[tuple[float, float]] = []

    def place(pattern: list[tuple[int, tuple[int, ...], int]], bar: int) -> None:
        offset = bar * 4.0
        for eighth, lanes, length in pattern:
            notes.append((offset + eighth * 0.5, lanes, length * 0.5))

    # Intro simples, para o jogador pegar o tempo.
    for index, lane in enumerate([0, 1, 2, 1]):
        notes.append((float(index), (lane,), 0.5))

    place(RIFF, bar=1)
    place(RIFF, bar=3)
    place(CHORUS, bar=5)
    star_power.append((5 * 4.0, 8.0))  # frase de star power no refrao
    place(RIFF, bar=7)
    place(CHORUS, bar=9)
    star_power.append((9 * 4.0, 8.0))
    place(RIFF, bar=11)
    place(OUTRO, bar=13)

    notes.sort(key=lambda n: n[0])
    return notes, star_power


def simplify(
    notes: list[tuple[float, tuple[int, ...], float]], keep: int, max_lane: int
) -> list[tuple[float, tuple[int, ...], float]]:
    """Versao mais facil: menos notas, menos lanes, sem acordes."""
    result = []
    for index, (beat, lanes, length) in enumerate(notes):
        if index % keep != 0:
            continue
        lane = min(lanes[0], max_lane)
        result.append((beat, (lane,), length))
    return result


def write_midi(path: Path) -> float:
    notes, star_power = build_events()

    midi = mido.MidiFile(ticks_per_beat=TICKS_PER_BEAT)

    tempo_track = mido.MidiTrack()
    tempo_track.append(mido.MetaMessage("track_name", name="guitar slash demo", time=0))
    tempo_track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM), time=0))
    midi.tracks.append(tempo_track)

    events_track = mido.MidiTrack()
    events_track.append(mido.MetaMessage("track_name", name="EVENTS", time=0))
    for beat, name in [(0, "Intro"), (4, "Riff"), (20, "Refrao"), (52, "Final")]:
        events_track.append(
            mido.MetaMessage("text", text=f"[section {name}]", time=round(beat * TICKS_PER_BEAT))
        )
    _to_delta(events_track)
    midi.tracks.append(events_track)

    absolute: list[tuple[int, mido.Message]] = []

    def add(beat: float, pitch: int, length_beats: float) -> None:
        tick = round(beat * TICKS_PER_BEAT)
        length = max(1, round(length_beats * TICKS_PER_BEAT))
        absolute.append((tick, mido.Message("note_on", note=pitch, velocity=100)))
        absolute.append((tick + length, mido.Message("note_off", note=pitch, velocity=0)))

    for beat, lanes, length in notes:
        for lane in lanes:
            add(beat, EXPERT + lane, length)
    for beat, lanes, length in simplify(notes, 1, 3):
        for lane in lanes:
            add(beat, HARD + lane, length)
    for beat, lanes, length in simplify(notes, 2, 2):
        for lane in lanes:
            add(beat, MEDIUM + lane, length)
    for beat, lanes, length in simplify(notes, 3, 1):
        for lane in lanes:
            add(beat, EASY + lane, length)

    for beat, length in star_power:
        add(beat, STAR_POWER, length)

    guitar = mido.MidiTrack()
    guitar.append(mido.MetaMessage("track_name", name="PART GUITAR", time=0))
    ordered = sorted(absolute, key=lambda e: (e[0], 0 if e[1].type == "note_off" else 1))
    previous = 0
    for tick, message in ordered:
        guitar.append(message.copy(time=tick - previous))
        previous = tick
    guitar.append(mido.MetaMessage("end_of_track", time=0))
    midi.tracks.append(guitar)

    midi.save(str(path))

    last_beat = max(beat + length for beat, _, length in notes)
    return (last_beat + 4) * BEAT


def _to_delta(track: mido.MidiTrack) -> None:
    """Converte uma track escrita com ticks absolutos para delta."""
    previous = 0
    for message in track:
        if message.type == "track_name":
            continue
        absolute = message.time
        message.time = absolute - previous
        previous = absolute


def write_wav(path: Path, duration: float) -> None:
    """Sintetiza o audio a partir do mesmo chart, para ficar sincronizado."""
    notes, _ = build_events()
    total = int(duration * SAMPLE_RATE)
    buffer = [0.0] * total

    def pluck(start: float, frequency: float, length: float, gain: float) -> None:
        begin = int(start * SAMPLE_RATE)
        samples = int(min(length + 0.45, 2.2) * SAMPLE_RATE)
        for index in range(samples):
            position = begin + index
            if position >= total:
                break
            seconds = index / SAMPLE_RATE
            envelope = math.exp(-3.2 * seconds)
            phase = 2 * math.pi * frequency * seconds
            value = (
                math.sin(phase)
                + 0.5 * math.sin(2 * phase)
                + 0.28 * math.sin(3 * phase)
                + 0.12 * math.sin(4 * phase)
            )
            buffer[position] += gain * envelope * value

    # Guitarra: uma nota por lane.
    for beat, lanes, length in notes:
        start = beat * BEAT
        for lane in lanes:
            frequency = ROOT_HZ * (2 ** (LANE_SEMITONES[lane] / 12))
            pluck(start, frequency, length * BEAT, 0.16 / len(lanes))

    # Bumbo em cada tempo, para o groove ficar claro.
    beat_count = int(duration / BEAT)
    for index in range(beat_count):
        start = index * BEAT
        begin = int(start * SAMPLE_RATE)
        for sample in range(int(0.16 * SAMPLE_RATE)):
            position = begin + sample
            if position >= total:
                break
            seconds = sample / SAMPLE_RATE
            envelope = math.exp(-26 * seconds)
            frequency = 110 * math.exp(-18 * seconds) + 45
            buffer[position] += 0.42 * envelope * math.sin(2 * math.pi * frequency * seconds)

    peak = max(1e-6, max(abs(value) for value in buffer))
    scale = 0.86 / peak

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(
            b"".join(struct.pack("<h", int(max(-1.0, min(1.0, v * scale)) * 32767)) for v in buffer)
        )


SONG_INI = """[song]
name = Neon Highway
artist = Guitar Slash
album = Demo Sessions
year = 2026
genre = Rock
charter = guitarslash
song_length = {length_ms}
preview_start_time = {preview_ms}
delay = 0
diff_guitar = 3
"""


def main() -> None:
    parser = argparse.ArgumentParser(prog="make_demo_song")
    parser.add_argument("--songs-dir", type=Path, default=None)
    args = parser.parse_args()

    songs_dir = args.songs_dir or load_settings().songs_dir
    target = songs_dir / "Guitar Slash - Neon Highway"
    target.mkdir(parents=True, exist_ok=True)

    duration = write_midi(target / "notes.mid")
    print(f"chart gerado ({duration:.1f}s)")

    write_wav(target / "song.wav", duration)
    print("audio sintetizado")

    (target / "song.ini").write_text(
        SONG_INI.format(length_ms=int(duration * 1000), preview_ms=int(10 * BEAT * 1000)),
        encoding="utf-8",
    )

    print(f"\nmusica de demonstracao em: {target}")
    print("Ela e gerada por codigo: nenhum conteudo de terceiros envolvido.")


if __name__ == "__main__":
    main()
