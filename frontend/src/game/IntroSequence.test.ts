import { describe, expect, it } from 'vitest'

import { computeBeats } from './GameEngine'
import { IntroSequence } from './IntroSequence'

describe('IntroSequence', () => {
  it('fica em LOADING ate os assets carregarem', () => {
    const intro = new IntroSequence()
    expect(intro.state(-4).phase).toBe('LOADING')
  })

  it('passa pelas fases conforme o tempo negativo avanca', () => {
    const intro = new IntroSequence()
    intro.markLoaded()
    expect(intro.state(-IntroSequence.leadIn).phase).toBe('TITLE')
    expect(intro.state(-2.0).phase).toBe('COUNTDOWN')
    expect(intro.state(-0.2).phase).toBe('START')
    expect(intro.state(0.5).phase).toBe('PLAYING')
  })

  it('faz a contagem regressiva nos instantes certos', () => {
    const intro = new IntroSequence()
    intro.markLoaded()
    expect(intro.state(-2.5).countdown).toBe('3')
    expect(intro.state(-1.5).countdown).toBe('2')
    expect(intro.state(-1.0).countdown).toBe('1')
    expect(intro.state(-0.2).countdown).toBe('ROCK!')
    expect(intro.state(0.1).countdown).toBeNull()
  })

  it('revela a highway progressivamente e termina em 1', () => {
    const intro = new IntroSequence()
    intro.markLoaded()
    expect(intro.state(-IntroSequence.leadIn).reveal).toBe(0)
    const meio = intro.state(-IntroSequence.leadIn + 1.7).reveal
    expect(meio).toBeGreaterThan(0)
    expect(meio).toBeLessThan(1)
    expect(intro.state(-1).reveal).toBe(1)
    expect(intro.state(3).reveal).toBe(1)
  })
})

describe('computeBeats', () => {
  it('gera uma batida por intervalo de bpm', () => {
    const beats = computeBeats([{ time: 0, bpm: 120 }], 2)
    expect(beats).toEqual([0, 0.5, 1, 1.5])
  })

  it('respeita mudanca de andamento', () => {
    const beats = computeBeats(
      [
        { time: 0, bpm: 120 },
        { time: 1, bpm: 240 },
      ],
      2,
    )
    expect(beats).toEqual([0, 0.5, 1, 1.25, 1.5, 1.75])
  })

  it('devolve vazio sem eventos de bpm', () => {
    expect(computeBeats([], 10)).toEqual([])
  })
})
