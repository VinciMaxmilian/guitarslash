import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ClockSync } from './ClockSync'
import { matchSocketUrl } from './hostMode'
import {
  FATAL_ERRORS,
  PROTOCOL_VERSION,
  type MPConnection,
  type MPError,
  type MPResults,
  type MPRoom,
  type MPScoreboard,
} from './multiplayerProtocol'

export type {
  MPPlayer,
  MPResults,
  MPRoom,
  MPScoreboard,
  MPScoreState,
  RoomMode,
  RoomPhase,
} from './multiplayerProtocol'

/** Heartbeat. Tambem alimenta a estimativa de offset de relogio. */
const PING_INTERVAL_MS = 2000
/** Rajada inicial de pings: o offset precisa estar pronto antes do START_AT. */
const HANDSHAKE_PINGS = 5
const HANDSHAKE_SPACING_MS = 120
/** Backoff da reconexao. LAN por wifi cai e volta. */
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000]

export interface MultiplayerSession {
  room: MPRoom | null
  /** Codigo da sala em que estamos, para mostrar e compartilhar. */
  roomCode: string | null
  /** Placar agregado. Fica fora de `room` para o lobby nao re-renderizar. */
  scoreboard: MPScoreboard | null
  results: MPResults | null
  error: MPError | null
  connection: MPConnection
  /** Id que o host deu para este cliente. Nunca identificar por nome. */
  selfId: string | null
  /** Quantos ms faltam para o inicio, ja no relogio local. */
  msUntilStart: () => number | null
  startAt: number | null
  beginLoad: boolean
  clockReady: boolean
  rttMs: number
  self: () => MPRoom['players'][number] | null
  isHost: boolean
  setName: (name: string) => void
  setInstrument: (instrument: string) => void
  setDifficulty: (difficulty: string) => void
  setReady: (ready: boolean) => void
  setMode: (mode: string) => void
  selectSong: (songId: string, mode?: string) => void
  reportLoadProgress: (progress: number) => void
  reportScore: (state: Record<string, unknown>) => void
  reportFinished: (state: Record<string, unknown>) => void
  reportStarPower: (active: boolean) => void
  returnToLobby: () => void
  clearResults: () => void
}

/**
 * @param joinCode codigo da sala a entrar. Vazio/undefined = CRIAR sala nova e
 *                 receber o codigo do servidor.
 */
export function useMultiplayer(
  playerName: string,
  enabled: boolean,
  joinCode?: string,
): MultiplayerSession {
  const [room, setRoom] = useState<MPRoom | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [scoreboard, setScoreboard] = useState<MPScoreboard | null>(null)
  const [results, setResults] = useState<MPResults | null>(null)
  const [error, setError] = useState<MPError | null>(null)
  const [connection, setConnection] = useState<MPConnection>('idle')
  const [selfId, setSelfId] = useState<string | null>(null)
  const [startAt, setStartAt] = useState<number | null>(null)
  const [beginLoad, setBeginLoad] = useState(false)
  const [clockReady, setClockReady] = useState(false)
  const [rttMs, setRttMs] = useState(0)

  const ws = useRef<WebSocket | null>(null)
  const clock = useRef(new ClockSync())
  const closing = useRef(false)
  const attempt = useRef(0)
  // O nome vive num ref para que digitar nas configuracoes nao derrube o
  // socket: renomear e uma mensagem, nao uma reconexao.
  const nameRef = useRef(playerName)
  nameRef.current = playerName
  // O codigo tambem vive num ref: ele so importa no instante do JOIN, e
  // mudar o texto digitado nao deve derrubar a conexao.
  const joinCodeRef = useRef(joinCode)
  joinCodeRef.current = joinCode

  const send = useCallback((type: string, payload: unknown = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }))
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    send('SET_NAME', { name: playerName })
  }, [playerName, enabled, send])

  useEffect(() => {
    if (!enabled) {
      setRoom(null)
      setRoomCode(null)
      setScoreboard(null)
      setResults(null)
      setError(null)
      setSelfId(null)
      setStartAt(null)
      setBeginLoad(false)
      setClockReady(false)
      setConnection('idle')
      clock.current.reset()
      return
    }

    closing.current = false
    attempt.current = 0

    let socket: WebSocket | null = null
    let pingTimer: number | undefined
    let handshakeTimer: number | undefined
    let reconnectTimer: number | undefined

    const ping = () => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING', payload: { clientTime: Date.now() } }))
      }
    }

    const connect = () => {
      setConnection(attempt.current === 0 ? 'connecting' : 'reconnecting')
      socket = new WebSocket(matchSocketUrl())
      ws.current = socket

      socket.onopen = () => {
        if (closing.current) return
        attempt.current = 0
        setConnection('connected')
        setError(null)
        socket?.send(
          JSON.stringify({
            type: 'JOIN',
            payload: {
              name: nameRef.current,
              version: PROTOCOL_VERSION,
              // Sem codigo o servidor cria a sala e devolve o codigo no WELCOME.
              roomCode: joinCodeRef.current || undefined,
            },
          }),
        )
        // Rajada de pings antes de qualquer coisa acontecer: o START_AT pode
        // chegar poucos segundos depois de entrar, e sem offset estimado a
        // conversao do timestamp do host nao vale nada.
        let sent = 0
        ping()
        handshakeTimer = window.setInterval(() => {
          sent += 1
          if (sent >= HANDSHAKE_PINGS) window.clearInterval(handshakeTimer)
          ping()
        }, HANDSHAKE_SPACING_MS)
        pingTimer = window.setInterval(ping, PING_INTERVAL_MS)
      }

      socket.onmessage = (event) => {
        let message: { type?: string; payload?: any }
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }
        const payload = message.payload ?? {}

        switch (message.type) {
          case 'WELCOME':
            setSelfId(payload.playerId ?? null)
            setRoomCode(payload.roomCode ?? null)
            // Reconexao volta para a MESMA sala, e nao para uma nova.
            joinCodeRef.current = payload.roomCode ?? joinCodeRef.current
            break
          case 'ROOM_STATE':
            setRoom(payload as MPRoom)
            if (payload.phase === 'lobby') {
              setBeginLoad(false)
              setStartAt(null)
            }
            break
          case 'BEGIN_LOAD':
            setBeginLoad(true)
            setResults(null)
            break
          case 'START_AT':
            setStartAt(payload.startAt ?? null)
            break
          case 'SCOREBOARD':
            setScoreboard(payload as MPScoreboard)
            break
          case 'RESULTS':
            setResults(payload as MPResults)
            break
          case 'STAR_POWER':
            setScoreboard((current) => {
              if (!current) return current
              return {
                ...current,
                players: current.players.map((p) =>
                  p.id === payload.playerId ? { ...p, starPowerActive: !!payload.active } : p,
                ),
              }
            })
            break
          case 'PONG': {
            clock.current.addSample(payload.clientTime ?? 0, payload.serverTime ?? 0, Date.now())
            setClockReady(clock.current.ready)
            setRttMs(Math.round(clock.current.rttMs))
            break
          }
          case 'ERROR': {
            const code = String(payload.code ?? 'UNKNOWN')
            const fatal = FATAL_ERRORS.includes(code)
            setError({ code, message: String(payload.message ?? 'Erro desconhecido.'), fatal })
            // Versao incompativel ou sala cheia: insistir nao resolve.
            if (fatal) closing.current = true
            break
          }
          default:
            break
        }
      }

      socket.onclose = () => {
        window.clearInterval(pingTimer)
        window.clearInterval(handshakeTimer)
        if (closing.current) return

        setSelfId(null)
        clock.current.reset()
        setClockReady(false)

        const delay = RECONNECT_DELAYS_MS[attempt.current]
        if (delay === undefined) {
          setConnection('failed')
          setError((current) =>
            current ?? {
              code: 'HOST_GONE',
              message: 'O host saiu do ar. A partida acabou.',
              fatal: true,
            },
          )
          return
        }
        attempt.current += 1
        setConnection('reconnecting')
        reconnectTimer = window.setTimeout(connect, delay)
      }

      // onerror sempre vem seguido de onclose; o backoff fica num lugar so.
      socket.onerror = () => {}
    }

    connect()

    return () => {
      closing.current = true
      window.clearInterval(pingTimer)
      window.clearInterval(handshakeTimer)
      window.clearTimeout(reconnectTimer)
      socket?.close()
      ws.current = null
    }
    // playerName de proposito fora das deps: renomear nao reconecta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const self = useCallback(
    () => room?.players.find((p) => p.id === selfId) ?? null,
    [room, selfId],
  )

  const msUntilStart = useCallback(() => {
    if (startAt == null) return null
    return clock.current.msUntil(startAt)
  }, [startAt])

  const isHost = Boolean(selfId && room?.hostId === selfId)

  // Cada acao tem identidade ESTAVEL (depende so de `send`, que nunca muda).
  //
  // Isto nao e microtuning: o objeto devolvido por este hook e recriado a cada
  // atualizacao de placar (10 Hz). Se as acoes fossem arrow functions inline,
  // todo efeito que dependesse de uma delas re-rodaria 10 vezes por segundo -
  // foi assim que a musica tocou o som de inicio em loop e que o ScoreReporter
  // era recriado o tempo todo, zerando o proprio throttle.
  const setName = useCallback((name: string) => send('SET_NAME', { name }), [send])
  const setInstrument = useCallback(
    (instrument: string) => send('SET_INSTRUMENT', { instrument }),
    [send],
  )
  const setDifficulty = useCallback(
    (difficulty: string) => send('SET_DIFFICULTY', { difficulty }),
    [send],
  )
  const setReady = useCallback((ready: boolean) => send('SET_READY', { ready }), [send])
  const setMode = useCallback((mode: string) => send('SET_MODE', { mode }), [send])
  const selectSong = useCallback(
    (songId: string, mode?: string) => send('SELECT_SONG', { songId, mode }),
    [send],
  )
  const reportLoadProgress = useCallback(
    (progress: number) => send('LOAD_PROGRESS', { progress }),
    [send],
  )
  const reportScore = useCallback(
    (state: Record<string, unknown>) => send('SCORE_UPDATE', state),
    [send],
  )
  const reportFinished = useCallback(
    (state: Record<string, unknown>) => send('FINISHED', state),
    [send],
  )
  const reportStarPower = useCallback(
    (active: boolean) => send('STAR_POWER', { active }),
    [send],
  )
  const returnToLobby = useCallback(() => send('RETURN_TO_LOBBY'), [send])
  const clearResults = useCallback(() => setResults(null), [])

  return useMemo<MultiplayerSession>(
    () => ({
      room,
      roomCode,
      scoreboard,
      results,
      error,
      connection,
      selfId,
      startAt,
      beginLoad,
      clockReady,
      rttMs,
      msUntilStart,
      self,
      isHost,
      setName,
      setInstrument,
      setDifficulty,
      setReady,
      setMode,
      selectSong,
      reportLoadProgress,
      reportScore,
      reportFinished,
      reportStarPower,
      returnToLobby,
      clearResults,
    }),
    [
      room,
      roomCode,
      scoreboard,
      results,
      error,
      connection,
      selfId,
      startAt,
      beginLoad,
      clockReady,
      rttMs,
      msUntilStart,
      self,
      isHost,
      setName,
      setInstrument,
      setDifficulty,
      setReady,
      setMode,
      selectSong,
      reportLoadProgress,
      reportScore,
      reportFinished,
      reportStarPower,
      returnToLobby,
      clearResults,
    ],
  )
}
