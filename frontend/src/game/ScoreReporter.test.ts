import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScoreReporter, SCORE_REPORT_INTERVAL_MS } from './ScoreReporter'
import type { PlayerSnapshot } from './types'

function snapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 0,
    name: 'Ana',
    score: 0,
    combo: 0,
    maxCombo: 0,
    multiplier: 1,
    accuracy: 0,
    notesHit: 0,
    notesMissed: 0,
    perfect: 0,
    great: 0,
    good: 0,
    starPowerEnergy: 0,
    starPowerActive: false,
    stars: 0,
    ...overrides,
  }
}

describe('ScoreReporter', () => {
  let sent: Array<Record<string, unknown>>
  let reporter: ScoreReporter

  beforeEach(() => {
    sent = []
    reporter = new ScoreReporter((payload) => sent.push(payload))
  })

  it('manda o primeiro estado que tem algo diferente do zero', () => {
    expect(reporter.report(snapshot({ score: 100, combo: 4 }), 0)).toBe(true)
    expect(sent).toEqual([{ score: 100, combo: 4 }])
  })

  it('nao manda nada quando o snapshot e todo zero', () => {
    expect(reporter.report(snapshot(), 0)).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('manda apenas os campos que mudaram', () => {
    reporter.report(snapshot({ score: 100, combo: 4 }), 0)
    sent = []
    reporter.report(snapshot({ score: 250, combo: 4 }), 1000)
    expect(sent).toEqual([{ score: 250 }])
  })

  it('segura mensagens dentro do intervalo minimo', () => {
    reporter.report(snapshot({ score: 100 }), 0)
    sent = []
    expect(reporter.report(snapshot({ score: 200 }), SCORE_REPORT_INTERVAL_MS - 1)).toBe(false)
    expect(sent).toHaveLength(0)
    expect(reporter.report(snapshot({ score: 200 }), SCORE_REPORT_INTERVAL_MS)).toBe(true)
    expect(sent).toEqual([{ score: 200 }])
  })

  it('60 frames por segundo viram no maximo 10 mensagens', () => {
    let messages = 0
    const engine = new ScoreReporter(() => {
      messages += 1
    })
    for (let frame = 0; frame < 60; frame += 1) {
      engine.report(snapshot({ score: frame * 10, combo: frame }), frame * (1000 / 60))
    }
    expect(messages).toBeLessThanOrEqual(10)
    expect(messages).toBeGreaterThan(0)
  })

  it('nao reenvia quando nada mudou, mesmo depois do intervalo', () => {
    reporter.report(snapshot({ score: 100 }), 0)
    sent = []
    expect(reporter.report(snapshot({ score: 100 }), 5000)).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('ignora variacao irrelevante de accuracy', () => {
    reporter.report(snapshot({ accuracy: 0.5 }), 0)
    sent = []
    expect(reporter.report(snapshot({ accuracy: 0.50005 }), 1000)).toBe(false)
    expect(reporter.report(snapshot({ accuracy: 0.52 }), 2000)).toBe(true)
    expect(sent).toEqual([{ accuracy: 0.52 }])
  })

  it('manda star power quando liga e quando desliga', () => {
    reporter.report(snapshot({ score: 10, starPowerActive: true }), 0)
    sent = []
    reporter.report(snapshot({ score: 10, starPowerActive: false }), 1000)
    expect(sent).toEqual([{ starPowerActive: false }])
  })

  it('o estado final vai completo, sem depender de diff', () => {
    reporter.report(snapshot({ score: 100 }), 0)
    const final = reporter.final(snapshot({ score: 9999, accuracy: 0.91, stars: 4 }))
    expect(final).toMatchObject({
      score: 9999,
      accuracy: 0.91,
      stars: 4,
      combo: 0,
      multiplier: 1,
      starPowerActive: false,
    })
  })

  it('reset volta a mandar tudo, para a musica seguinte', () => {
    reporter.report(snapshot({ score: 100 }), 0)
    reporter.reset()
    sent = []
    expect(reporter.report(snapshot({ score: 100 }), 10)).toBe(true)
    expect(sent).toEqual([{ score: 100 }])
  })

  it('nao manda campos que nao interessam a rede', () => {
    reporter.report(snapshot({ score: 1, starPowerEnergy: 0.7, perfect: 12 }), 0)
    const payload = sent[0]
    expect(payload).not.toHaveProperty('starPowerEnergy')
    expect(payload).not.toHaveProperty('perfect')
    expect(payload).not.toHaveProperty('name')
  })

  it('usa o intervalo configurado', () => {
    const spy = vi.fn()
    const slow = new ScoreReporter(spy, 500)
    slow.report(snapshot({ score: 1 }), 0)
    slow.report(snapshot({ score: 2 }), 200)
    expect(spy).toHaveBeenCalledTimes(1)
    slow.report(snapshot({ score: 3 }), 500)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('ScoreReporter — acertos para a faixa espelho', () => {
  let sent: Array<Record<string, unknown>>
  let reporter: ScoreReporter

  beforeEach(() => {
    sent = []
    reporter = new ScoreReporter((payload) => sent.push(payload))
  })

  it('manda os acertos enfileirados junto do proximo placar', () => {
    reporter.queueHit([1500, 2, 3])
    reporter.queueHit([1620, 0, 1])
    reporter.report(snapshot({ score: 100 }), 0)
    expect(sent[0].hits).toEqual([[1500, 2, 3], [1620, 0, 1]])
  })

  it('um acerto justifica a mensagem mesmo sem mudanca de placar', () => {
    reporter.report(snapshot({ score: 100 }), 0)
    sent = []
    reporter.queueHit([2000, 4, 2])
    expect(reporter.report(snapshot({ score: 100 }), 1000)).toBe(true)
    expect(sent).toEqual([{ hits: [[2000, 4, 2]] }])
  })

  it('a fila esvazia depois de enviada, sem repetir eventos', () => {
    reporter.queueHit([100, 1, 3])
    reporter.report(snapshot({ score: 10 }), 0)
    sent = []
    reporter.report(snapshot({ score: 20 }), 1000)
    expect(sent[0].hits).toBeUndefined()
  })

  it('acertos no intervalo de throttle ficam guardados, nao somem', () => {
    reporter.report(snapshot({ score: 10 }), 0)
    sent = []
    reporter.queueHit([100, 0, 3])
    reporter.queueHit([150, 1, 3])
    expect(reporter.report(snapshot({ score: 20 }), 50)).toBe(false)
    reporter.report(snapshot({ score: 20 }), 100)
    expect(sent[0].hits).toEqual([[100, 0, 3], [150, 1, 3]])
  })

  it('reset descarta acertos pendentes da partida anterior', () => {
    reporter.queueHit([100, 0, 3])
    reporter.reset()
    expect(reporter.report(snapshot(), 1000)).toBe(false)
  })
})
