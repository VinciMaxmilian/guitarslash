"""Prepara as artes de interface para o frontend.

    python main.py ui-art

Os arquivos originais em `UI images/` sao capturas 1920x1080 com a arte no meio
e muito vazio em volta. Servidos assim, o navegador baixaria 400 KB para
mostrar um desenho que ocupa um terco da imagem, e o CSS teria que adivinhar o
recorte.

Este comando faz o trabalho uma vez, em tempo de build:

    - recorta no limite real do desenho;
    - transforma o fundo em transparente, para a arte assentar em qualquer cor
      (a tela de loading e vermelha, a de titulo e preta);
    - grava em frontend/public/ui/.

O desenho do anjo e preto sobre branco; o do titulo, cinza sobre preto. Por
isso o fundo a remover e detectado, e nao fixo.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from ..config import ROOT

SOURCE = ROOT / "UI images"
TARGET = ROOT / "frontend" / "public" / "ui"

#: Distancia maxima do branco/preto para o pixel contar como fundo.
TOLERANCE = 26


def _is_background(pixel: tuple[int, int, int, int], light: bool) -> bool:
    r, g, b, a = pixel
    if a == 0:
        return True
    if light:
        return r > 255 - TOLERANCE and g > 255 - TOLERANCE and b > 255 - TOLERANCE
    return r < TOLERANCE and g < TOLERANCE and b < TOLERANCE


def _background_is_light(image: Image.Image) -> bool:
    """Olha os cantos para decidir se o fundo e claro ou escuro."""
    w, h = image.size
    cantos = [
        image.getpixel((2, 2)),
        image.getpixel((w - 3, 2)),
        image.getpixel((2, h - 3)),
        image.getpixel((w - 3, h - 3)),
    ]
    claros = sum(1 for p in cantos if p[3] > 0 and p[0] > 128)
    return claros >= 2


def strip_background(image: Image.Image) -> Image.Image:
    """Fundo uniforme vira transparente; a arte fica."""
    image = image.convert("RGBA")
    light = _background_is_light(image)
    pixels = image.load()
    w, h = image.size

    for y in range(h):
        for x in range(w):
            if _is_background(pixels[x, y], light):
                pixels[x, y] = (0, 0, 0, 0)

    return image


def _main_run(counts: list[int]) -> tuple[int, int]:
    """Maior bloco contiguo de linhas/colunas com conteudo.

    `getbbox` sozinho nao serve: as capturas tem artefatos (uma risca vertical
    na borda, por exemplo) que ficam longe do desenho e esticam a caixa. Aqui
    ficamos com o bloco que concentra mais pixels - o desenho de verdade.
    """
    melhor = (0, len(counts))
    melhor_peso = -1
    inicio = None

    for i, valor in enumerate([*counts, 0]):
        if valor > 0 and inicio is None:
            inicio = i
        elif valor == 0 and inicio is not None:
            peso = sum(counts[inicio:i])
            if peso > melhor_peso:
                melhor_peso = peso
                melhor = (inicio, i)
            inicio = None

    return melhor


def trim(image: Image.Image) -> Image.Image:
    """Recorta no bloco principal do desenho, ignorando artefatos soltos."""
    alpha = image.getchannel("A")
    w, h = image.size
    pixels = alpha.load()

    colunas = [sum(1 for y in range(h) if pixels[x, y] > 0) for x in range(w)]
    linhas = [sum(1 for x in range(w) if pixels[x, y] > 0) for y in range(h)]

    if not any(colunas):
        return image

    x0, x1 = _main_run(colunas)
    y0, y1 = _main_run(linhas)
    return image.crop((x0, y0, x1, y1))


def prepare(source: Path, target: Path, max_width: int) -> tuple[int, int]:
    image = trim(strip_background(Image.open(source)))

    if image.width > max_width:
        altura = round(image.height * max_width / image.width)
        image = image.resize((max_width, altura), Image.LANCZOS)

    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, optimize=True)
    return image.size


#: (origem, destino, largura maxima)
ARTWORK = [
    ("angel_loading.png", "angel.png", 560),
    ("intro_screen.png", "intro-art.png", 720),
]


def main() -> None:
    parser = argparse.ArgumentParser(prog="ui-art")
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--target", type=Path, default=TARGET)
    args = parser.parse_args()

    if not args.source.is_dir():
        print(f"nada a fazer: {args.source} nao existe")
        return

    for origem, destino, largura in ARTWORK:
        caminho = args.source / origem
        if not caminho.is_file():
            print(f"  ignorado -> {origem} nao encontrado")
            continue
        antes = caminho.stat().st_size
        tamanho = prepare(caminho, args.target / destino, largura)
        depois = (args.target / destino).stat().st_size
        print(
            f"  {origem} -> ui/{destino}  {tamanho[0]}x{tamanho[1]}  "
            f"{antes / 1024:.0f} KB -> {depois / 1024:.0f} KB"
        )

    print(f"saida: {args.target.resolve()}")


if __name__ == "__main__":
    main()
