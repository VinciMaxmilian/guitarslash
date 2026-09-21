import { describe, expect, it } from 'vitest'

import { GAME_CONFIG } from '../game/config'
import { ScoreEngine } from '../game/ScoreEngine'
import { STAR_POWER_LEDS, STREAK_LEDS, ledFill } from './ScorePanel'

describe('ledFill', () => {
  it('comeca com todos apagados', () => {
    expect(ledFill(0, STREAK_LEDS)).toEqual([0, 0, 0, 0, 0])
  })

  it('acende meia luz por vez', () => {
    // 1/10 do degrau = meia luz no primeiro LED.
    expect(ledFill(0.1, STREAK_LEDS)).toEqual([1, 0, 0, 0, 0])
    expect(ledFill(0.2, STREAK_LEDS)).toEqual([2, 0, 0, 0, 0])
    expect(ledFill(0.3, STREAK_LEDS)).toEqual([2, 1, 0, 0, 0])
  })

  it('enche tudo no fim do degrau', () => {
    expect(ledFill(1, STREAK_LEDS)).toEqual([2, 2, 2, 2, 2])
  })

  it('nao estoura fora de 0..1', () => {
    expect(ledFill(-3, STREAK_LEDS)).toEqual([0, 0, 0, 0, 0])
    expect(ledFill(9, STREAK_LEDS)).toEqual([2, 2, 2, 2, 2])
  })

  it('serve a qualquer quantidade de LEDs', () => {
    expect(ledFill(0.5, STAR_POWER_LEDS)).toEqual([2, 2, 2, 0, 0, 0])
  })
})

describe('LEDs contra o placar de verdade', () => {
  /**
   * O contrato que o jogador enxerga: UMA nota acertada = MEIA luz, e ao
   * encher os cinco LEDs o multiplicador sobe e eles zeram.
   *
   * O teste roda o ScoreEngine de verdade em vez de chutar o progresso: e a
   * unica forma de pegar uma mudanca em `multiplierSteps` que quebrasse a
   * conta de meia luz por nota.
   */
  const engine = () => new ScoreEngine(0, 'Teste', 100)

  it('cada nota acertada acende meia luz', () => {
    const score = engine()
    for (let nota = 1; nota <= 4; nota++) {
      score.registerHit('perfect', 1)
      const metades = ledFill(score.comboToNextMultiplier, STREAK_LEDS).reduce<number>(
        (soma, led) => soma + led,
        0,
      )
      expect(metades).toBe(nota)
    }
  })

  it('cinco LEDs cheios sobem o multiplicador e zeram a coluna', () => {
    const score = engine()
    const porDegrau = GAME_CONFIG.score.multiplierSteps[0]

    for (let i = 0; i < porDegrau - 1; i++) score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(1)

    score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(2)
    // Degrau novo: a coluna recomeca vazia.
    expect(ledFill(score.comboToNextMultiplier, STREAK_LEDS)).toEqual([0, 0, 0, 0, 0])
  })

  it('no teto o multiplicador para de subir e a coluna fica cheia', () => {
    const score = engine()
    for (let i = 0; i < 60; i++) score.registerHit('perfect', 1)
    expect(score.multiplier).toBe(GAME_CONFIG.score.maxMultiplier)
    expect(ledFill(score.comboToNextMultiplier, STREAK_LEDS)).toEqual([2, 2, 2, 2, 2])
  })

  it('errar zera a coluna junto com o combo', () => {
    const score = engine()
    for (let i = 0; i < 6; i++) score.registerHit('perfect', 1)
    score.registerMiss(1)
    expect(ledFill(score.comboToNextMultiplier, STREAK_LEDS)).toEqual([0, 0, 0, 0, 0])
  })

  it('cada frase de star power enche um LED e meio dos seis', () => {
    const score = engine()
    score.addStarPowerPhrase()
    expect(ledFill(score.starPowerEnergy, STAR_POWER_LEDS)).toEqual([2, 1, 0, 0, 0, 0])

    // Duas frases = metade da barra, que e o minimo para ativar.
    score.addStarPowerPhrase()
    expect(score.starPowerEnergy).toBe(GAME_CONFIG.starPower.activationThreshold)
    expect(ledFill(score.starPowerEnergy, STAR_POWER_LEDS)).toEqual([2, 2, 2, 0, 0, 0])
  })
})
