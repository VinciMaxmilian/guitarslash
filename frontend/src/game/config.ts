import type { GameAction } from './types'

export const LANE_COUNT = 5

export const LANE_NAMES = ['Verde', 'Vermelho', 'Amarelo', 'Azul', 'Laranja'] as const

/** Identidade propria: neon de palco, nao as cores de nenhum jogo especifico. */
export const DEFAULT_NOTE_COLORS = [
  '#35e07f',
  '#ff2e4d',
  '#ffd23f',
  '#2f8fff',
  '#ff8a1f',
]

export const COLORBLIND_NOTE_COLORS = [
  '#00b3a4',
  '#d65db1',
  '#f6e27a',
  '#0072b2',
  '#e69f00',
]

export const DEFAULT_BINDINGS: Record<GameAction, string> = {
  fret0: 'KeyA',
  fret1: 'KeyS',
  fret2: 'KeyD',
  fret3: 'KeyF',
  fret4: 'KeyG',
  strum: 'Space',
  starPower: 'Enter',
  pause: 'Escape',
}

export const ACTION_LABELS: Record<GameAction, string> = {
  fret0: 'Traste 1 (verde)',
  fret1: 'Traste 2 (vermelho)',
  fret2: 'Traste 3 (amarelo)',
  fret3: 'Traste 4 (azul)',
  fret4: 'Traste 5 (laranja)',
  strum: 'Palhetada',
  starPower: 'Star Power',
  pause: 'Pausar',
}

export const GAME_CONFIG = {
  timing: {
    perfect: 0.03,
    great: 0.06,
    good: 0.1,
  },
  score: {
    notePoints: 50,
    /** Peso por julgamento, aplicado sobre notePoints. */
    judgementWeight: { perfect: 1, great: 0.8, good: 0.6 } as Record<string, number>,
    sustainPointsPerSecond: 100,
    /** Combo necessario para cada degrau do multiplicador. */
    multiplierSteps: [10, 20, 30],
    maxMultiplier: 4,
  },
  starPower: {
    /** Energia ganha por frase de star power completa. */
    energyPerPhrase: 0.25,
    /** Energia minima para ativar. */
    activationThreshold: 0.5,
    /** Segundos para consumir a barra cheia. */
    drainSeconds: 16,
    multiplier: 2,
  },
  highway: {
    /** Segundos de chart visiveis entre a hit line e o fundo, no noteSpeed 5. */
    baseLookAhead: 1.15,
    /** Curvatura da perspectiva. Maior = highway mais "deitada". */
    perspective: 1.45,
    /** Quanto tempo a nota ja passada continua desenhada. */
    trailSeconds: 0.12,
  },
  intro: {
    /** Segundos de chart negativo antes da musica comecar. */
    leadIn: 4.5,
  },
  /** Estrelas do resultado por accuracy minima. */
  stars: [0.5, 0.7, 0.85, 0.93, 0.98],
} as const

/** noteSpeed 1..10 -> segundos visiveis. Mais rapido = menos tempo na tela. */
export function lookAheadFor(noteSpeed: number): number {
  const clamped = Math.min(10, Math.max(1, noteSpeed))
  return GAME_CONFIG.highway.baseLookAhead * (1.6 - clamped * 0.12)
}

export const FRET_ACTIONS: GameAction[] = ['fret0', 'fret1', 'fret2', 'fret3', 'fret4']

export function laneForAction(action: GameAction): number | null {
  const index = FRET_ACTIONS.indexOf(action)
  return index === -1 ? null : index
}
