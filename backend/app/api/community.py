"""Charts das musicas da comunidade.

Os arquivos ficam no Supabase Storage; os metadados, na tabela
`community_songs`. Falta um pedaco: transformar `notes.mid` em chart.

Isso e feito AQUI, e nao no navegador, por um motivo so: o parser de MIDI
(backend/app/parsers/midi_parser.py) tem mapa de tempo, deteccao de HOPO,
star power e sustain, e esta coberto por testes. Uma segunda implementacao em
TypeScript divergiria da primeira, e chart lido diferente entre jogadores e
dessincronia na partida.

SEGURANCA: o endpoint recebe um CAMINHO dentro do bucket, nunca uma URL. Aceitar
URL arbitraria e buscar do servidor seria SSRF - daria para usar a function
como proxy para a rede interna do provedor.
"""

from __future__ import annotations

import logging
import re
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, HTTPException, Query, Request

from ..models.song import Chart
from ..parsers.midi_parser import (
    DIFFICULTY_BASE,
    SUPPORTED_INSTRUMENTS,
    build_chart,
    parse_midi,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/community", tags=["community"])

#: Caminho de objeto no bucket: <uid>/<slug>/<arquivo>.
#:
#: O primeiro segmento e o uid de quem enviou, entao NAO tem ponto - isso
#: recusa de saida coisas como "exemplo.com/notes.mid". Sem "..", sem barra
#: inicial, sem esquema. E o que fecha a porta do SSRF e do path traversal.
#:
#: Ainda que algo passasse daqui, a base do bucket e sempre prefixada, entao o
#: caminho nunca alcanca outro host. A validacao e a segunda tranca.
SAFE_PATH = re.compile(
    r"^[A-Za-z0-9][A-Za-z0-9\-]*"          # <uid>, sem ponto
    r"(?:/[A-Za-z0-9][A-Za-z0-9._\-]*){1,3}$"  # <slug>/<arquivo>
)

#: notes.mid de musica real fica bem abaixo disto. Teto evita que um arquivo
#: gigante consuma a memoria da function.
MAX_MIDI_BYTES = 8 * 1024 * 1024

_TIMEOUT = 15

#: Parse de MIDI custa; o mesmo chart e pedido a cada retry e a cada jogador.
_CACHE_MAX = 32
_parsed_cache: OrderedDict[str, object] = OrderedDict()


def _base_url(request: Request) -> str:
    base = getattr(request.app.state.settings, "community_base_url", "")
    if not base:
        raise HTTPException(
            status_code=503,
            detail=(
                "musicas da comunidade nao configuradas neste servidor: "
                "defina GUITARSLASH_COMMUNITY_BASE_URL"
            ),
        )
    return base.rstrip("/")


def _validate_path(path: str) -> str:
    limpo = path.strip().lstrip("/")
    if not SAFE_PATH.match(limpo) or ".." in limpo:
        raise HTTPException(status_code=400, detail="caminho invalido")
    if not limpo.lower().endswith((".mid", ".midi")):
        raise HTTPException(status_code=400, detail="o caminho deve apontar para um .mid")
    return limpo


def _download(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=_TIMEOUT) as response:
            # Le um byte a mais que o teto para detectar o excesso sem
            # carregar o arquivo inteiro na memoria.
            data = response.read(MAX_MIDI_BYTES + 1)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise HTTPException(status_code=404, detail="notes.mid nao encontrado") from exc
        raise HTTPException(status_code=502, detail="falha ao buscar o chart") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="falha ao buscar o chart") from exc

    if len(data) > MAX_MIDI_BYTES:
        raise HTTPException(status_code=413, detail="notes.mid grande demais")
    if not data:
        raise HTTPException(status_code=502, detail="notes.mid vazio")
    return data


def _parse(request: Request, path: str):
    """Baixa e parseia o MIDI, com cache em memoria."""
    safe = _validate_path(path)
    if safe in _parsed_cache:
        _parsed_cache.move_to_end(safe)
        return _parsed_cache[safe]

    data = _download(f"{_base_url(request)}/{safe}")

    # `mido` le de arquivo; o temporario e descartado em seguida.
    with NamedTemporaryFile(suffix=".mid", delete=False) as handle:
        handle.write(data)
        temporario = Path(handle.name)
    try:
        parsed = parse_midi(temporario)
    except Exception as exc:
        logger.warning("MIDI invalido em %s: %s", safe, exc)
        raise HTTPException(status_code=422, detail="notes.mid invalido") from exc
    finally:
        temporario.unlink(missing_ok=True)

    _parsed_cache[safe] = parsed
    while len(_parsed_cache) > _CACHE_MAX:
        _parsed_cache.popitem(last=False)
    return parsed


def clear_cache() -> None:
    """Usado pelos testes."""
    _parsed_cache.clear()


@router.get("/inspect")
def inspect(request: Request, path: str = Query(..., max_length=400)) -> dict:
    """Instrumentos, dificuldades e duracao de um notes.mid.

    Chamado UMA vez, no envio: o resultado e gravado na linha da musica para a
    lista nao precisar parsear MIDI a cada abertura.
    """
    parsed = _parse(request, path)
    # `instrument_summary` e a mesma fonte que a biblioteca local usa, entao a
    # lista da comunidade e a lista principal descrevem instrumento do mesmo
    # jeito.
    return {
        "length": round(parsed.length, 3),
        "instruments": parsed.instrument_summary(),
    }


@router.get("/chart", response_model=Chart)
def chart(
    request: Request,
    path: str = Query(..., max_length=400),
    instrument: str = Query(...),
    difficulty: str = Query(...),
) -> Chart:
    instrument = instrument.lower().strip()
    difficulty = difficulty.lower().strip()

    if difficulty not in DIFFICULTY_BASE:
        raise HTTPException(status_code=400, detail=f"dificuldade invalida: {difficulty}")
    if instrument not in SUPPORTED_INSTRUMENTS:
        raise HTTPException(status_code=400, detail=f"instrumento nao suportado: {instrument}")

    safe = _validate_path(path)
    parsed = _parse(request, path)
    built = build_chart(parsed, instrument, difficulty)
    # `build_chart` nao preenche o dono do chart; quem sabe o id e o chamador.
    # O slug e a pasta do arquivo: <uid>/<slug>/notes.mid.
    built["song_id"] = safe.split("/")[-2]
    if not built.get("notes"):
        raise HTTPException(
            status_code=404, detail=f"{instrument} nao tem notas em {difficulty}"
        )
    return Chart(**built)
