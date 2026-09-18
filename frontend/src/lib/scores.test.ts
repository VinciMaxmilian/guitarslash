import { describe, expect, it } from 'vitest'

import { scoreRow } from './scores'
import type { PlayerSnapshot } from '../game/types'

function snapshot(over: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 0, name: 'Ana', score: 1000, combo: 5, maxCombo: 40, multiplier: 2,
    accuracy: 0.9, notesHit: 90, notesMissed: 10, perfect: 50, great: 30,
    good: 10, starPowerEnergy: 0.3, starPowerActive: false, stars: 4,
    rockMeter: 0.7, comboToNextMultiplier: 0.5,
    ...over,
  }
}

const alvo = { songId: 'm1', instrument: 'guitar', difficulty: 'expert' }

describe('scoreRow', () => {
  it('monta a linha com o dono e o alvo', () => {
    const row = scoreRow('user-1', alvo, snapshot())
    expect(row).toMatchObject({
      user_id: 'user-1', song_id: 'm1', instrument: 'guitar', difficulty: 'expert',
      score: 1000, accuracy: 0.9, max_combo: 40, notes_hit: 90, notes_missed: 10, stars: 4,
    })
  })

  it('prende accuracy em 0..1, que e o check da coluna', () => {
    // Estourar aqui viraria erro do banco e placar perdido.
    expect(scoreRow('u', alvo, snapshot({ accuracy: 1.5 })).accuracy).toBe(1)
    expect(scoreRow('u', alvo, snapshot({ accuracy: -0.2 })).accuracy).toBe(0)
  })

  it('prende estrelas em 0..5', () => {
    expect(scoreRow('u', alvo, snapshot({ stars: 9 })).stars).toBe(5)
    expect(scoreRow('u', alvo, snapshot({ stars: -1 })).stars).toBe(0)
  })

  it('nao envia numero negativo nas colunas com check >= 0', () => {
    const row = scoreRow('u', alvo, snapshot({ score: -50, maxCombo: -1, notesHit: -3 }))
    expect(row.score).toBe(0)
    expect(row.max_combo).toBe(0)
    expect(row.notes_hit).toBe(0)
  })

  it('arredonda: as colunas sao inteiras', () => {
    const row = scoreRow('u', alvo, snapshot({ score: 1000.7, maxCombo: 40.2 }))
    expect(Number.isInteger(row.score)).toBe(true)
    expect(Number.isInteger(row.max_combo)).toBe(true)
  })

  it('nao vaza campo que nao existe na tabela', () => {
    const row = scoreRow('u', alvo, snapshot())
    expect(row).not.toHaveProperty('rockMeter')
    expect(row).not.toHaveProperty('starPowerEnergy')
    expect(row).not.toHaveProperty('name')
    expect(row).not.toHaveProperty('comboToNextMultiplier')
  })
})
