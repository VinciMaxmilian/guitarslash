import { describe, expect, it } from 'vitest'

import { MiniHighwayState, MINI_LOOK_AHEAD } from './MiniHighway'
import type { Chart, ChartNote } from './types'

function note(time: number, lane: number): ChartNote {
  return { time, lane, duration: 0, type: 'normal', gate: time }
}

function chart(notes: ChartNote[]): Chart {
  return {
    songId: 'x',
    instrument: 'guitar',
    difficulty: 'expert',
    resolution: 480,
    length: 100,
    noteCount: notes.length,
    notes,
    starPower: [],
    solos: [],
    sections: [],
    bpm: [],
  }
}

describe('MiniHighwayState', () => {
  it('mostra so as notas dentro da janela visivel', () => {
    const estado = new MiniHighwayState(chart([note(1, 0), note(2, 1), note(9, 2)]))
    const visiveis = estado.visibleNotes(1.0)
    expect(visiveis.map((n) => n.time)).toEqual([1, 2])
  })

  it('progress vai de 0 na hit line a 1 no fundo', () => {
    const estado = new MiniHighwayState(chart([note(5, 0)]))
    expect(estado.visibleNotes(5)[0].progress).toBeCloseTo(0, 5)
    expect(estado.visibleNotes(5 - MINI_LOOK_AHEAD)[0].progress).toBeCloseTo(1, 5)
  })

  it('nota ainda nao tocada nao tem julgamento', () => {
    const estado = new MiniHighwayState(chart([note(2, 3)]))
    expect(estado.visibleNotes(1)[0].judgement).toBeNull()
  })

  it('aplica o acerto vindo da rede na nota certa', () => {
    const estado = new MiniHighwayState(chart([note(2, 3), note(2.5, 1)]))
    estado.applyHits([[2000, 3, 3]])
    expect(estado.judgementAt(2, 3)).toBe('perfect')
    expect(estado.judgementAt(2.5, 1)).toBeNull()
  })

  it('casa o acerto mesmo com pequena diferenca de tempo', () => {
    const estado = new MiniHighwayState(chart([note(2, 0)]))
    // O jogador acertou 40 ms depois do tempo nominal da nota.
    estado.applyHits([[2040, 0, 2]])
    expect(estado.judgementAt(2, 0)).toBe('great')
  })

  it('nao casa acerto de outra lane', () => {
    const estado = new MiniHighwayState(chart([note(2, 0)]))
    estado.applyHits([[2000, 4, 3]])
    expect(estado.judgementAt(2, 0)).toBeNull()
  })

  it('nao casa acerto distante demais no tempo', () => {
    const estado = new MiniHighwayState(chart([note(2, 0)]))
    estado.applyHits([[2500, 0, 3]])
    expect(estado.judgementAt(2, 0)).toBeNull()
  })

  it('traduz o codigo do julgamento', () => {
    const estado = new MiniHighwayState(chart([note(1, 0), note(2, 0), note(3, 0), note(4, 0)]))
    estado.applyHits([[1000, 0, 0], [2000, 0, 1], [3000, 0, 2], [4000, 0, 3]])
    expect(estado.judgementAt(1, 0)).toBe('miss')
    expect(estado.judgementAt(2, 0)).toBe('good')
    expect(estado.judgementAt(3, 0)).toBe('great')
    expect(estado.judgementAt(4, 0)).toBe('perfect')
  })

  it('codigo desconhecido vira miss em vez de quebrar', () => {
    const estado = new MiniHighwayState(chart([note(1, 0)]))
    estado.applyHits([[1000, 0, 99]])
    expect(estado.judgementAt(1, 0)).toBe('miss')
  })

  it('applyHits sem eventos e inofensivo', () => {
    const estado = new MiniHighwayState(chart([note(1, 0)]))
    estado.applyHits(undefined)
    estado.applyHits([])
    expect(estado.judgementAt(1, 0)).toBeNull()
  })

  it('a nota resolvida continua visivel por um instante, para o flash', () => {
    const estado = new MiniHighwayState(chart([note(2, 0)]))
    estado.applyHits([[2000, 0, 3]])
    const logoDepois = estado.visibleNotes(2.1)
    expect(logoDepois).toHaveLength(1)
    expect(logoDepois[0].judgement).toBe('perfect')
  })

  it('o flash apaga com o tempo e some de vez', () => {
    const estado = new MiniHighwayState(chart([note(2, 0)]))
    estado.applyHits([[2000, 0, 3]])
    const nota = estado.visibleNotes(2.0)[0]
    expect(estado.flashFor(nota, 2.0)).toBeCloseTo(1, 2)
    expect(estado.flashFor(nota, 2.14)).toBeGreaterThan(0)
    expect(estado.flashFor(nota, 2.14)).toBeLessThan(1)
    expect(estado.flashFor(nota, 3.0)).toBe(0)
  })

  it('nota sem julgamento nao brilha', () => {
    const estado = new MiniHighwayState(chart([note(2, 0)]))
    expect(estado.flashFor(estado.visibleNotes(1.5)[0], 1.5)).toBe(0)
  })

  it('notas fora de ordem no chart ainda funcionam', () => {
    const estado = new MiniHighwayState(chart([note(3, 0), note(1, 1), note(2, 2)]))
    expect(estado.visibleNotes(1).map((n) => n.time)).toEqual([1, 2])
  })

  it('trocar de chart limpa os acertos da musica anterior', () => {
    const estado = new MiniHighwayState(chart([note(1, 0)]))
    estado.applyHits([[1000, 0, 3]])
    estado.setChart(chart([note(1, 0)]))
    expect(estado.judgementAt(1, 0)).toBeNull()
  })

  it('chart vazio nao quebra nada', () => {
    const estado = new MiniHighwayState()
    expect(estado.noteCount).toBe(0)
    expect(estado.visibleNotes(10)).toEqual([])
  })
})
