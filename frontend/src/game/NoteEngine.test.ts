import { describe, expect, it, vi } from 'vitest'

import { judgementFor, lanesMatch, NoteEngine, type NoteEngineCallbacks } from './NoteEngine'
import type { Chart, ChartNote } from './types'

function note(time: number, lane: number, gate: number, duration = 0): ChartNote {
  return { time, lane, duration, type: 'normal', gate }
}

function chartWith(notes: ChartNote[], starPower: Chart['starPower'] = []): Chart {
  return {
    songId: 'test',
    instrument: 'guitar',
    difficulty: 'expert',
    resolution: 480,
    length: 10,
    noteCount: notes.length,
    notes,
    starPower,
    solos: [],
    sections: [],
    bpm: [{ time: 0, bpm: 120 }],
  }
}

function callbacks(): NoteEngineCallbacks & { calls: Record<string, number> } {
  const calls = { hit: 0, miss: 0, overstrum: 0, sustain: 0, phrase: 0 }
  return {
    calls,
    onHit: vi.fn(() => void calls.hit++),
    onMiss: vi.fn(() => void calls.miss++),
    onOverstrum: vi.fn(() => void calls.overstrum++),
    onSustain: vi.fn(() => void calls.sustain++),
    onStarPowerPhrase: vi.fn(() => void calls.phrase++),
  }
}

describe('lanesMatch', () => {
  it('aceita ancoragem em nota simples', () => {
    // Nota no azul (3) com verde e vermelho segurados abaixo: vale.
    expect(lanesMatch([3], new Set([0, 1, 3]))).toBe(true)
  })

  it('recusa traste acima da nota simples', () => {
    expect(lanesMatch([3], new Set([3, 4]))).toBe(false)
  })

  it('recusa quando a nota nao esta segurada', () => {
    expect(lanesMatch([2], new Set([0, 1]))).toBe(false)
  })

  it('exige match exato em acorde', () => {
    expect(lanesMatch([0, 1], new Set([0, 1]))).toBe(true)
    expect(lanesMatch([0, 1], new Set([0, 1, 2]))).toBe(false)
    expect(lanesMatch([0, 1], new Set([0]))).toBe(false)
  })
})

describe('judgementFor', () => {
  it('classifica pelas janelas configuradas', () => {
    expect(judgementFor(0.01)).toBe('perfect')
    expect(judgementFor(0.045)).toBe('great')
    expect(judgementFor(0.09)).toBe('good')
    expect(judgementFor(0.2)).toBe('miss')
  })
})

describe('NoteEngine', () => {
  it('agrupa notas simultaneas em um gate', () => {
    const engine = new NoteEngine(
      chartWith([note(1, 0, 0), note(1, 1, 0), note(2, 2, 1)]),
      callbacks(),
    )
    expect(engine.gates).toHaveLength(2)
    expect(engine.gates[0].lanes).toEqual([0, 1])
  })

  it('acerta a nota dentro da janela', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0)]), cb)
    expect(engine.strum(1.01, new Set([0]))).toBe('perfect')
    expect(cb.calls.hit).toBe(1)
    expect(engine.gates[0].status).toBe('hit')
  })

  it('palhetada sem nota por perto e overstrum', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(5, 0, 0)]), cb)
    engine.strum(1, new Set([0]))
    expect(cb.calls.overstrum).toBe(1)
    expect(cb.calls.hit).toBe(0)
  })

  it('traste errado nao consome a nota', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0)]), cb)
    engine.strum(1, new Set([2]))
    expect(cb.calls.overstrum).toBe(1)
    expect(engine.gates[0].status).toBe('pending')
    // A nota continua la e ainda pode ser acertada.
    expect(engine.strum(1.02, new Set([0]))).toBe('perfect')
  })

  it('marca miss quando a nota passa da janela', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0)]), cb)
    engine.update(1.05, new Set())
    expect(cb.calls.miss).toBe(0)
    engine.update(1.2, new Set())
    expect(cb.calls.miss).toBe(1)
    expect(engine.gates[0].status).toBe('missed')
  })

  it('nao marca miss duas vezes', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0)]), cb)
    engine.update(2, new Set())
    engine.update(3, new Set())
    expect(cb.calls.miss).toBe(1)
  })

  it('pontua sustain enquanto o traste estiver segurado', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0, 2)]), cb)
    engine.strum(1, new Set([0]))
    engine.update(1.5, new Set([0]))
    expect(cb.onSustain).toHaveBeenCalledWith(0.5)
  })

  it('para de pontuar sustain quando solta o traste', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0, 2)]), cb)
    engine.strum(1, new Set([0]))
    engine.update(1.5, new Set([0]))
    ;(cb.onSustain as ReturnType<typeof vi.fn>).mockClear()
    engine.update(2.0, new Set())
    engine.update(2.5, new Set([0]))
    expect(cb.onSustain).not.toHaveBeenCalled()
  })

  it('nao pontua sustain alem do fim da nota', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0, 1)]), cb)
    engine.strum(1, new Set([0]))
    engine.update(5, new Set([0]))
    expect(cb.onSustain).toHaveBeenCalledWith(1)
  })

  it('concede star power quando a frase inteira e acertada', () => {
    const cb = callbacks()
    const engine = new NoteEngine(
      chartWith([note(1, 0, 0), note(2, 1, 1)], [{ time: 0.5, duration: 2 }]),
      cb,
    )
    engine.strum(1, new Set([0]))
    expect(cb.calls.phrase).toBe(0)
    engine.strum(2, new Set([1]))
    expect(cb.calls.phrase).toBe(1)
  })

  it('nao concede star power se errar uma nota da frase', () => {
    const cb = callbacks()
    const engine = new NoteEngine(
      chartWith([note(1, 0, 0), note(2, 1, 1)], [{ time: 0.5, duration: 2 }]),
      cb,
    )
    engine.update(1.5, new Set()) // perde a primeira
    engine.strum(2, new Set([1]))
    expect(cb.calls.phrase).toBe(0)
  })

  it('escolhe a nota mais proxima quando ha duas na janela', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1.0, 0, 0), note(1.08, 1, 1)]), cb)
    engine.strum(1.07, new Set([1]))
    expect(engine.gates[1].status).toBe('hit')
    expect(engine.gates[0].status).toBe('pending')
  })

  it('firstVisibleIndex faz busca binaria correta', () => {
    const engine = new NoteEngine(
      chartWith([note(1, 0, 0), note(2, 0, 1), note(3, 0, 2)]),
      callbacks(),
    )
    expect(engine.firstVisibleIndex(0)).toBe(0)
    expect(engine.firstVisibleIndex(2)).toBe(1)
    expect(engine.firstVisibleIndex(9)).toBe(3)
  })
})

describe('modo sem palhetada', () => {
  it('tryFret acerta a nota', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0)]), cb)
    expect(engine.tryFret(1.01, new Set([0]))).toBe('perfect')
    expect(cb.calls.hit).toBe(1)
  })

  it('tryFret sem nota por perto NAO quebra o combo', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(5, 0, 0)]), cb)
    engine.tryFret(1, new Set([0]))
    expect(cb.calls.overstrum).toBe(0)
    expect(cb.calls.hit).toBe(0)
  })

  it('tryFret com traste errado NAO quebra o combo', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0)]), cb)
    engine.tryFret(1, new Set([4]))
    expect(cb.calls.overstrum).toBe(0)
    expect(engine.gates[0].status).toBe('pending')
  })

  it('acorde montado traste a traste acerta sem punir o caminho', () => {
    const cb = callbacks()
    const engine = new NoteEngine(chartWith([note(1, 0, 0), note(1, 1, 0)]), cb)

    // Primeiro traste: ainda nao forma o acorde, e isso nao pode punir.
    engine.tryFret(1, new Set([0]))
    expect(cb.calls.overstrum).toBe(0)
    expect(cb.calls.hit).toBe(0)

    // Segundo traste completa o acorde.
    expect(engine.tryFret(1.01, new Set([0, 1]))).toBe('perfect')
    expect(cb.calls.hit).toBe(1)
  })
})
