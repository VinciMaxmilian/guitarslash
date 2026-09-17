import { useCallback, useEffect, useState, useRef } from 'react'

export interface MPPlayer {
  id: number
  name: string
  instrument: string | null
  difficulty: string | null
  ready: boolean
  loadProgress: number
  scoreState: any
}

export interface MPRoom {
  mode: string
  songId: string | null
  players: MPPlayer[]
}

export function useMultiplayer(playerName: string, enabled: boolean) {
  const [room, setRoom] = useState<MPRoom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startAt, setStartAt] = useState<number | null>(null)
  const [beginLoad, setBeginLoad] = useState(false)
  const ws = useRef<WebSocket | null>(null)
  const closing = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setRoom(null)
      setError(null)
      setStartAt(null)
      setBeginLoad(false)
      return
    }

    closing.current = false
    const host = window.location.host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${host}/ws`

    const socket = new WebSocket(url)
    ws.current = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'JOIN', payload: { name: playerName, version: '1' } }))
    }

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'ROOM_STATE') {
          setRoom(msg.payload)
        } else if (msg.type === 'BEGIN_LOAD') {
          setBeginLoad(true)
        } else if (msg.type === 'START_AT') {
          setStartAt(msg.payload.timestamp)
        } else if (msg.type === 'ERROR') {
          setError(msg.payload.message)
        } else if (msg.type === 'SCOREBOARD') {
          setRoom((r) => {
            if (!r) return r
            return {
              ...r,
              players: r.players.map(p => p.id === msg.payload.playerId ? { ...p, scoreState: msg.payload.state } : p)
            }
          })
        }
      } catch (err) {
        console.error(err)
      }
    }

    socket.onerror = () => {
      if (!closing.current) setError('Connection to host lost.')
    }

    socket.onclose = () => {
      if (!closing.current) setError('Disconnected.')
    }

    const ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING', payload: { clientTime: Date.now() } }))
      }
    }, 2000)

    return () => {
      closing.current = true
      clearInterval(ping)
      socket.close()
      ws.current = null
    }
  }, [playerName, enabled])

  const send = useCallback((type: string, payload: any = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }))
    }
  }, [])

  return {
    room,
    error,
    startAt,
    beginLoad,
    setInstrument: useCallback((instrument: string) => send('SET_INSTRUMENT', { instrument }), [send]),
    setDifficulty: useCallback((difficulty: string) => send('SET_DIFFICULTY', { difficulty }), [send]),
    setReady: useCallback((ready: boolean) => send('SET_READY', { ready }), [send]),
    selectSong: useCallback((songId: string, mode: string) => send('SELECT_SONG', { songId, mode }), [send]),
    reportLoadProgress: useCallback((progress: number) => send('LOAD_PROGRESS', { progress }), [send]),
    reportScore: useCallback((state: any) => send('SCORE_UPDATE', state), [send]),
  }
}

export type MultiplayerSession = ReturnType<typeof useMultiplayer>
