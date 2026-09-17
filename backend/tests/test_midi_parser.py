from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.parsers.midi_parser import (
    DEFAULT_TEMPO,
    MidiParseError,
    TempoMap,
    build_chart,
    parse_midi,
)

from .conftest import BEAT, TICKS_PER_BEAT


@pytest.fixture
def parsed(song_dir: Path):
    return parse_midi(song_dir / "The Test Band - Slash Test" / "notes.mid")


# ------------------------------------------------------------------ tempo map


def test_tempo_map_converte_ticks_em_segundos():
    tempo = TempoMap(480, [(0, DEFAULT_TEMPO)])
    assert tempo.seconds_at(0) == 0.0
    assert tempo.seconds_at(480) == pytest.approx(0.5)
    assert tempo.seconds_at(960) == pytest.approx(1.0)


def test_tempo_map_respeita_mudanca_de_andamento():
    # 120 BPM ate a batida 4, depois 240 BPM.
    tempo = TempoMap(480, [(0, DEFAULT_TEMPO), (4 * 480, DEFAULT_TEMPO // 2)])
    assert tempo.seconds_at(4 * 480) == pytest.approx(2.0)
    # Batidas passam a durar metade do tempo.
    assert tempo.seconds_at(6 * 480) == pytest.approx(2.5)


def test_tempo_map_assume_120bpm_sem_evento_inicial():
    tempo = TempoMap(480, [])
    assert tempo.seconds_at(480) == pytest.approx(0.5)


# ------------------------------------------------------------------ deteccao


def test_detecta_instrumentos_e_dificuldades(parsed):
    summary = parsed.instrument_summary()
    assert set(summary) == {"guitar", "bass"}
    assert summary["guitar"]["difficulties"] == ["hard", "expert"]
    assert summary["bass"]["difficulties"] == ["easy"]
    assert summary["guitar"]["supported"] is True


def test_nao_inventa_instrumento_ausente(parsed):
    summary = parsed.instrument_summary()
    assert "drums" not in summary
    assert "vocals" not in summary


def test_le_secoes_do_track_events(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    nomes = [s["name"] for s in chart["sections"]]
    assert nomes == ["Intro", "Verse 1"]
    assert chart["sections"][1]["time"] == pytest.approx(8 * BEAT)


def test_midi_invalido_levanta_erro(tmp_path: Path):
    ruim = tmp_path / "notes.mid"
    ruim.write_bytes(b"isso nao e um midi")
    with pytest.raises(MidiParseError):
        parse_midi(ruim)


# ------------------------------------------------------------------ chart


def test_notas_convertidas_para_segundos(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    primeiras = [n for n in chart["notes"] if n["time"] < 3 * BEAT]
    assert [n["lane"] for n in primeiras] == [0, 1, 2]
    assert primeiras[1]["time"] == pytest.approx(BEAT)
    assert primeiras[2]["time"] == pytest.approx(2 * BEAT)


def test_acorde_compartilha_o_mesmo_gate(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    acorde = [n for n in chart["notes"] if n["time"] == pytest.approx(4 * BEAT)]
    assert len(acorde) == 2
    assert {n["lane"] for n in acorde} == {0, 1}
    assert acorde[0]["gate"] == acorde[1]["gate"]


def test_notas_simultaneas_separadas_tem_gates_diferentes(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    gates = {n["gate"] for n in chart["notes"]}
    # 3 notas simples + acorde + hopo + sustain = 6 gates.
    assert len(gates) == 6


def test_sustain_longo_vira_duracao(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    sustain = next(n for n in chart["notes"] if n["lane"] == 4)
    assert sustain["duration"] == pytest.approx(2 * BEAT)


def test_nota_curta_nao_vira_sustain(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    curtas = [n for n in chart["notes"] if n["lane"] in (0, 1, 2)]
    assert all(n["duration"] == 0.0 for n in curtas)


def test_hopo_natural_detectado(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    hopo = next(n for n in chart["notes"] if n["lane"] == 3)
    assert hopo["type"] == "hopo"


def test_acorde_nunca_e_hopo(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    acorde = [n for n in chart["notes"] if n["time"] == pytest.approx(4 * BEAT)]
    assert all(n["type"] == "normal" for n in acorde)


def test_star_power_convertido(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    assert len(chart["star_power"]) == 1
    assert chart["star_power"][0]["time"] == pytest.approx(0.0)
    assert chart["star_power"][0]["duration"] == pytest.approx(3 * BEAT)


def test_star_power_nao_entra_como_nota(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    assert all(0 <= n["lane"] <= 4 for n in chart["notes"])


def test_dificuldades_sao_independentes(parsed):
    expert = build_chart(parsed, "guitar", "expert")
    hard = build_chart(parsed, "guitar", "hard")
    assert expert["note_count"] == 7
    assert hard["note_count"] == 1


def test_resolucao_e_bpm_expostos(parsed):
    chart = build_chart(parsed, "guitar", "expert")
    assert chart["resolution"] == TICKS_PER_BEAT
    assert chart["bpm"][0]["bpm"] == pytest.approx(120.0)
    assert chart["bpm"][1]["bpm"] == pytest.approx(240.0)


def test_instrumento_inexistente_levanta(parsed):
    with pytest.raises(MidiParseError):
        build_chart(parsed, "drums", "expert")


def test_dificuldade_invalida_levanta(parsed):
    with pytest.raises(MidiParseError):
        build_chart(parsed, "guitar", "insane")
