import { laneForAction } from './config'
import { NoteEngine, type StarPowerPhraseEvent } from './NoteEngine'
import { ScoreEngine } from './ScoreEngine'
import type { Chart, GameAction, HitEvent, Judgement, PlayerSnapshot } from './types'

export interface PlayerSessionOptions {
  id: number
  name: string
  chart: Chart
  instrument: string
  difficulty: string
  /** false = modo sem palhetada (padrao): o traste certo ja acerta a nota. */
  requireStrum?: boolean
  onHit?: (event: HitEvent) => void
  onMiss?: () => void
  onOverstrum?: () => void
  /** Frase de star power fechada: serve para o som de recompensa. */
  onStarPowerPhrase?: (event: StarPowerPhraseEvent) => void
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
  readonly misses: { lane: number; time: number }[] = []
  /**
   * Frases de star power fechadas e ainda nao desenhadas.
   *
   * Mesma ideia de `effects`: a sessao so anota o QUE aconteceu e QUANDO; o
   * renderer decide como isso vira raio. Assim o efeito nao depende de frame e
   * nao existe timer fora do relogio da musica.
   */
  readonly starPowerBursts: StarPowerPhraseEvent[] = []

  /** Alteravel em tempo real pelas configuracoes, sem recriar a sessao. */
  requireStrum: boolean

  private lastJudgement: Judgement | null = null
  private lastJudgementAt = -10

  /**
   * Ha um aperto de traste ainda nao aproveitado.
   *
   * No modo sem palhetada, a tentativa so acontecia no INSTANTE do aperto. Se
   * o dedo descia antes da nota entrar na janela - o que acontece o tempo
   * todo com quem apoia os dedos nos trastes - o aperto era jogado fora, e a
   * nota passava por cima do traste segurado sem contar como acerto.
   *
   * Com a marca, o aperto continua valendo ate encontrar a nota. Ela cai no
   * primeiro acerto: sem isso, segurar o verde uma vez acertaria sozinho toda
   * nota verde que viesse depois, e o modo viraria piloto automatico.
   */
  private armed = false

  constructor(private readonly options: PlayerSessionOptions) {
    this.id = options.id
    this.name = options.name
    this.instrument = options.instrument
    this.difficulty = options.difficulty
    this.requireStrum = options.requireStrum ?? false

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
        for (const state of gate.notes) {
          this.misses.push({ lane: state.note.lane, time: gate.time })
        }
        this.options.onMiss?.()
      },
      onOverstrum: () => {
        this.score.registerOverstrum()
        this.options.onOverstrum?.()
      },
      onSustain: (seconds) => {
        this.score.addSustain(seconds)
      },
      onStarPowerPhrase: (event) => {
        this.score.addStarPowerPhrase()
        this.starPowerBursts.push(event)
        this.options.onStarPowerPhrase?.(event)
      },
    })
  }

  get judgementFeedback(): { judgement: Judgement; time: number } | null {
    return this.lastJudgement ? { judgement: this.lastJudgement, time: this.lastJudgementAt } : null
  }

  /**
   * Volta a sessao para um instante da musica.
   *
   * Usado pelo loop do treino: reseta notas, placar e efeitos, para cada
   * repeticao comecar limpa.
   */
  seek(songTime: number): void {
    this.notes.seek(songTime)
    this.score.reset()
    this.heldLanes.clear()
    this.effects.length = 0
    this.misses.length = 0
    this.starPowerBursts.length = 0
    this.lastJudgement = null
    this.lastJudgementAt = -10
    this.armed = false
  }

  handleAction(action: GameAction, pressed: boolean, songTime: number): void {
    const lane = laneForAction(action)

    if (lane !== null) {
      if (!pressed) {
        this.heldLanes.delete(lane)
        return
      }
      this.heldLanes.add(lane)
      // Sem palhetada: cada traste apertado ja tenta acertar a nota.
      if (!this.requireStrum) {
        const acertou = this.notes.tryFret(songTime, this.heldLanes)
        // Nao achou nota: o aperto fica de pe esperando a que vem.
        this.armed = acertou === null
      }
      return
    }

    if (action === 'strum' && pressed) {
      // No modo sem palhetada a tecla continua funcionando, mas nao pune quem
      // palheta por habito.
      if (this.requireStrum) {
        this.notes.strum(songTime, this.heldLanes)
      } else {
        this.armed = this.notes.tryFret(songTime, this.heldLanes) === null
      }
      return
    }

    if (action === 'starPower' && pressed) {
      this.score.activateStarPower()
    }
  }

  update(songTime: number, deltaSeconds: number): void {
    // ANTES de `notes.update`, que e quem marca as notas perdidas: um aperto
    // de pe tem de alcancar a nota enquanto ela ainda esta na janela.
    if (!this.requireStrum && this.armed && this.heldLanes.size > 0) {
      if (this.notes.tryFret(songTime, this.heldLanes) !== null) this.armed = false
    }

    this.notes.update(songTime, this.heldLanes)
    this.score.update(deltaSeconds)

    // Limita o acumulo de efeitos quando o renderer nao os consome.
    if (this.effects.length > 64) {
      this.effects.splice(0, this.effects.length - 64)
    }
    if (this.misses.length > 32) {
      this.misses.splice(0, this.misses.length - 32)
    }
    if (this.starPowerBursts.length > 4) {
      this.starPowerBursts.splice(0, this.starPowerBursts.length - 4)
    }
  }

  releaseAll(): void {
    this.heldLanes.clear()
  }

  snapshot(): PlayerSnapshot {
    return this.score.snapshot()
  }
}
