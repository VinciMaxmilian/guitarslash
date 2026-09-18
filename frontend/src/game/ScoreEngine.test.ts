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

describe('ScoreEngine — medidor de desempenho', () => {
  it('comeca no meio', () => {
    expect(new ScoreEngine(0, 'Ana', 100).rockMeter).toBeCloseTo(0.5, 5)
  })

  it('sobe ao acertar', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    engine.registerHit('perfect', 1)
    expect(engine.rockMeter).toBeGreaterThan(0.5)
  })

  it('cai ao errar', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    engine.registerMiss(1)
    expect(engine.rockMeter).toBeLessThan(0.5)
  })

  it('errar pesa mais que acertar', () => {
    const acerta = new ScoreEngine(0, 'Ana', 100)
    acerta.registerHit('perfect', 1)
    const erra = new ScoreEngine(0, 'Ana', 100)
    erra.registerMiss(1)
    expect(0.5 - erra.rockMeter).toBeGreaterThan(acerta.rockMeter - 0.5)
  })

  it('acorde move o medidor proporcionalmente as notas', () => {
    const uma = new ScoreEngine(0, 'Ana', 100)
    uma.registerHit('perfect', 1)
    const tres = new ScoreEngine(0, 'Ana', 100)
    tres.registerHit('perfect', 3)
    expect(tres.rockMeter).toBeGreaterThan(uma.rockMeter)
  })

  it('palhetada no vazio derruba o medidor', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    engine.registerOverstrum()
    expect(engine.rockMeter).toBeLessThan(0.5)
  })

  it('nao passa de 1 nem por muito acerto', () => {
    const engine = new ScoreEngine(0, 'Ana', 500)
    for (let i = 0; i < 400; i += 1) engine.registerHit('perfect', 1)
    expect(engine.rockMeter).toBe(1)
  })

  it('nao fica negativo nem por muito erro', () => {
    const engine = new ScoreEngine(0, 'Ana', 500)
    for (let i = 0; i < 400; i += 1) engine.registerMiss(1)
    expect(engine.rockMeter).toBe(0)
  })

  it('classifica a zona para a interface escolher a cor', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    expect(engine.rockZone).toBe('good')
    engine.rockMeter = 0.4
    expect(engine.rockZone).toBe('warning')
    engine.rockMeter = 0.1
    expect(engine.rockZone).toBe('danger')
  })

  it('vai para o snapshot', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    engine.registerMiss(1)
    expect(engine.snapshot().rockMeter).toBe(engine.rockMeter)
  })
})

describe('ScoreEngine — progresso do multiplicador', () => {
  it('sem combo, o anel esta vazio', () => {
    expect(new ScoreEngine(0, 'Ana', 100).comboToNextMultiplier).toBeCloseTo(0, 5)
  })

  it('preenche ate o primeiro degrau', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    for (let i = 0; i < 5; i += 1) engine.registerHit('perfect', 1)
    // Primeiro degrau e 10; 5 de combo = metade.
    expect(engine.comboToNextMultiplier).toBeCloseTo(0.5, 5)
  })

  it('reinicia o anel em cada degrau', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    for (let i = 0; i < 10; i += 1) engine.registerHit('perfect', 1)
    expect(engine.multiplier).toBe(2)
    expect(engine.comboToNextMultiplier).toBeCloseTo(0, 5)
    for (let i = 0; i < 5; i += 1) engine.registerHit('perfect', 1)
    expect(engine.comboToNextMultiplier).toBeCloseTo(0.5, 5)
  })

  it('no multiplicador maximo o anel fica cheio', () => {
    const engine = new ScoreEngine(0, 'Ana', 200)
    for (let i = 0; i < 60; i += 1) engine.registerHit('perfect', 1)
    expect(engine.comboToNextMultiplier).toBe(1)
  })

  it('errar esvazia o anel junto com o combo', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    for (let i = 0; i < 8; i += 1) engine.registerHit('perfect', 1)
    engine.registerMiss(1)
    expect(engine.comboToNextMultiplier).toBeCloseTo(0, 5)
  })
})

describe('ScoreEngine — reset (loop do treino)', () => {
  it('volta tudo ao inicial', () => {
    const engine = new ScoreEngine(0, 'Ana', 100)
    for (let i = 0; i < 15; i += 1) engine.registerHit('perfect', 1)
    engine.registerMiss(2)
    engine.addStarPowerPhrase()
    engine.reset()

    expect(engine.score).toBe(0)
    expect(engine.combo).toBe(0)
    expect(engine.maxCombo).toBe(0)
    expect(engine.notesHit).toBe(0)
    expect(engine.notesMissed).toBe(0)
    expect(engine.multiplier).toBe(1)
    expect(engine.starPowerEnergy).toBe(0)
    expect(engine.starPowerActive).toBe(false)
    expect(engine.rockMeter).toBeCloseTo(0.5, 5)
  })

  it('preserva a identidade do jogador', () => {
    const engine = new ScoreEngine(7, 'Beto', 100)
    engine.reset()
    expect(engine.playerId).toBe(7)
    expect(engine.playerName).toBe('Beto')
    expect(engine.totalNotes).toBe(100)
  })
})
