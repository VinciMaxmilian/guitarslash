"""Fixtures: geram uma musica sintetica em disco, sem depender de assets reais."""

from __future__ import annotations

from pathlib import Path

import mido
import pytest

TICKS_PER_BEAT = 480
BPM = 120.0
BEAT = 60.0 / BPM  # 0.5s por batida

EXPERT = 96
HARD = 84
EASY = 60


def _track_from_absolute(name: str, events: list[tuple[int, mido.Message]]) -> mido.MidiTrack:
    """Monta uma track a partir de eventos com tick absoluto."""
    track = mido.MidiTrack()
    track.append(mido.MetaMessage("track_name", name=name, time=0))

    # note_off antes de note_on no mesmo tick, para nao engolir notas coladas.
    ordered = sorted(events, key=lambda e: (e[0], 0 if e[1].type == "note_off" else 1))
    previous = 0
    for tick, message in ordered:
        track.append(message.copy(time=tick - previous))
        previous = tick
    track.append(mido.MetaMessage("end_of_track", time=0))
    return track


def note(tick: int, pitch: int, length: int) -> list[tuple[int, mido.Message]]:
    return [
        (tick, mido.Message("note_on", note=pitch, velocity=100, channel=0)),
        (tick + length, mido.Message("note_off", note=pitch, velocity=0, channel=0)),
    ]


def build_test_midi(path: Path) -> None:
    midi = mido.MidiFile(ticks_per_beat=TICKS_PER_BEAT)

    tempo = mido.MidiTrack()
    tempo.append(mido.MetaMessage("track_name", name="guitarslash test", time=0))
    tempo.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM), time=0))
    # Dobra o andamento a partir da batida 16, para exercitar o TempoMap.
    tempo.append(
        mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM * 2), time=16 * TICKS_PER_BEAT)
    )
    tempo.append(mido.MetaMessage("end_of_track", time=0))
    midi.tracks.append(tempo)

    events_track = mido.MidiTrack()
    events_track.append(mido.MetaMessage("track_name", name="EVENTS", time=0))
    events_track.append(mido.MetaMessage("text", text="[section Intro]", time=0))
    events_track.append(
        mido.MetaMessage("text", text="[section Verse 1]", time=8 * TICKS_PER_BEAT)
    )
    events_track.append(mido.MetaMessage("end_of_track", time=0))
    midi.tracks.append(events_track)

    guitar: list[tuple[int, mido.Message]] = []
    # Tres notas simples, uma por batida, lanes 0, 1 e 2.
    guitar += note(0 * TICKS_PER_BEAT, EXPERT + 0, 10)
    guitar += note(1 * TICKS_PER_BEAT, EXPERT + 1, 10)
    guitar += note(2 * TICKS_PER_BEAT, EXPERT + 2, 10)
    # Acorde verde+vermelho na batida 4.
    guitar += note(4 * TICKS_PER_BEAT, EXPERT + 0, 10)
    guitar += note(4 * TICKS_PER_BEAT, EXPERT + 1, 10)
    # Nota colada (120 ticks depois) em lane diferente -> HOPO natural.
    guitar += note(4 * TICKS_PER_BEAT + 120, EXPERT + 3, 10)
    # Sustain de duas batidas na batida 6.
    guitar += note(6 * TICKS_PER_BEAT, EXPERT + 4, 2 * TICKS_PER_BEAT)
    # Star power cobrindo as tres primeiras batidas.
    guitar += note(0, 116, 3 * TICKS_PER_BEAT)
    # Uma nota no hard, para a deteccao de dificuldades achar duas.
    guitar += note(0 * TICKS_PER_BEAT, HARD + 0, 10)
    midi.tracks.append(_track_from_absolute("PART GUITAR", guitar))

    bass: list[tuple[int, mido.Message]] = []
    bass += note(0, EASY + 0, 10)
    bass += note(TICKS_PER_BEAT, EASY + 1, 10)
    midi.tracks.append(_track_from_absolute("PART BASS", bass))

    midi.save(str(path))


SONG_INI = """[song]
name = Slash Test
artist = The Test Band
album = Debug Sessions
year = 2026
genre = Rock
charter = guitarslash
song_length = 12000
preview_start_time = 3000
delay = 0
diff_guitar = 4
"""


@pytest.fixture
def song_dir(tmp_path: Path) -> Path:
    """Biblioteca com uma musica completa e uma pasta quebrada."""
    root = tmp_path / "songs"
    song = root / "The Test Band - Slash Test"
    song.mkdir(parents=True)

    (song / "song.ini").write_text(SONG_INI, encoding="utf-8")
    build_test_midi(song / "notes.mid")
    (song / "song.opus").write_bytes(b"OggS-fake-audio")
    (song / "album.jpg").write_bytes(b"\xff\xd8\xff-fake-jpeg")
    (song / "background.mp4").write_bytes(b"\x00\x00\x00\x18ftypmp42")

    # Pasta sem notes.mid: precisa aparecer na listagem com `missing`.
    broken = root / "Broken Song"
    broken.mkdir()
    (broken / "song.ini").write_text("[song]\nname = Broken\nartist = Nobody\n", encoding="utf-8")

    return root
