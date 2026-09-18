import { describe, expect, it } from 'vitest'

import { TRAINING_RATES, buildSections, fullSection } from './trainingSections'
import type { Chart, ChartNote } from './types'

function note(time: number): ChartNote {
  return { time, lane: 0, duration: 0, type: 'normal', gate: time }
}

function chart(over: Partial<Chart> = {}): Chart {
  return {
    songId: 'x', instrument: 'guitar', difficulty: 'expert', resolution: 480,
    length: 100, noteCount: 0, notes: [], starPower: [], solos: [],
    sections: [], bpm: [],
    ...over,
  }
}

/** Uma nota por segundo, para todo trecho ter conteudo. */
function notasDensas(ate: number): ChartNote[] {
  return Array.from({ length: ate }, (_, i) => note(i + 0.5))
}

describe('buildSections', () => {
  it('transforma marcadores em intervalos fechados', () => {
    const c = chart({
      length: 60,
      notes: notasDensas(60),
      sections: [
        { time: 0, name: 'Intro' },
        { time: 20, name: 'Verse' },
        { time: 40, name: 'Chorus' },
      ],
    })
    const s = buildSections(c)
    expect(s.map((x) => x.name)).toEqual(['Intro', 'Verse', 'Chorus'])
    expect(s[0]).toMatchObject({ from: 0, to: 20 })
    expect(s[1]).toMatchObject({ from: 20, to: 40 })
    // O ultimo marcador vai ate o fim da musica.
    expect(s[2]).toMatchObject({ from: 40, to: 60 })
  })

  it('cria um trecho para o que vem antes do primeiro marcador', () => {
    const c = chart({
      length: 60, notes: notasDensas(60),
      sections: [{ time: 30, name: 'Verse' }],
    })
    const s = buildSections(c)
    expect(s[0].name).toBe('Início')
    expect(s[0]).toMatchObject({ from: 0, to: 30 })
  })

  it('nao cria trecho inicial quando o marcador esta no comeco', () => {
    const c = chart({
      length: 60, notes: notasDensas(60),
      sections: [{ time: 1, name: 'Intro' }],
    })
    expect(buildSections(c).map((x) => x.name)).toEqual(['Intro'])
  })

  it('sem marcador, fatia a musica em pedacos', () => {
    // Senao "treinar" seria tocar a musica inteira - o oposto do treino.
    const c = chart({ length: 60, notes: notasDensas(60) })
    const s = buildSections(c)
    expect(s.length).toBeGreaterThan(1)
    expect(s[0].from).toBe(0)
    expect(s.at(-1)!.to).toBeLessThanOrEqual(60)
  })

  it('os trechos cobrem a musica sem buraco', () => {
    const c = chart({ length: 60, notes: notasDensas(60) })
    const s = buildSections(c)
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i].from).toBeCloseTo(s[i - 1].to, 5)
    }
  })

  it('descarta trecho sem nota nenhuma', () => {
    // Intro instrumental ou silencio nao exercita nada.
    const c = chart({
      length: 60,
      notes: [note(45), note(50)],
      sections: [
        { time: 0, name: 'Silencio' },
        { time: 40, name: 'Riff' },
      ],
    })
    expect(buildSections(c).map((x) => x.name)).toEqual(['Riff'])
  })

  it('descarta trecho curto demais', () => {
    const c = chart({
      length: 30, notes: notasDensas(30),
      sections: [
        { time: 0, name: 'Ok' },
        { time: 10, name: 'Curto' },
        { time: 11, name: 'Resto' },
      ],
    })
    expect(buildSections(c).map((x) => x.name)).not.toContain('Curto')
  })

  it('conta as notas de cada trecho', () => {
    const c = chart({
      length: 40,
      notes: [note(1), note(2), note(3), note(25)],
      sections: [
        { time: 0, name: 'A' },
        { time: 20, name: 'B' },
      ],
    })
    const s = buildSections(c)
    expect(s.find((x) => x.name === 'A')?.noteCount).toBe(3)
    expect(s.find((x) => x.name === 'B')?.noteCount).toBe(1)
  })

  it('ordena marcadores fora de ordem', () => {
    const c = chart({
      length: 60, notes: notasDensas(60),
      sections: [
        { time: 40, name: 'C' },
        { time: 0, name: 'A' },
        { time: 20, name: 'B' },
      ],
    })
    expect(buildSections(c).map((x) => x.name)).toEqual(['A', 'B', 'C'])
  })

  it('chart vazio devolve lista vazia', () => {
    expect(buildSections(chart({ length: 0 }))).toEqual([])
  })

  it('chart sem nota devolve lista vazia', () => {
    expect(buildSections(chart({ length: 60 }))).toEqual([])
  })

  it('ignora marcador com tempo invalido', () => {
    const c = chart({
      length: 60, notes: notasDensas(60),
      sections: [
        { time: Number.NaN, name: 'Ruim' },
        { time: -5, name: 'Negativo' },
        { time: 0, name: 'Bom' },
      ],
    })
    expect(buildSections(c).map((x) => x.name)).toEqual(['Bom'])
  })
})

describe('fullSection', () => {
  it('cobre a musica inteira', () => {
    const c = chart({ length: 100, notes: notasDensas(50) })
    const s = fullSection(c)
    expect(s.from).toBe(0)
    expect(s.to).toBe(100)
    expect(s.noteCount).toBe(50)
  })

  it('usa a ultima nota quando ela passa do length declarado', () => {
    const c = chart({ length: 10, notes: [note(50)] })
    expect(fullSection(c).to).toBe(50)
  })
})

describe('TRAINING_RATES', () => {
  it('vai de metade a velocidade normal', () => {
    expect(Math.min(...TRAINING_RATES)).toBe(0.5)
    expect(Math.max(...TRAINING_RATES)).toBe(1)
  })

  it('esta em ordem crescente', () => {
    const ordenado = [...TRAINING_RATES].sort((a, b) => a - b)
    expect([...TRAINING_RATES]).toEqual(ordenado)
  })
})
