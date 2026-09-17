import { GAME_CONFIG } from './config'
import type { IntroPhase, IntroState } from './types'

/**
 * Sequencia de entrada da musica.
 *
 * Todas as fases sao derivadas do mesmo relogio da gameplay (songTime, que
 * e negativo antes da musica comecar). Nao ha setTimeout nem contador
 * proprio, entao a intro nunca dessincroniza da musica.
 */

const LEAD_IN = GAME_CONFIG.intro.leadIn

/** Limites em segundos ANTES do inicio da musica (valores negativos). */
const PHASES: { phase: IntroPhase; from: number; to: number }[] = [
  { phase: 'TITLE', from: -LEAD_IN, to: -LEAD_IN + 0.9 },
  { phase: 'ARTIST', from: -LEAD_IN + 0.9, to: -LEAD_IN + 1.5 },
  { phase: 'INSTRUMENT', from: -LEAD_IN + 1.5, to: -LEAD_IN + 2.0 },
  { phase: 'DIFFICULTY', from: -LEAD_IN + 2.0, to: -LEAD_IN + 2.4 },
  { phase: 'HIGHWAY_REVEAL', from: -LEAD_IN + 2.4, to: -2.6 },
  { phase: 'COUNTDOWN', from: -2.6, to: -0.45 },
  { phase: 'START', from: -0.45, to: 0 },
]

export class IntroSequence {
  static readonly leadIn = LEAD_IN

  private loaded = false

  markLoaded(): void {
    this.loaded = true
  }

  state(songTime: number): IntroState {
    if (!this.loaded) {
      return { phase: 'LOADING', reveal: 0, countdown: null, cardOpacity: 0 }
    }

    if (songTime >= 0) {
      return { phase: 'PLAYING', reveal: 1, countdown: null, cardOpacity: 0 }
    }

    const phase = PHASES.find((p) => songTime >= p.from && songTime < p.to)?.phase ?? 'TITLE'

    return {
      phase,
      reveal: revealFor(songTime),
      countdown: countdownFor(songTime),
      cardOpacity: cardOpacityFor(songTime),
    }
  }
}

/** A highway sobe na tela entre -3.4s e -2.2s. */
function revealFor(songTime: number): number {
  const from = -LEAD_IN + 1.1
  const to = -LEAD_IN + 2.3
  if (songTime <= from) return 0
  if (songTime >= to) return 1
  return (songTime - from) / (to - from)
}

/** Cartao com musica/artista/instrumento: aparece e sai antes da contagem. */
function cardOpacityFor(songTime: number): number {
  const fadeIn = -LEAD_IN + 0.25
  const hold = -2.9
  const fadeOut = -2.5
  if (songTime < -LEAD_IN) return 0
  if (songTime < fadeIn) return (songTime + LEAD_IN) / (fadeIn + LEAD_IN)
  if (songTime < hold) return 1
  if (songTime < fadeOut) return 1 - (songTime - hold) / (fadeOut - hold)
  return 0
}

function countdownFor(songTime: number): string | null {
  if (songTime >= 0) return null
  if (songTime >= -0.45) return 'ROCK!'
  if (songTime >= -1.15) return '1'
  if (songTime >= -1.85) return '2'
  if (songTime >= -2.6) return '3'
  return null
}
