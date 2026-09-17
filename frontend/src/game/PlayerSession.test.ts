import { describe, expect, it } from 'vitest'

import { PlayerSession } from './PlayerSession'
import type { Chart, ChartNote } from './types'

function note(time: number, lane: number, gate: number, duration = 0): ChartNote {
  return { time, lane, duration, type: 'normal', gate }
}

function chartWith(notes: ChartNote[]): Chart {
  return {
    songId: 'test',
    instrument: 'guitar',
    difficulty: 'expert',
    resolution: 480,
    length: 10,
    noteCount: notes.length,
    notes,
    starPower: [],
    solos: [],
    sections: [],
    bpm: [{ time: 0, bpm: 120 }],
  }
}

function session(notes: ChartNote[], requireStrum: boolean) {
  return new PlayerSession({
    id: 0,
    name: 'Player 1',
    chart: chartWith(notes),
    instrument: 'guitar',
    difficulty: 'expert',
    requireStrum,
  })
}

describe('PlayerSession sem palhetada (padrao)', () => {
  it('apertar o traste certo ja acerta a nota', () => {
    const player = session([note(1, 0, 0)], false)
    player.handleAction('fret0', true, 1.0)
    expect(player.score.notesHit).toBe(1)
    expect(player.score.combo).toBe(1)
  })

  it('apertar traste errado nao quebra o combo', () => {
    const player = session([note(1, 0, 0), note(2, 0, 1)], false)
    player.handleAction('fret0', true, 1.0)
    player.handleAction('fret0', false, 1.1)
    player.handleAction('fret4', true, 1.5)
    expect(player.score.combo).toBe(1)
    expect(player.score.overstrums).toBe(0)
  })

  it('acorde funciona apertando um traste de cada vez', () => {
    const player = session([note(1, 0, 0), note(1, 1, 0)], false)
    player.handleAction('fret0', true, 0.99)
    player.handleAction('fret1', true, 1.0)
    expect(player.score.notesHit).toBe(2)
    expect(player.score.combo).toBe(1)
  })

  it('palhetar continua funcionando e nao pune', () => {
    const player = session([note(1, 0, 0)], false)
    player.handleAction('strum', true, 0.5) // no vazio
    expect(player.score.overstrums).toBe(0)
    player.handleAction('fret0', true, 0.98)
    expect(player.score.notesHit).toBe(1)
  })

  it('sustain continua valendo enquanto o traste estiver segurado', () => {
    const player = session([note(1, 0, 0, 2)], false)
    player.handleAction('fret0', true, 1.0)
    const antes = player.score.score
    player.update(1.5, 0.5)
    expect(player.score.score).toBeGreaterThan(antes)
  })
})

describe('PlayerSession com palhetada', () => {
  it('traste sozinho nao acerta', () => {
    const player = session([note(1, 0, 0)], true)
    player.handleAction('fret0', true, 1.0)
    expect(player.score.notesHit).toBe(0)
  })

  it('traste mais palhetada acerta', () => {
    const player = session([note(1, 0, 0)], true)
    player.handleAction('fret0', true, 0.98)
    player.handleAction('strum', true, 1.0)
    expect(player.score.notesHit).toBe(1)
  })

  it('palhetar no vazio quebra o combo', () => {
    const player = session([note(1, 0, 0), note(5, 0, 1)], true)
    player.handleAction('fret0', true, 0.98)
    player.handleAction('strum', true, 1.0)
    expect(player.score.combo).toBe(1)
    player.handleAction('strum', true, 2.0)
    expect(player.score.combo).toBe(0)
    expect(player.score.overstrums).toBe(1)
  })
})

describe('troca de modo em tempo real', () => {
  it('passa a exigir palhetada sem recriar a sessao', () => {
    const player = session([note(1, 0, 0), note(3, 1, 1)], false)
    player.handleAction('fret0', true, 1.0)
    expect(player.score.notesHit).toBe(1)

    player.requireStrum = true
    player.handleAction('fret1', true, 3.0)
    expect(player.score.notesHit).toBe(1)
    player.handleAction('strum', true, 3.0)
    expect(player.score.notesHit).toBe(2)
  })
})
