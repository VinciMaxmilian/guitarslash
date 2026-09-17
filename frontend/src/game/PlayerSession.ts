import { laneForAction } from './config'
import { NoteEngine } from './NoteEngine'
import { ScoreEngine } from './ScoreEngine'
import type { Chart, GameAction, HitEvent, Judgement, PlayerSnapshot } from './types'

export interface PlayerSessionOptions {
  id: number
  name: string
  chart: Chart
  instrument: string
  difficulty: string
  onHit?: (event: HitEvent) => void
}

/**
 * Uma sessao de jogador.
 *
 * O GameEngine mantem uma LISTA de sessoes mesmo no singleplayer. E o que
 * permite a FASE 3 (LAN) reaproveitar a engine sem reescrever nada: la cada
 * maquina roda a propria sessao contra o proprio relogio.
 */
export class PlayerSession {
  readonly id: number
  readonly name: string
  readonly instrument: string
  readonly difficulty: string
  readonly notes: NoteEngine
  readonly score: ScoreEngine

  readonly heldLanes = new Set<number>()
  /** Efeitos visuais recentes, consumidos pelo renderer. */
  readonly effects: HitEvent[] = []

  private lastJudgement: Judgement | null = null
  private lastJudgementAt = -10

  constructor(private readonly options: PlayerSessionOptions) {
    this.id = options.id
    this.name = options.name
    this.instrument = options.instrument
    this.difficulty = options.difficulty

    this.score = new ScoreEngine(options.id, options.name, options.chart.noteCount)
    this.notes = new NoteEngine(options.chart, {
      onHit: (gate, judgement) => {
        this.score.registerHit(judgement, gate.notes.length)
        this.lastJudgement = judgement
        this.lastJudgementAt = gate.time
        for (const state of gate.notes) {
          const event: HitEvent = { lane: state.note.lane, judgement, time: gate.time }
          this.effects.push(event)
          this.options.onHit?.(event)
        }
      },
      onMiss: (gate) => {
        this.score.registerMiss(gate.notes.length)
        this.lastJudgement = 'miss'
        this.lastJudgementAt = gate.time
      },
      onOverstrum: () => {
        this.score.registerOverstrum()
      },
      onSustain: (seconds) => {
        this.score.addSustain(seconds)
      },
      onStarPowerPhrase: () => {
        this.score.addStarPowerPhrase()
      },
    })
  }

  get judgementFeedback(): { judgement: Judgement; time: number } | null {
    return this.lastJudgement ? { judgement: this.lastJudgement, time: this.lastJudgementAt } : null
  }

  handleAction(action: GameAction, pressed: boolean, songTime: number): void {
    const lane = laneForAction(action)

    if (lane !== null) {
      if (pressed) this.heldLanes.add(lane)
      else this.heldLanes.delete(lane)
      return
    }

    if (action === 'strum' && pressed) {
      this.notes.strum(songTime, this.heldLanes)
      return
    }

    if (action === 'starPower' && pressed) {
      this.score.activateStarPower()
    }
  }

  update(songTime: number, deltaSeconds: number): void {
    this.notes.update(songTime, this.heldLanes)
    this.score.update(deltaSeconds)

    // Limita o acumulo de efeitos quando o renderer nao os consome.
    if (this.effects.length > 64) {
      this.effects.splice(0, this.effects.length - 64)
    }
  }

  releaseAll(): void {
    this.heldLanes.clear()
  }

  snapshot(): PlayerSnapshot {
    return this.score.snapshot()
  }
}
