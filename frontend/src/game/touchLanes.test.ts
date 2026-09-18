import { describe, expect, it } from 'vitest'

import { RESERVED_TOP, laneAtPoint, laneZone } from './touchLanes'
import { LANE_COUNT } from './config'

const W = 1000
const H = 600
/** Um y qualquer dentro da area de jogo. */
const Y = H * 0.8

describe('laneAtPoint', () => {
  it('divide a largura inteira entre as lanes', () => {
    expect(laneAtPoint(100, Y, W, H)).toBe(0)
    expect(laneAtPoint(300, Y, W, H)).toBe(1)
    expect(laneAtPoint(500, Y, W, H)).toBe(2)
    expect(laneAtPoint(700, Y, W, H)).toBe(3)
    expect(laneAtPoint(900, Y, W, H)).toBe(4)
  })

  it('a borda esquerda ainda aciona a primeira lane', () => {
    // Num celular, alvo que nao chega na borda e nota perdida.
    expect(laneAtPoint(0, Y, W, H)).toBe(0)
    expect(laneAtPoint(1, Y, W, H)).toBe(0)
  })

  it('a borda direita ainda aciona a ultima lane', () => {
    expect(laneAtPoint(W, Y, W, H)).toBe(LANE_COUNT - 1)
    expect(laneAtPoint(W - 1, Y, W, H)).toBe(LANE_COUNT - 1)
  })

  it('as zonas sao contiguas: nao existe ponto morto', () => {
    const vistas = new Set<number>()
    for (let x = 0; x <= W; x += 1) {
      const lane = laneAtPoint(x, Y, W, H)
      expect(lane).not.toBeNull()
      vistas.add(lane as number)
    }
    expect(vistas.size).toBe(LANE_COUNT)
  })

  it('cada zona tem a mesma largura', () => {
    const contagem = new Map<number, number>()
    for (let x = 0; x < W; x += 1) {
      const lane = laneAtPoint(x, Y, W, H) as number
      contagem.set(lane, (contagem.get(lane) ?? 0) + 1)
    }
    const tamanhos = [...contagem.values()]
    expect(Math.max(...tamanhos) - Math.min(...tamanhos)).toBeLessThanOrEqual(1)
  })

  it('ignora toque na area reservada do topo', () => {
    // E onde ficam pausa, star power e as faixas dos oponentes.
    expect(laneAtPoint(500, 0, W, H)).toBeNull()
    expect(laneAtPoint(500, H * RESERVED_TOP - 1, W, H)).toBeNull()
    expect(laneAtPoint(500, H * RESERVED_TOP + 1, W, H)).toBe(2)
  })

  it('ignora toque fora do elemento', () => {
    expect(laneAtPoint(-5, Y, W, H)).toBeNull()
    expect(laneAtPoint(W + 5, Y, W, H)).toBeNull()
    expect(laneAtPoint(500, H + 5, W, H)).toBeNull()
  })

  it('lefty flip inverte a zona', () => {
    // Sem isto, a zona da esquerda acionaria o traste da direita.
    expect(laneAtPoint(100, Y, W, H, true)).toBe(LANE_COUNT - 1)
    expect(laneAtPoint(900, Y, W, H, true)).toBe(0)
    expect(laneAtPoint(500, Y, W, H, true)).toBe(2)
  })

  it('lefty flip tambem cobre todas as lanes', () => {
    const vistas = new Set<number>()
    for (let x = 0; x <= W; x += 1) vistas.add(laneAtPoint(x, Y, W, H, true) as number)
    expect(vistas.size).toBe(LANE_COUNT)
  })

  it('funciona em tela estreita, de celular em retrato', () => {
    const vistas = new Set<number>()
    for (let x = 0; x <= 360; x += 1) vistas.add(laneAtPoint(x, 700 * 0.8, 360, 700) as number)
    expect(vistas.size).toBe(LANE_COUNT)
  })

  it('nao quebra com dimensao invalida', () => {
    expect(laneAtPoint(10, 10, 0, 0)).toBeNull()
    expect(laneAtPoint(10, 10, -5, 100)).toBeNull()
    expect(laneAtPoint(Number.NaN, Y, W, H)).toBeNull()
    expect(laneAtPoint(10, Number.NaN, W, H)).toBeNull()
  })

  it('respeita outra quantidade de lanes', () => {
    expect(laneAtPoint(100, Y, W, H, false, 4)).toBe(0)
    expect(laneAtPoint(900, Y, W, H, false, 4)).toBe(3)
  })
})

describe('laneZone', () => {
  it('as zonas cobrem a largura sem sobrepor', () => {
    let anterior = 0
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const z = laneZone(lane)
      expect(z.left).toBeCloseTo(anterior, 6)
      anterior = z.left + z.width
    }
    expect(anterior).toBeCloseTo(1, 6)
  })

  it('bate com o que laneAtPoint decide', () => {
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const z = laneZone(lane)
      const centro = (z.left + z.width / 2) * W
      expect(laneAtPoint(centro, Y, W, H)).toBe(lane)
    }
  })
})

describe('hasTouch', () => {
  it('nao quebra fora do navegador', async () => {
    // Nos testes nao existe `window`. A deteccao tem de devolver algo em vez
    // de estourar, senao a gameplay nem monta em ambiente sem DOM.
    const { hasTouch } = await import('./touchLanes')
    expect(typeof hasTouch()).toBe('boolean')
  })
})
