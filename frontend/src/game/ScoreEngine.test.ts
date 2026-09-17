import { beforeEach, describe, expect, it } from 'vitest'

import { GAME_CONFIG } from './config'
import { ScoreEngine } from './ScoreEngine'

describe('ScoreEngine', () => {
  let score: ScoreEngine

  beforeEach(() => {
    score = new ScoreEngine(0, 'Player 1', 100)
  })

  it('comeca zerado com multiplicador 1', () => {
    expect(score.score).toBe(0)
    expect(score.multiplier).toBe(1)
    expect(score.accuracy).toBe(1)
  })

  it('sobe o multiplicador conforme o combo', () => {
    for (let i = 0; i < 9; i++) score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(1)
    score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(2)
    for (let i = 0; i < 10; i++) score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(3)
    for (let i = 0; i < 10; i++) score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(4)
  })

  it('nao passa do multiplicador maximo', () => {
    for (let i = 0; i < 200; i++) score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(GAME_CONFIG.score.maxMultiplier)
  })

  it('pontua conforme o julgamento', () => {
    score.registerHit('perfect', 1)
    const perfeito = score.score
    score.combo = 0
    score.registerHit('good', 1)
    const bom = score.score - perfeito
    expect(bom).toBeLessThan(perfeito)
  })

  it('acorde pontua por nota mas conta um combo', () => {
    score.registerHit('perfect', 3)
    expect(score.combo).toBe(1)
    expect(score.notesHit).toBe(3)
    expect(score.score).toBe(GAME_CONFIG.score.notePoints * 3)
  })

  it('miss zera o combo', () => {
    for (let i = 0; i < 15; i++) score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(2)
    score.registerMiss(1)
    expect(score.combo).toBe(0)
    expect(score.multiplier).toBe(1)
    expect(score.notesMissed).toBe(1)
  })

  it('overstrum zera o combo sem contar nota errada', () => {
    for (let i = 0; i < 12; i++) score.registerHit('perfect', 1)
    score.registerOverstrum()
    expect(score.combo).toBe(0)
    expect(score.notesMissed).toBe(0)
    expect(score.overstrums).toBe(1)
  })

  it('guarda o combo maximo', () => {
    for (let i = 0; i < 7; i++) score.registerHit('perfect', 1)
    score.registerMiss(1)
    score.registerHit('perfect', 1)
    expect(score.maxCombo).toBe(7)
  })

  it('calcula accuracy', () => {
    for (let i = 0; i < 9; i++) score.registerHit('perfect', 1)
    score.registerMiss(1)
    expect(score.accuracy).toBeCloseTo(0.9)
  })

  it('star power so ativa a partir do limite', () => {
    expect(score.activateStarPower()).toBe(false)
    score.addStarPowerPhrase()
    expect(score.canActivateStarPower()).toBe(false)
    score.addStarPowerPhrase()
    expect(score.canActivateStarPower()).toBe(true)
    expect(score.activateStarPower()).toBe(true)
  })

  it('star power dobra o multiplicador e drena com o tempo', () => {
    score.addStarPowerPhrase()
    score.addStarPowerPhrase()
    score.activateStarPower()
    expect(score.multiplier).toBe(2)

    score.update(GAME_CONFIG.starPower.drainSeconds)
    expect(score.starPowerActive).toBe(false)
    expect(score.starPowerEnergy).toBe(0)
    expect(score.multiplier).toBe(1)
  })

  it('energia nunca passa de 1', () => {
    for (let i = 0; i < 20; i++) score.addStarPowerPhrase()
    expect(score.starPowerEnergy).toBe(1)
  })

  it('sustain soma pontos proporcionais ao multiplicador', () => {
    score.addSustain(1)
    expect(score.score).toBe(GAME_CONFIG.score.sustainPointsPerSecond)
  })

  it('estrelas acompanham a accuracy', () => {
    expect(score.stars).toBe(0)
    for (let i = 0; i < 100; i++) score.registerHit('perfect', 1)
    expect(score.stars).toBe(5)
  })

  it('snapshot expoe os campos do HUD', () => {
    score.registerHit('great', 2)
    const snap = score.snapshot()
    expect(snap).toMatchObject({ id: 0, name: 'Player 1', notesHit: 2, great: 2, combo: 1 })
  })
})
