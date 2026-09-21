import { GAME_CONFIG } from './config'
import type { Chart, ChartNote, Judgement } from './types'

export interface NoteState {
  note: ChartNote
  hit: boolean
  missed: boolean
  /** Sustain ainda valendo pontos (o jogador continua segurando). */
  sustainAlive: boolean
  scoredUntil: number
}

export interface GateState {
  index: number
  time: number
  lanes: number[]
  notes: NoteState[]
  status: 'pending' | 'hit' | 'missed'
  judgement: Judgement | null
  /**
   * Faz parte de uma frase de star power.
   *
   * O renderer usa isto para desenhar a nota como ESTRELA. Sem a marca, a
   * frase seria invisivel: o jogador ganharia energia sem nunca ter visto o
   * que precisava acertar, que e justamente o contrario do jogo de referencia.
   */
  starPower: boolean
  /**
   * A frase desta nota ja foi perdida (alguem errou uma nota dela).
   *
   * As estrelas restantes continuam valendo pontos normais, mas voltam a ser
   * desenhadas como nota comum: manter o brilho prometeria energia que nao vem
   * mais.
   */
  starPowerLost: boolean
}

interface StarPowerPhrase {
  gates: number[]
  resolved: number
  hits: number
  awarded: boolean
}

/** Frase de star power completa: o que o renderer transforma em raio. */
export interface StarPowerPhraseEvent {
  /** Tempo de musica da ULTIMA nota da frase. */
  time: number
  /** Lanes das notas da frase, para os raios sairem de onde ela passou. */
  lanes: number[]
}

export interface NoteEngineCallbacks {
  onHit(gate: GateState, judgement: Judgement): void
  onMiss(gate: GateState): void
  onOverstrum(): void
  onSustain(seconds: number): void
  onStarPowerPhrase(event: StarPowerPhraseEvent): void
}

/**
 * Estado das notas de um jogador.
 *
 * Nao conhece Canvas, React nem audio: recebe `songTime` e as lanes
 * seguradas, e devolve eventos. E o que permite ter varias sessoes de
 * jogador sobre o mesmo relogio no futuro.
 */
export class NoteEngine {
  readonly gates: GateState[] = []
  readonly totalNotes: number

  private pointer = 0
  private phrases: StarPowerPhrase[] = []

  constructor(
    chart: Chart,
    private readonly callbacks: NoteEngineCallbacks,
  ) {
    const byGate = new Map<number, ChartNote[]>()
    for (const note of chart.notes) {
      const list = byGate.get(note.gate)
      if (list) list.push(note)
      else byGate.set(note.gate, [note])
    }

    const ordered = [...byGate.entries()].sort((a, b) => {
      const ta = a[1][0].time
      const tb = b[1][0].time
      return ta === tb ? a[0] - b[0] : ta - tb
    })

    ordered.forEach(([, notes], index) => {
      this.gates.push({
        index,
        time: notes[0].time,
        lanes: notes.map((n) => n.lane).sort((a, b) => a - b),
        notes: notes.map((note) => ({
          note,
          hit: false,
          missed: false,
          sustainAlive: false,
          scoredUntil: note.time,
        })),
        status: 'pending',
        judgement: null,
        starPower: false,
        starPowerLost: false,
      })
    })

    this.totalNotes = chart.notes.length
    this.buildPhrases(chart)
  }

  private buildPhrases(chart: Chart): void {
    this.phrases = chart.starPower
      .map((span) => {
        const end = span.time + span.duration
        const gates = this.gates
          .filter((gate) => gate.time >= span.time - 1e-6 && gate.time < end - 1e-6)
          .map((gate) => gate.index)
        return { gates, resolved: 0, hits: 0, awarded: false }
      })
      .filter((phrase) => phrase.gates.length > 0)

    // Marca as notas da frase. A marca e por GATE, e nao por nota solta: num
    // acorde dentro da frase as cinco notas sao estrela juntas.
    for (const phrase of this.phrases) {
      for (const index of phrase.gates) this.gates[index].starPower = true
    }
  }

  /** Indice do primeiro gate que pode estar visivel. Usado pelo renderer. */
  firstVisibleIndex(fromTime: number): number {
    let low = 0
    let high = this.gates.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (this.gates[mid].time < fromTime) low = mid + 1
      else high = mid
    }
    return low
  }

  get remaining(): number {
    return this.gates.length - this.pointer
  }

  /** Avanca o tempo: marca misses e contabiliza sustains segurados. */
  /**
   * Volta o estado das notas para um instante da musica.
   *
   * Usado pelo loop do treino. Sem isto, repetir um trecho encontraria as
   * notas ja marcadas como acertadas ou perdidas e nada mais aconteceria.
   */
  seek(songTime: number): void {
    for (const gate of this.gates) {
      gate.status = 'pending'
      gate.judgement = null
      for (const state of gate.notes) {
        state.hit = false
        state.missed = false
        state.sustainAlive = false
        state.scoredUntil = state.note.time
      }
    }

    for (const phrase of this.phrases) {
      phrase.resolved = 0
      phrase.hits = 0
      phrase.awarded = false
      for (const index of phrase.gates) this.gates[index].starPowerLost = false
    }

    // O ponteiro vai para o primeiro gate que ainda nao passou.
    const window = GAME_CONFIG.timing.good
    this.pointer = this.gates.findIndex((gate) => gate.time + window >= songTime)
    if (this.pointer < 0) this.pointer = this.gates.length
  }

  update(songTime: number, heldLanes: Set<number>): void {
    const goodWindow = GAME_CONFIG.timing.good

    while (this.pointer < this.gates.length) {
      const gate = this.gates[this.pointer]
      if (gate.status !== 'pending') {
        this.pointer++
        continue
      }
      if (gate.time + goodWindow >= songTime) break

      gate.status = 'missed'
      for (const state of gate.notes) state.missed = true
      this.resolvePhrase(gate.index, false)
      this.callbacks.onMiss(gate)
      this.pointer++
    }

    this.updateSustains(songTime, heldLanes)
  }

  private updateSustains(songTime: number, heldLanes: Set<number>): void {
    let seconds = 0

    // Sustains so existem em gates ja acertados e proximos do ponteiro.
    const from = Math.max(0, this.pointer - 24)
    for (let i = from; i < this.gates.length; i++) {
      const gate = this.gates[i]
      if (gate.time > songTime) break
      if (gate.status !== 'hit') continue

      for (const state of gate.notes) {
        if (!state.sustainAlive) continue

        const end = state.note.time + state.note.duration
        const holding = heldLanes.has(state.note.lane)

        if (!holding) {
          state.sustainAlive = false
          continue
        }

        const until = Math.min(songTime, end)
        if (until > state.scoredUntil) {
          seconds += until - state.scoredUntil
          state.scoredUntil = until
        }
        if (songTime >= end) {
          state.sustainAlive = false
        }
      }
    }

    if (seconds > 0) {
      this.callbacks.onSustain(seconds)
    }
  }

  /** Palhetada. Erro quebra o combo. Devolve null quando foi overstrum. */
  strum(songTime: number, heldLanes: Set<number>): Judgement | null {
    return this.attempt(songTime, heldLanes, true)
  }

  /**
   * Tentativa silenciosa, usada no modo sem palhetada: cada traste apertado
   * tenta acertar a nota, e nao acertar NAO e punido.
   *
   * Sem isso, montar um acorde (apertar verde e depois vermelho) quebraria o
   * combo no primeiro traste, porque acorde exige match exato.
   */
  tryFret(songTime: number, heldLanes: Set<number>): Judgement | null {
    return this.attempt(songTime, heldLanes, false)
  }

  private attempt(
    songTime: number,
    heldLanes: Set<number>,
    penalize: boolean,
  ): Judgement | null {
    const goodWindow = GAME_CONFIG.timing.good
    const candidate = this.findCandidate(songTime, goodWindow)

    if (!candidate) {
      if (penalize) this.callbacks.onOverstrum()
      return null
    }

    if (!lanesMatch(candidate.lanes, heldLanes)) {
      if (penalize) this.callbacks.onOverstrum()
      return null
    }

    const delta = Math.abs(candidate.time - songTime)
    const judgement = judgementFor(delta)

    candidate.status = 'hit'
    candidate.judgement = judgement
    for (const state of candidate.notes) {
      state.hit = true
      state.sustainAlive = state.note.duration > 0
      state.scoredUntil = Math.max(state.note.time, songTime)
    }

    this.resolvePhrase(candidate.index, true)
    this.callbacks.onHit(candidate, judgement)
    return judgement
  }

  private findCandidate(songTime: number, window: number): GateState | null {
    let best: GateState | null = null
    let bestDelta = Number.POSITIVE_INFINITY

    for (let i = Math.max(0, this.pointer - 2); i < this.gates.length; i++) {
      const gate = this.gates[i]
      const delta = gate.time - songTime
      if (delta > window) break
      if (gate.status !== 'pending') continue
      const absolute = Math.abs(delta)
      if (absolute <= window && absolute < bestDelta) {
        best = gate
        bestDelta = absolute
      }
    }
    return best
  }

  private resolvePhrase(gateIndex: number, hit: boolean): void {
    for (const phrase of this.phrases) {
      if (phrase.awarded || !phrase.gates.includes(gateIndex)) continue
      phrase.resolved++
      if (hit) phrase.hits++

      // Errar UMA nota ja derruba a frase inteira: as estrelas que sobram
      // apagam na hora, em vez de continuar prometendo energia.
      if (!hit) {
        for (const index of phrase.gates) this.gates[index].starPowerLost = true
      }

      if (phrase.resolved >= phrase.gates.length) {
        phrase.awarded = true
        if (phrase.hits >= phrase.gates.length) {
          const gate = this.gates[gateIndex]
          this.callbacks.onStarPowerPhrase({
            time: gate.time,
            lanes: [...new Set(phrase.gates.flatMap((i) => this.gates[i].lanes))],
          })
        }
      }
    }
  }
}

/**
 * Regra de trastes:
 * - nota simples permite ancorar trastes ABAIXO dela;
 * - acorde exige match exato.
 */
export function lanesMatch(required: number[], held: Set<number>): boolean {
  if (required.length === 1) {
    const lane = required[0]
    if (!held.has(lane)) return false
    for (const value of held) {
      if (value > lane) return false
    }
    return true
  }

  if (held.size !== required.length) return false
  return required.every((lane) => held.has(lane))
}

export function judgementFor(delta: number): Judgement {
  const { perfect, great, good } = GAME_CONFIG.timing
  if (delta <= perfect) return 'perfect'
  if (delta <= great) return 'great'
  if (delta <= good) return 'good'
  return 'miss'
}
