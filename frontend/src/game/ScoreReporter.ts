import type { PlayerSnapshot } from './types'

/**
 * Limita e enxuga o envio do placar pela rede.
 *
 * O snapshot da engine muda a cada frame. Mandar isso no WebSocket seria ~60
 * mensagens por segundo por jogador, e o plano e explicito: 5-10 Hz, e diffs
 * em vez do estado completo. O julgamento das notas nunca depende disto, entao
 * atrasar o placar em 100 ms nao custa nada.
 */

/** Campos do snapshot que os outros jogadores precisam ver. */
const FIELDS = [
  'score',
  'combo',
  'maxCombo',
  'multiplier',
  'accuracy',
  'notesHit',
  'notesMissed',
  'starPowerActive',
  'stars',
] as const

type Field = (typeof FIELDS)[number]
type Payload = Partial<Record<Field, number | boolean>>

/** Accuracy e float; sO vale mandar quando muda o suficiente para aparecer. */
const ACCURACY_EPSILON = 0.001

export const SCORE_REPORT_INTERVAL_MS = 100

/**
 * Estado com que o host cria todo jogador (`ScoreState` em multiplayer.py).
 * O diff parte daqui, e nao de um objeto vazio: senao a primeira mensagem
 * carregaria todos os campos zerados que o host ja tem.
 */
const INITIAL: Payload = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  multiplier: 1,
  accuracy: 0,
  notesHit: 0,
  notesMissed: 0,
  starPowerActive: false,
  stars: 0,
}

export class ScoreReporter {
  private last: Payload = { ...INITIAL }
  private lastSentAt = -Infinity

  constructor(
    private readonly send: (payload: Payload) => void,
    private readonly intervalMs: number = SCORE_REPORT_INTERVAL_MS,
  ) {}

  /**
   * Envia o que mudou, respeitando o intervalo minimo.
   *
   * @returns true se algo foi para a rede.
   */
  report(snapshot: PlayerSnapshot, now: number): boolean {
    if (now - this.lastSentAt < this.intervalMs) return false

    const diff: Payload = {}
    for (const field of FIELDS) {
      const value = snapshot[field]
      const previous = this.last[field]
      if (field === 'accuracy') {
        if (
          typeof previous !== 'number' ||
          Math.abs((value as number) - previous) >= ACCURACY_EPSILON
        ) {
          diff.accuracy = value as number
        }
        continue
      }
      if (value !== previous) diff[field] = value as number | boolean
    }

    if (Object.keys(diff).length === 0) return false

    this.last = { ...this.last, ...diff }
    this.lastSentAt = now
    this.send(diff)
    return true
  }

  /** Estado final da musica: vai completo e sem throttle. */
  final(snapshot: PlayerSnapshot): Payload {
    const payload: Payload = {}
    for (const field of FIELDS) payload[field] = snapshot[field] as number | boolean
    this.last = { ...payload }
    return payload
  }

  reset(): void {
    this.last = { ...INITIAL }
    this.lastSentAt = -Infinity
  }
}
