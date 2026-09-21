import { describe, expect, it } from 'vitest'

import { calibrationFromSamples, identityCalibration, normalizeAxis } from './GamepadManager'

describe('normalizeAxis', () => {
  it('zera dentro da zona morta', () => {
    expect(normalizeAxis(0.2, 0, 1, 0.25)).toBe(0)
    expect(normalizeAxis(-0.2, 0, 1, 0.25)).toBe(0)
  })

  it('reescala fora da zona morta, sem pulo no primeiro passo', () => {
    // Logo depois do limite o valor sai de zero devagar, e nao de 0 para 0,25.
    expect(normalizeAxis(0.26, 0, 1, 0.25)).toBeCloseTo(0.0133, 3)
    expect(normalizeAxis(1, 0, 1, 0.25)).toBeCloseTo(1, 5)
  })

  it('desconta o centro do controle desalinhado', () => {
    // Stick que descansa em 0,3: parado tem que ler zero.
    expect(normalizeAxis(0.3, 0.3, 0.7, 0.25)).toBe(0)
    expect(normalizeAxis(1, 0.3, 0.7, 0.25)).toBeCloseTo(1, 5)
  })

  it('amplitude curta ainda alcanca o extremo', () => {
    // Controle gasto que so vai ate 0,8 precisa chegar a 1 depois de calibrado.
    expect(normalizeAxis(0.8, 0, 0.8, 0)).toBeCloseTo(1, 5)
  })

  it('nao passa de 1 nem de -1', () => {
    expect(normalizeAxis(5, 0, 0.5, 0)).toBe(1)
    expect(normalizeAxis(-5, 0, 0.5, 0)).toBe(-1)
  })

  it('amplitude zerada nao trava o eixo', () => {
    // Calibracao ruim (jogador nao mexeu o stick) nao pode dividir por zero.
    expect(Number.isFinite(normalizeAxis(0.5, 0, 0, 0))).toBe(true)
  })

  it('valor invalido do navegador vira zero', () => {
    expect(normalizeAxis(Number.NaN, 0, 1, 0)).toBe(0)
  })
})

describe('calibrationFromSamples', () => {
  it('usa a maior das duas metades', () => {
    // -1 de um lado e 0,8 do outro: o lado curto precisa alcancar o limiar.
    const c = calibrationFromSamples([0], [-1], [0.8])
    expect(c.range[0]).toBe(1)
  })

  it('respeita o centro deslocado', () => {
    const c = calibrationFromSamples([0.2], [-0.6], [1])
    expect(c.center[0]).toBe(0.2)
    expect(c.range[0]).toBeCloseTo(0.8, 5)
  })

  it('eixo que nunca se mexeu cai na amplitude cheia', () => {
    const c = calibrationFromSamples(
      [0],
      [Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY],
    )
    expect(c.range[0]).toBe(1)
  })

  it('nao aceita amplitude minuscula', () => {
    const c = calibrationFromSamples([0], [-0.01], [0.01])
    expect(c.range[0]).toBeGreaterThanOrEqual(0.2)
  })
})

describe('identityCalibration', () => {
  it('e neutra: centro zero e amplitude cheia', () => {
    expect(identityCalibration(4)).toEqual({ center: [0, 0, 0, 0], range: [1, 1, 1, 1] })
  })
})
