/**
 * Protocolo da partida LAN. Espelha `backend/app/multiplayer.py`.
 *
 * Mudar qualquer mensagem aqui exige subir PROTOCOL_VERSION nos dois lados: o
 * host recusa cliente com versao diferente, com mensagem clara.
 */

export const PROTOCOL_VERSION = '1'

export type RoomPhase = 'lobby' | 'loading' | 'playing' | 'results'
export type RoomMode = 'versus' | 'coop'

export interface MPScoreState {
  score: number
  combo: number
  maxCombo: number
  multiplier: number
  accuracy: number
  notesHit: number
  notesMissed: number
  starPowerActive: boolean
  stars: number
}

export interface MPPlayer {
  id: string
  name: string
  instrument: string | null
  difficulty: string | null
  ready: boolean
  loadProgress: number
  connected: boolean
  /** Entrou com a partida rolando: assiste, nao bloqueia gate nenhum. */
  spectator: boolean
  finished: boolean
  isHost: boolean
  scoreState: MPScoreState
}

export interface MPRoom {
  phase: RoomPhase
  mode: RoomMode
  songId: string | null
  hostId: string | null
  maxPlayers: number
  players: MPPlayer[]
}

/** Linha do placar agregado que o host manda a ~10 Hz durante a musica. */
export interface MPScoreboardRow extends MPScoreState {
  id: string
  name: string
  connected: boolean
  finished: boolean
}

export interface MPScoreboard {
  players: MPScoreboardRow[]
  /** So em co-op: soma dos scores da banda. */
  bandScore?: number
}

export interface MPResultRow extends MPScoreState {
  id: string
  name: string
  instrument: string | null
  difficulty: string | null
  connected: boolean
}

export interface MPResults {
  mode: RoomMode
  songId: string | null
  players: MPResultRow[]
  /** Versus: quem ganhou. */
  winnerId?: string | null
  /** Versus: empate depois de todos os critErios de desempate. */
  tie?: boolean
  /** Versus: scores nao sao comparaveis porque as dificuldades diferem. */
  mixedDifficulty?: boolean
  /** Co-op: soma da banda. */
  bandScore?: number
}

export const MP_ERROR = {
  PROTOCOL: 'PROTOCOL_VERSION',
  ROOM_FULL: 'ROOM_FULL',
  NOT_HOST: 'NOT_HOST',
  ALREADY_JOINED: 'ALREADY_JOINED',
  BAD_PAYLOAD: 'BAD_PAYLOAD',
  IN_PROGRESS: 'IN_PROGRESS',
} as const

export interface MPError {
  code: string
  message: string
  /** Erro fatal: reconectar nao resolve, nao tentar de novo. */
  fatal: boolean
}

/** Erros em que insistir nao ajuda: versao incompativel ou sala cheia. */
export const FATAL_ERRORS: readonly string[] = [MP_ERROR.PROTOCOL, MP_ERROR.ROOM_FULL]

export type MPConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
