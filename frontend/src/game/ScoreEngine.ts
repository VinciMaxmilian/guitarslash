import { GAME_CONFIG } from './config'
import type { Judgement, PlayerSnapshot } from './types'

/**
 * Pontuacao, combo, multiplicador e star power de UM jogador.
 * Totalmente independente do render e do audio.
 */
export class ScoreEngine {
  score = 0
  combo = 0
  maxCombo = 0
  notesHit = 0
  notesMissed = 0
  overstrums = 0
  perfect = 0
  great = 0
  good = 0

  starPowerEnergy = 0
  starPowerActive = false

  /** Desempenho recente, 0..1. Ver GAME_CONFIG.rockMeter. */
  rockMeter: number = GAME_CONFIG.rockMeter.start

  constructor(
    public readonly playerId: number,
    public readonly playerName: string,
    public readonly totalNotes: number,
  ) {}

  get baseMultiplier(): number {
    const { multiplierSteps, maxMultiplier } = GAME_CONFIG.score
    let multiplier = 1
    for (const step of multiplierSteps) {
      if (this.combo >= step) multiplier++
    }
    return Math.min(multiplier, maxMultiplier)
  }

  get multiplier(): number {
    return this.baseMultiplier * (this.starPowerActive ? GAME_CONFIG.starPower.multiplier : 1)
  }

  /**
   * Progresso 0..1 do combo dentro do degrau atual do multiplicador.
   *
   * E o que preenche o anel em volta do multiplicador. No topo, devolve 1.
   */
  get comboToNextMultiplier(): number {
    const { multiplierSteps } = GAME_CONFIG.score
    const proximo = multiplierSteps.find((step) => this.combo < step)
    if (proximo === undefined) return 1
    const anterior = [...multiplierSteps].reverse().find((step) => this.combo >= step) ?? 0
    return (this.combo - anterior) / (proximo - anterior)
  }

  get judged(): number {
    return this.notesHit + this.notesMissed
  }

  get accuracy(): number {
    return this.judged === 0 ? 1 : this.notesHit / this.judged
  }

  get stars(): number {
    if (this.judged === 0) return 0
    const accuracy = this.accuracy
    return GAME_CONFIG.stars.filter((threshold) => accuracy >= threshold).length
  }

  registerHit(judgement: Judgement, noteCount: number): void {
    const weight = GAME_CONFIG.score.judgementWeight[judgement] ?? 1

    if (judgement === 'perfect') this.perfect += noteCount
    else if (judgement === 'great') this.great += noteCount
    else this.good += noteCount

    // O combo conta acordes como um evento, mas cada nota pontua.
    this.combo++
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.notesHit += noteCount
    this.score += Math.round(
      GAME_CONFIG.score.notePoints * weight * noteCount * this.multiplier,
    )
    this.addRock(GAME_CONFIG.rockMeter.gainPerHit * noteCount)
  }

  private addRock(delta: number): void {
    this.rockMeter = Math.min(1, Math.max(0, this.rockMeter + delta))
  }

  /** Faixa em que o ponteiro esta, para a interface escolher a cor. */
  get rockZone(): 'danger' | 'warning' | 'good' {
    if (this.rockMeter < 0.25) return 'danger'
    if (this.rockMeter < 0.5) return 'warning'
    return 'good'
  }

  registerMiss(noteCount: number): void {
    this.notesMissed += noteCount
    this.combo = 0
    this.addRock(-GAME_CONFIG.rockMeter.lossPerMiss * noteCount)
  }

  registerOverstrum(): void {
    this.overstrums++
    this.combo = 0
    this.addRock(-GAME_CONFIG.rockMeter.lossPerOverstrum)
  }

  addSustain(seconds: number): void {
    this.score += Math.round(
      GAME_CONFIG.score.sustainPointsPerSecond * seconds * this.multiplier,
    )
  }

  addStarPowerPhrase(): void {
    this.starPowerEnergy = Math.min(1, this.starPowerEnergy + GAME_CONFIG.starPower.energyPerPhrase)
  }

  canActivateStarPower(): boolean {
    return !this.starPowerActive && this.starPowerEnergy >= GAME_CONFIG.starPower.activationThreshold
  }

  activateStarPower(): boolean {
    if (!this.canActivateStarPower()) return false
    this.starPowerActive = true
    return true
  }

  /** Drena a energia enquanto o star power estiver ativo. */
  update(deltaSeconds: number): void {
    if (!this.starPowerActive) return
    this.starPowerEnergy -= deltaSeconds / GAME_CONFIG.starPower.drainSeconds
    if (this.starPowerEnergy <= 0) {
      this.starPowerEnergy = 0
      this.starPowerActive = false
    }
  }

  snapshot(): PlayerSnapshot {
    return {
      id: this.playerId,
      name: this.playerName,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.multiplier,
      accuracy: this.accuracy,
      notesHit: this.notesHit,
      notesMissed: this.notesMissed,
      perfect: this.perfect,
      great: this.great,
      good: this.good,
      starPowerEnergy: this.starPowerEnergy,
      starPowerActive: this.starPowerActive,
      stars: this.stars,
      rockMeter: this.rockMeter,
      comboToNextMultiplier: this.comboToNextMultiplier,
    }
  }
}
