"""Leitura de charts.

Dois formatos entram, UM sai: tanto o `notes.mid` (padrao Rock Band / Clone
Hero) quanto o `notes.chart` (formato texto do Clone Hero) viram o mesmo
`ParsedSong`, e o chart em si e montado por `build_chart`, que e unico. Uma
segunda montagem por formato faria a mesma musica ser lida diferente
conforme o arquivo, e dois jogadores dessincronizariam na partida.
"""

from pathlib import Path

from .chart_parser import parse_chart
from .midi_parser import MidiParseError, ParsedSong, build_chart, parse_midi

#: Extensoes de chart em ordem de preferencia. O MIDI vem primeiro: quando a
#: pasta traz os dois, ele e o formato que os editores exportam por ultimo.
CHART_SUFFIXES = (".mid", ".midi", ".chart")


def parse_song_chart(path: Path | str) -> ParsedSong:
    """Le o chart escolhendo o parser pela extensao.

    O nome do arquivo nao e prova de nada - existe pasta com `.chart`
    renomeado para `notes.mid` - entao o conteudo decide quando a extensao
    diz MIDI mas o cabecalho nao confirma.
    """
    caminho = Path(path)
    if caminho.suffix.lower() == ".chart":
        return parse_chart(caminho)

    try:
        with caminho.open("rb") as arquivo:
            cabecalho = arquivo.read(4)
    except OSError as exc:
        raise MidiParseError(f"chart ilegivel: {exc}") from exc

    # "MThd" e o inicio de todo arquivo MIDI. Sem ele, ainda pode ser um
    # `.chart` de nome trocado: tentar o parser de texto da uma musica
    # jogavel onde antes havia so uma mensagem de erro.
    if cabecalho != b"MThd":
        return parse_chart(caminho)
    return parse_midi(caminho)


__all__ = [
    "CHART_SUFFIXES",
    "MidiParseError",
    "ParsedSong",
    "build_chart",
    "parse_chart",
    "parse_midi",
    "parse_song_chart",
]
