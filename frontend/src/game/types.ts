export type NoteType = 'normal' | 'hopo' | 'tap'

export type Judgement = 'perfect' | 'great' | 'good' | 'miss'

export interface ChartNote {
  time: number
  lane: number
  duration: number
  type: NoteType
  gate: number
}

export interface TimeSpan {
  time: number
  duration: number
}

export interface Section {
  time: number
  name: string
}

export interface BpmEvent {
  time: number
  bpm: number
}

export interface Chart {
  songId: string
  instrument: string
  difficulty: string
  resolution: number
  length: number
  noteCount: number
  notes: ChartNote[]
  starPower: TimeSpan[]
  solos: TimeSpan[]
  sections: Section[]
  bpm: BpmEvent[]
}

/** Acao logica do jogador. O mapeamento para teclas fisicas fica nas configuracoes. */
export type GameAction =
  | 'fret0'
  | 'fret1'
  | 'fret2'
  | 'fret3'
  | 'fret4'
  | 'strum'
  | 'starPower'
  | 'pause'

export interface HitEvent {
  lane: number
  judgement: Judgement
  time: number
}

export interface PlayerSnapshot {
  id: number
  name: string
  score: number
  combo: number
  maxCombo: number
  multiplier: number
  accuracy: number
  notesHit: number
  notesMissed: number
  perfect: number
  great: number
  good: number
  starPowerEnergy: number
  starPowerActive: boolean
  stars: number
  /** Desempenho recente, 0..1 (o "rock meter"). */
  rockMeter: number
  /** Progresso 0..1 do combo dentro do degrau atual do multiplicador. */
  comboToNextMultiplier: number
}

export interface EngineSnapshot {
  songTime: number
  duration: number
  paused: boolean
  finished: boolean
  intro: IntroState
  players: PlayerSnapshot[]
  fps: number
}

export type IntroPhase =
  | 'LOADING'
  | 'TITLE'
  | 'ARTIST'
  | 'INSTRUMENT'
  | 'DIFFICULTY'
  | 'COUNTDOWN'
  | 'HIGHWAY_REVEAL'
  | 'START'
  | 'PLAYING'

export interface IntroState {
  phase: IntroPhase
  /** 0 = highway invisivel, 1 = highway completa. */
  reveal: number
  /** Texto grande do countdown, quando houver. */
  countdown: string | null
  cardOpacity: number
}
