import { LANE_COUNT } from './config'

/**
 * Onde o dedo toca -> qual traste.
 *
 * Decisao central: as zonas de toque dividem a LARGURA INTEIRA da tela, e nao
 * apenas a faixa desenhada. A highway tem perspectiva e ocupa perto de 70% da
 * largura; usar so ela deixaria alvos estreitos, e num celular alvo estreito e
 * o mesmo que nota perdida. Cada zona fica sob o traste correspondente e as
 * duas das pontas absorvem a sobra ate a borda.
 *
 * O topo fica reservado: e onde ficam pausa e star power, e no multiplayer as
 * faixas dos outros jogadores.
 */

/** Fracao do topo da tela que NAO joga. */
export const RESERVED_TOP = 0.16

/**
 * Traste sob o ponto, ou null se o toque foi fora da area de jogo.
 *
 * @param x posicao do toque, relativa ao elemento
 * @param y idem
 */
export function laneAtPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  leftyFlip = false,
  laneCount: number = LANE_COUNT,
): number | null {
  if (width <= 0 || height <= 0 || laneCount <= 0) return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (y < height * RESERVED_TOP || y > height) return null
  if (x < 0 || x > width) return null

  const coluna = Math.floor((x / width) * laneCount)
  const indice = Math.min(laneCount - 1, Math.max(0, coluna))

  // Lefty flip inverte a ordem visual das lanes; o toque tem de acompanhar,
  // senao a zona da esquerda acionaria o traste da direita.
  return leftyFlip ? laneCount - 1 - indice : indice
}

/** Limites de uma zona de toque, em fracao da largura. Usado pela interface. */
export function laneZone(
  lane: number,
  laneCount: number = LANE_COUNT,
): { left: number; width: number } {
  const largura = 1 / laneCount
  return { left: lane * largura, width: largura }
}

/**
 * O jogo deve oferecer controles de toque neste aparelho?
 *
 * Checa capacidade, e nao tamanho de tela: um notebook com tela sensivel ao
 * toque tambem se beneficia, e um celular em modo desktop continua sendo um
 * celular. `matchMedia` pode nao existir em ambiente de teste.
 */
export function hasTouch(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(pointer: coarse)').matches) return true
    } catch {
      // matchMedia falso em teste: cai para as checagens abaixo.
    }
  }
  return 'ontouchstart' in window || (navigator?.maxTouchPoints ?? 0) > 0
}
