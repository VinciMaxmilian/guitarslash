/**
 * Protocolo da partida LAN. Espelha `backend/app/multiplayer.py`.
 *
 * Mudar qualquer mensagem aqui exige subir PROTOCOL_VERSION nos dois lados: o
 * host recusa cliente com versao diferente, com mensagem clara.
 */

export const PROTOCOL_VERSION = '1'

/** Espelha CODE_ALPHABET/CODE_LENGTH do backend: sem O/0 nem I/1. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 4

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
  /** Codigo curto que os outros jogadores digitam para entrar. */
  code: string
  phase: RoomPhase
  mode: RoomMode
  songId: string | null
  hostId: string | null
  maxPlayers: number
  players: MPPlayer[]
}

/**
 * Acerto de um jogador: [tempoMs, lane, julgamento].
 *
 * Formato compacto porque sao ~13 por segundo por jogador. Serve para os
 * outros desenharem a faixa dele: a faixa em si nao viaja pela rede, todo
 * mundo ja tem o chart da musica.
 */
export type MPHit = [number, number, number]

/** 0..3, na ordem em que o julgamento vale mais. */
export const HIT_JUDGEMENTS = ['miss', 'good', 'great', 'perfect'] as const

export function judgementCode(judgement: string): number {
  const index = HIT_JUDGEMENTS.indexOf(judgement as (typeof HIT_JUDGEMENTS)[number])
  return index < 0 ? 0 : index
}

/** Linha do placar agregado que o host manda a ~10 Hz durante a musica. */
export interface MPScoreboardRow extends MPScoreState {
  id: string
  name: string
  connected: boolean
  finished: boolean
  /** Acertos desde a ultima atualizacao. */
  hits?: MPHit[]
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

/**
 * Uma linha do placar acumulado da SALA, entre partidas.
 *
 * So existe no versus: em co-op a banda faz um score so, e uma coluna de
 * vitorias nao significaria nada.
 */
export interface MPStandingRow {
  id: string
  name: string
  wins: number
  ties: number
  matches: number
  /** Soma dos pontos que ele fez nas partidas desta sala. */
  points: number
  connected: boolean
}

export interface MPResults {
  mode: RoomMode
  songId: string | null
  players: MPResultRow[]
  /** Versus: placar acumulado da sala, do primeiro para o ultimo. */
  standings?: MPStandingRow[]
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
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  TOO_MANY_ROOMS: 'TOO_MANY_ROOMS',
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

/** Erros em que insistir nao ajuda: reconectar daria o mesmo resultado. */
export const FATAL_ERRORS: readonly string[] = [
  MP_ERROR.PROTOCOL,
  MP_ERROR.ROOM_FULL,
  MP_ERROR.ROOM_NOT_FOUND,
  MP_ERROR.TOO_MANY_ROOMS,
]

export type MPConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
