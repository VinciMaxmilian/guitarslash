import { useEffect, useState, useRef } from 'react'

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

export function useMultiplayer(playerName: string) {
  const [room, setRoom] = useState<MPRoom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startAt, setStartAt] = useState<number | null>(null)
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Protocol requires absolute URL for WS based on the HTTP origin
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
        } else if (msg.type === 'START_AT') {
          setStartAt(msg.payload.timestamp)
        } else if (msg.type === 'ERROR') {
          setError(msg.payload.message)
        } else if (msg.type === 'PONG') {
          // latency check can be implemented here
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
      setError('Connection to host lost.')
    }

    socket.onclose = () => {
      setError('Disconnected.')
    }

    // Keepalive ping
    const ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING', payload: { clientTime: Date.now() } }))
      }
    }, 2000)

    return () => {
      clearInterval(ping)
      socket.close()
    }
  }, [playerName])

  const send = (type: string, payload: any = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }))
    }
  }

  return {
    room,
    error,
    startAt,
    setInstrument: (instrument: string) => send('SET_INSTRUMENT', { instrument }),
    setDifficulty: (difficulty: string) => send('SET_DIFFICULTY', { difficulty }),
    setReady: (ready: boolean) => send('SET_READY', { ready }),
    selectSong: (songId: string, mode: string) => send('SELECT_SONG', { songId, mode }),
    reportLoadProgress: (progress: number) => send('LOAD_PROGRESS', { progress }),
    reportScore: (state: any) => send('SCORE_UPDATE', state)
  }
}
