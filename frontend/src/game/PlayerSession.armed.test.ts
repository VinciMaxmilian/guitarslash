import { describe, expect, it } from 'vitest'

import { GAME_CONFIG } from './config'
import { PlayerSession } from './PlayerSession'
import type { Chart, ChartNote } from './types'

function note(time: number, lane: number, gate: number): ChartNote {
  return { time, lane, duration: 0, type: 'normal', gate }
}

function chartWith(notes: ChartNote[]): Chart {
  return {
    songId: 'teste',
    instrument: 'guitar',
    difficulty: 'expert',
    resolution: 480,
    length: 30,
    noteCount: notes.length,
    notes,
    starPower: [],
    solos: [],
    sections: [],
    bpm: [{ time: 0, bpm: 120 }],
  }
}

function sessao(notes: ChartNote[], requireStrum = false): PlayerSession {
  return new PlayerSession({
    id: 0,
    name: 'Teste',
    chart: chartWith(notes),
    instrument: 'guitar',
    difficulty: 'expert',
    requireStrum,
  })
}

/** Roda o relogio da partida a 60 fps, como a engine faz. */
function correr(s: PlayerSession, de: number, ate: number): void {
  for (let t = de; t <= ate; t += 1 / 60) s.update(t, 1 / 60)
}

const { good, pressGrace } = GAME_CONFIG.timing
/** Um aperto pouco antes da janela abrir: o caso que o buffer existe para cobrir. */
const POUCO_ANTES = 2 - good - pressGrace * 0.5
/** Um aperto alem do alcance total: tem de continuar sendo erro. */
const CEDO_DEMAIS = 2 - good - pressGrace * 2

describe('aperto que chega pouco antes da nota', () => {
  it('conta como acerto, e nao como erro', () => {
    const s = sessao([note(2, 0, 0)])
    s.handleAction('fret0', true, POUCO_ANTES)
    correr(s, POUCO_ANTES, 2.4)

    expect(s.score.notesHit).toBe(1)
    expect(s.score.notesMissed).toBe(0)
  })

  it('aperto cedo demais NAO conta', () => {
    // O teto do buffer e o que impede a area de acerto de crescer para tras
    // sem fim. Sem ele, um dedo apoiado no traste acertava qualquer nota
    // daquela lane, por mais tarde que viesse.
    const s = sessao([note(2, 0, 0)])
    s.handleAction('fret0', true, CEDO_DEMAIS)
    correr(s, CEDO_DEMAIS, 2.4)

    expect(s.score.notesHit).toBe(0)
    expect(s.score.notesMissed).toBe(1)
  })

  it('dedo apoiado meio segundo antes NAO acerta', () => {
    const s = sessao([note(2, 0, 0)])
    s.handleAction('fret0', true, 1.5)
    correr(s, 1.5, 2.4)

    expect(s.score.notesHit).toBe(0)
    expect(s.score.notesMissed).toBe(1)
  })

  it('segurar NAO acerta a nota seguinte sozinho', () => {
    // Duas notas na mesma lane. Sem esta trava, um unico aperto iria
    // colhendo notas enquanto o buffer durasse.
    const s = sessao([note(2, 0, 0), note(2.1, 0, 1)])
    s.handleAction('fret0', true, POUCO_ANTES)
    correr(s, POUCO_ANTES, 2.5)

    expect(s.score.notesHit).toBe(1)
    expect(s.score.notesMissed).toBe(1)
  })

  it('soltar e apertar de novo rearma para a nota seguinte', () => {
    const s = sessao([note(2, 0, 0), note(3, 0, 1)])
    s.handleAction('fret0', true, POUCO_ANTES)
    correr(s, POUCO_ANTES, 2.4)
    s.handleAction('fret0', false, 2.5)
    s.handleAction('fret0', true, 3 - good - pressGrace * 0.5)
    correr(s, 2.9, 3.4)

    expect(s.score.notesHit).toBe(2)
    expect(s.score.notesMissed).toBe(0)
  })

  it('traste errado nao acerta nada', () => {
    const s = sessao([note(2, 3, 0)])
    s.handleAction('fret0', true, POUCO_ANTES)
    correr(s, POUCO_ANTES, 2.4)

    expect(s.score.notesHit).toBe(0)
    expect(s.score.notesMissed).toBe(1)
  })

  it('acorde montado pouco antes da nota tambem conta', () => {
    const s = sessao([note(2, 0, 0), note(2, 1, 0)])
    s.handleAction('fret0', true, POUCO_ANTES - 0.01)
    s.handleAction('fret1', true, POUCO_ANTES)
    correr(s, POUCO_ANTES, 2.4)

    expect(s.score.notesHit).toBe(2)
    expect(s.score.notesMissed).toBe(0)
  })

  it('no modo COM palhetada o traste apoiado nao acerta sozinho', () => {
    // Quem liga a palhetada quer que a palhetada mande: um traste apoiado
    // acertando sozinho tiraria o sentido do modo.
    const s = sessao([note(2, 0, 0)], true)
    s.handleAction('fret0', true, POUCO_ANTES)
    correr(s, POUCO_ANTES, 2.4)

    expect(s.score.notesHit).toBe(0)
    expect(s.score.notesMissed).toBe(1)
  })

  it('seek do treino desarma o aperto pendente', () => {
    const s = sessao([note(2, 0, 0)])
    s.handleAction('fret0', true, POUCO_ANTES)
    s.seek(0)
    correr(s, POUCO_ANTES, 2.4)
    expect(s.score.notesHit).toBe(0)
  })
})
