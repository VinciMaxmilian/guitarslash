"""Parser do formato texto do Clone Hero (`notes.chart`).

O ponto que estes testes protegem nao e "o parser le o arquivo": e que ele
entrega as MESMAS estruturas do parser de MIDI, para o `build_chart` ser um
so. Uma segunda montagem por formato faria a mesma musica ser lida diferente
conforme o arquivo, e dois jogadores dessincronizariam na partida.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from backend.app.parsers import parse_song_chart
from backend.app.parsers.chart_parser import parse_chart
from backend.app.parsers.midi_parser import MidiParseError, build_chart

RESOLUCAO = 192


def escrever(tmp_path: Path, corpo: str, nome: str = "notes.chart") -> Path:
    caminho = tmp_path / nome
    caminho.write_text(textwrap.dedent(corpo).lstrip(), encoding="utf-8")
    return caminho


CABECALHO = f"""
    [Song]
    {{
      Name = "Teste"
      Resolution = {RESOLUCAO}
    }}
    [SyncTrack]
    {{
      0 = TS 4
      0 = B 120000
    }}
    [Events]
    {{
      0 = E "section Intro"
    }}
"""


def test_le_notas_acordes_e_sustains(tmp_path: Path):
    caminho = escrever(
        tmp_path,
        CABECALHO
        + f"""
        [ExpertSingle]
        {{
          0 = N 0 0
          {RESOLUCAO} = N 1 0
          {RESOLUCAO} = N 2 0
          {RESOLUCAO * 2} = N 3 {RESOLUCAO}
        }}
        """,
    )
    chart = build_chart(parse_chart(caminho), "guitar", "expert")

    assert chart["note_count"] == 4
    # O acorde entra como UM gate, com as duas lanes.
    gates = {n["gate"] for n in chart["notes"]}
    assert len(gates) == 3
    assert sorted(n["lane"] for n in chart["notes"] if n["gate"] == 1) == [1, 2]
    # Uma batida a 120 BPM = 0,5 s.
    assert chart["notes"][-1]["duration"] == pytest.approx(0.5)


def test_bpm_vem_em_milesimos(tmp_path: Path):
    # `B 120000` e 120 BPM: o .chart grava multiplicado por mil para nao
    # precisar de decimal. Ler o numero cru daria 120000 BPM.
    caminho = escrever(tmp_path, CABECALHO + "[ExpertSingle]\n{\n  192 = N 0 0\n}\n")
    chart = build_chart(parse_chart(caminho), "guitar", "expert")

    assert chart["bpm"][0]["bpm"] == pytest.approx(120)
    assert chart["notes"][0]["time"] == pytest.approx(0.5)


def test_frase_de_star_power(tmp_path: Path):
    caminho = escrever(
        tmp_path,
        CABECALHO
        + f"""
        [ExpertSingle]
        {{
          0 = S 2 {RESOLUCAO * 2}
          0 = N 0 0
          {RESOLUCAO} = N 1 0
        }}
        """,
    )
    chart = build_chart(parse_chart(caminho), "guitar", "expert")

    assert len(chart["star_power"]) == 1
    assert chart["star_power"][0]["time"] == pytest.approx(0)
    assert chart["star_power"][0]["duration"] == pytest.approx(1.0)


def test_solo_e_um_par_abre_fecha(tmp_path: Path):
    # Diferente do MIDI, onde o solo e uma nota com duracao.
    caminho = escrever(
        tmp_path,
        CABECALHO
        + f"""
        [ExpertSingle]
        {{
          0 = E solo
          0 = N 0 0
          {RESOLUCAO * 2} = E soloend
        }}
        """,
    )
    chart = build_chart(parse_chart(caminho), "guitar", "expert")

    assert len(chart["solos"]) == 1
    assert chart["solos"][0]["duration"] == pytest.approx(1.0)


def test_forcagem_inverte_o_natural(tmp_path: Path):
    """No `.chart` o marcador 5 nao diz "vire HOPO": diz "inverta".

    Duas notas coladas em trastes diferentes seriam HOPO por natureza. Com a
    forcagem, a segunda tem de virar palhetada - e nao continuar HOPO, que e
    o que uma leitura ingenua do marcador faria.
    """
    colado = RESOLUCAO // 8  # bem dentro do limite de HOPO

    natural = build_chart(
        parse_chart(
            escrever(
                tmp_path,
                CABECALHO + f"[ExpertSingle]\n{{\n  0 = N 0 0\n  {colado} = N 1 0\n}}\n",
                "natural.chart",
            )
        ),
        "guitar",
        "expert",
    )
    assert natural["notes"][1]["type"] == "hopo"

    forcado = build_chart(
        parse_chart(
            escrever(
                tmp_path,
                CABECALHO
                + f"[ExpertSingle]\n{{\n  0 = N 0 0\n  {colado} = N 1 0\n  {colado} = N 5 0\n}}\n",
                "forcado.chart",
            )
        ),
        "guitar",
        "expert",
    )
    assert forcado["notes"][1]["type"] == "normal"


def test_tap(tmp_path: Path):
    caminho = escrever(
        tmp_path,
        CABECALHO + "[ExpertSingle]\n{\n  0 = N 0 0\n  0 = N 6 0\n}\n",
    )
    chart = build_chart(parse_chart(caminho), "guitar", "expert")
    assert chart["notes"][0]["type"] == "tap"


def test_varias_dificuldades_e_instrumentos(tmp_path: Path):
    caminho = escrever(
        tmp_path,
        CABECALHO
        + """
        [ExpertSingle]
        {
          0 = N 0 0
        }
        [EasySingle]
        {
          0 = N 1 0
        }
        [ExpertDoubleBass]
        {
          0 = N 2 0
        }
        """,
    )
    resumo = parse_chart(caminho).instrument_summary()

    assert resumo["guitar"]["difficulties"] == ["easy", "expert"]
    assert resumo["bass"]["difficulties"] == ["expert"]


def test_secoes_saem_dos_eventos(tmp_path: Path):
    caminho = escrever(tmp_path, CABECALHO + "[ExpertSingle]\n{\n  0 = N 0 0\n}\n")
    chart = build_chart(parse_chart(caminho), "guitar", "expert")
    assert chart["sections"] == [{"time": 0.0, "name": "Intro"}]


def test_open_note_e_ignorada_sem_derrubar_a_musica(tmp_path: Path):
    # Open note (lane 7) ainda nao e suportada, igual ao parser de MIDI. Ela
    # some, mas as outras notas da musica continuam jogaveis.
    caminho = escrever(
        tmp_path,
        CABECALHO + f"[ExpertSingle]\n{{\n  0 = N 7 0\n  {RESOLUCAO} = N 0 0\n}}\n",
    )
    chart = build_chart(parse_chart(caminho), "guitar", "expert")
    assert chart["note_count"] == 1


def test_arquivo_sem_secao_song_e_recusado(tmp_path: Path):
    caminho = escrever(tmp_path, "[ExpertSingle]\n{\n  0 = N 0 0\n}\n")
    with pytest.raises(MidiParseError):
        parse_chart(caminho)


def test_arquivo_sem_trilha_de_notas_e_recusado(tmp_path: Path):
    caminho = escrever(tmp_path, CABECALHO)
    with pytest.raises(MidiParseError):
        parse_chart(caminho)


def test_bom_do_moonscraper_nao_atrapalha(tmp_path: Path):
    # O editor grava BOM de UTF-8 no inicio; sem `utf-8-sig` a primeira
    # secao viria como "﻿[Song]" e nada seria reconhecido.
    caminho = tmp_path / "notes.chart"
    corpo = textwrap.dedent(CABECALHO).lstrip() + "[ExpertSingle]\n{\n  0 = N 0 0\n}\n"
    caminho.write_bytes(b"\xef\xbb\xbf" + corpo.encode("utf-8"))

    assert build_chart(parse_chart(caminho), "guitar", "expert")["note_count"] == 1


def test_dispatcher_le_chart_renomeado_para_mid(tmp_path: Path):
    """O caso que motivou tudo isto.

    Pasta da comunidade com o `.chart` renomeado para `notes.mid`. A extensao
    mente; o cabecalho nao. Antes disso, a musica era simplesmente recusada.
    """
    caminho = escrever(
        tmp_path,
        CABECALHO + "[ExpertSingle]\n{\n  0 = N 0 0\n}\n",
        nome="notes.mid",
    )
    chart = build_chart(parse_song_chart(caminho), "guitar", "expert")
    assert chart["note_count"] == 1
