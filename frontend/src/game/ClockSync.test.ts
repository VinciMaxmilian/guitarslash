import { describe, expect, it } from 'vitest'

import { ClockSync } from './ClockSync'

/** Par ping/pong sintetico: o host esta `offset` ms adiantado, rtt simetrico. */
function pingPong(sync: ClockSync, sentAt: number, offset: number, rtt: number) {
  const receivedAt = sentAt + rtt
  const serverTime = sentAt + rtt / 2 + offset
  sync.addSample(sentAt, serverTime, receivedAt)
}

describe('ClockSync', () => {
  it('comeca sem amostras e sem confianca', () => {
    const sync = new ClockSync()
    expect(sync.sampleCount).toBe(0)
    expect(sync.ready).toBe(false)
    expect(sync.offsetMs).toBe(0)
  })

  it('estima o offset de um relogio adiantado', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 5; i += 1) pingPong(sync, 1000 + i * 100, 5000, 20)
    expect(sync.ready).toBe(true)
    expect(sync.offsetMs).toBeCloseTo(5000, 6)
    expect(sync.rttMs).toBeCloseTo(20, 6)
  })

  it('estima o offset de um relogio atrasado', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 5; i += 1) pingPong(sync, 1000 + i * 100, -3500, 10)
    expect(sync.offsetMs).toBeCloseTo(-3500, 6)
  })

  it('usa a mediana, entao um pico de latencia nao move a estimativa', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 4; i += 1) pingPong(sync, 1000 + i * 100, 200, 10)
    // Um pong atrasadissimo, que na media puxaria o offset para longe.
    sync.addSample(2000, 2000 + 200 + 5, 2000 + 4000)
    for (let i = 0; i < 4; i += 1) pingPong(sync, 3000 + i * 100, 200, 10)
    expect(sync.offsetMs).toBeCloseTo(200, 6)
  })

  it('descarta par com rtt negativo', () => {
    const sync = new ClockSync()
    sync.addSample(5000, 5000, 4000)
    expect(sync.sampleCount).toBe(0)
  })

  it('descarta par com numero invalido', () => {
    const sync = new ClockSync()
    sync.addSample(Number.NaN, 1000, 1010)
    expect(sync.sampleCount).toBe(0)
  })

  it('mantem apenas a janela mais recente', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 50; i += 1) pingPong(sync, 1000 + i * 100, 42, 8)
    expect(sync.sampleCount).toBeLessThanOrEqual(9)
    expect(sync.offsetMs).toBeCloseTo(42, 6)
  })

  it('a janela esquece o offset antigo depois de um ajuste de hora', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 9; i += 1) pingPong(sync, 1000 + i * 100, 1000, 10)
    expect(sync.offsetMs).toBeCloseTo(1000, 6)
    for (let i = 0; i < 9; i += 1) pingPong(sync, 5000 + i * 100, -400, 10)
    expect(sync.offsetMs).toBeCloseTo(-400, 6)
  })

  it('converte um instante do host para o relogio local', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 5; i += 1) pingPong(sync, 1000 + i * 100, 60_000, 10)
    // O host marcou "comece em 1_060_000" no relogio dele, que esta 1 min
    // adiantado: localmente isso e 1_000_000.
    expect(sync.toLocal(1_060_000)).toBeCloseTo(1_000_000, 6)
  })

  it('msUntil respeita o offset em vez de comparar relogios crus', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 5; i += 1) pingPong(sync, 1000 + i * 100, 60_000, 10)
    // Sem sincronizar, `1_063_000 - 1_000_000` daria 63 segundos de espera.
    expect(sync.msUntil(1_063_000, 1_000_000)).toBeCloseTo(3000, 6)
  })

  it('msUntil nunca volta no tempo', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 5; i += 1) pingPong(sync, 1000 + i * 100, 0, 10)
    expect(sync.msUntil(500, 9000)).toBe(0)
  })

  it('reset zera a estimativa para a reconexao', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 5; i += 1) pingPong(sync, 1000 + i * 100, 777, 10)
    sync.reset()
    expect(sync.ready).toBe(false)
    expect(sync.offsetMs).toBe(0)
  })
})
