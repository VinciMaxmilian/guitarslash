import { describe, expect, it } from 'vitest'

import { fretArrival } from './fretArrival'
import { LANE_COUNT } from './config'

const lanes = [0, 1, 2, 3, 4]

describe('fretArrival', () => {
  it('no comeco do reveal nenhum traste chegou', () => {
    for (const lane of lanes) {
      const a = fretArrival(0, lane, LANE_COUNT)
      expect(a.progress).toBe(0)
      expect(a.alpha).toBe(0)
    }
  })

  it('ao fim do reveal TODO traste esta exatamente assentado', () => {
    // E o invariante que importa: resto de animacao aqui deixaria traste fora
    // de lugar durante a musica.
    for (const lane of lanes) {
      expect(fretArrival(1, lane, LANE_COUNT)).toEqual({
        progress: 1,
        offsetY: 0,
        scale: 1,
        alpha: 1,
      })
    }
  })

  it('depois do reveal continua assentado', () => {
    expect(fretArrival(1.5, 2, LANE_COUNT).offsetY).toBe(0)
  })

  it('entram em sequencia, da esquerda para a direita', () => {
    // Comparar `progress` instantaneo nao mede ordem: com o repique ele passa
    // de 1 e volta, entao uma lane atrasada pode estar no pico. O que mede a
    // sequencia e QUANDO cada traste comeca a se mover.
    const inicios = lanes.map((lane) => {
      for (let r = 0; r <= 1; r += 0.002) {
        if (fretArrival(r, lane, LANE_COUNT).progress > 0) return r
      }
      return Infinity
    })

    for (let i = 1; i < inicios.length; i += 1) {
      expect(inicios[i]).toBeGreaterThan(inicios[i - 1])
    }
  })

  it('assentam na mesma ordem em que entraram', () => {
    const assentou = lanes.map((lane) => {
      for (let r = 0; r <= 1; r += 0.002) {
        if (Math.abs(fretArrival(r, lane, LANE_COUNT).offsetY) < 0.002) return r
      }
      return Infinity
    })

    for (let i = 1; i < assentou.length; i += 1) {
      expect(assentou[i]).toBeGreaterThan(assentou[i - 1])
    }
    expect(assentou[LANE_COUNT - 1]).toBeLessThanOrEqual(1)
  })

  it('a primeira lane comeca antes de a ultima ter saido do lugar', () => {
    const a = fretArrival(0.12, 0, LANE_COUNT)
    const b = fretArrival(0.12, 4, LANE_COUNT)
    expect(a.progress).toBeGreaterThan(0)
    expect(b.progress).toBe(0)
  })

  it('sobe do fundo: offsetY comeca positivo', () => {
    expect(fretArrival(0.05, 0, LANE_COUNT).offsetY).toBeGreaterThan(0)
  })

  it('passa do lugar antes de assentar (o pulo)', () => {
    // Em algum instante o traste esta ACIMA do lugar final.
    const amostras = []
    for (let r = 0; r <= 1; r += 0.005) {
      amostras.push(fretArrival(r, 0, LANE_COUNT).offsetY)
    }
    expect(Math.min(...amostras)).toBeLessThan(0)
  })

  it('o repique e contido, nao um salto absurdo', () => {
    const amostras = []
    for (let r = 0; r <= 1; r += 0.005) {
      amostras.push(fretArrival(r, 0, LANE_COUNT).offsetY)
    }
    expect(Math.min(...amostras)).toBeGreaterThan(-0.35)
  })

  it('cresce de pequeno para o tamanho normal', () => {
    expect(fretArrival(0.02, 0, LANE_COUNT).scale).toBeLessThan(0.5)
    expect(fretArrival(1, 0, LANE_COUNT).scale).toBe(1)
  })

  it('a escala nunca explode, mesmo no overshoot', () => {
    for (let r = 0; r <= 1; r += 0.005) {
      for (const lane of lanes) {
        expect(fretArrival(r, lane, LANE_COUNT).scale).toBeLessThanOrEqual(1.08)
      }
    }
  })

  it('o alpha sobe mais rapido que o pulo', () => {
    // O traste tem que estar visivel enquanto pula, e nao chegar apagado.
    const a = fretArrival(0.1, 0, LANE_COUNT)
    expect(a.alpha).toBeGreaterThan(0.5)
    expect(a.progress).toBeLessThan(1)
  })

  it('todo traste termina a sequencia dentro do reveal', () => {
    // Antes de reveal=1 o ultimo traste ja tem que ter assentado, senao ele
    // saltaria para o lugar de uma vez no corte.
    const ultimo = fretArrival(0.995, LANE_COUNT - 1, LANE_COUNT)
    expect(ultimo.progress).toBeCloseTo(1, 2)
  })

  it('funciona com outra quantidade de lanes', () => {
    for (const count of [1, 3, 8]) {
      for (let lane = 0; lane < count; lane += 1) {
        expect(fretArrival(1, lane, count).offsetY).toBe(0)
        expect(fretArrival(0.99, count - 1, count).progress).toBeGreaterThan(0.9)
      }
    }
  })

  it('lane unica nao quebra a divisao', () => {
    const a = fretArrival(0.5, 0, 1)
    expect(Number.isFinite(a.progress)).toBe(true)
    expect(a.progress).toBeGreaterThan(0)
  })
})
