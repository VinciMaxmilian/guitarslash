import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from './api/client'
import type { SongSummary } from './api/types'
import { DifficultySelect } from './pages/DifficultySelect'
import { Gameplay } from './pages/Gameplay'
import { InstrumentSelect } from './pages/InstrumentSelect'
import { MainMenu } from './pages/MainMenu'
import { Result } from './pages/Result'
import { SettingsScreen } from './pages/SettingsScreen'
import { SongSelect } from './pages/SongSelect'
import { Lobby } from './pages/Lobby'
import type { PlayerSnapshot, Chart } from './game/types'
import { useBackgroundMusic } from './hooks/useBackgroundMusic'
import { useSettings } from './hooks/useSettings'
import { useMultiplayer } from './game/useMultiplayer'

type Screen = 'menu' | 'settings' | 'songs' | 'instrument' | 'difficulty' | 'game' | 'result' | 'lobby'

export function App() {
  const settings = useSettings()
  const [screen, setScreen] = useState<Screen>('menu')
  const [song, setSong] = useState<SongSummary | null>(null)
  const [instrument, setInstrument] = useState<string | null>(null)
  const [lobbyPick, setLobbyPick] = useState(false)
  const [selection, setSelection] = useState<{
    song: SongSummary
    instrument: string
    difficulty: string
  } | null>(null)

  const [results, setResults] = useState<{ players: PlayerSnapshot[]; chart: Chart } | null>(null)
  const mp = useMultiplayer(settings.profileName || 'Player', lobbyPick)
  const startedRef = useRef(false)

  useBackgroundMusic(screen)

  useEffect(() => {
    void api.library()
  }, [])

  const enterGame = useCallback(async (songId: string, inst: string, diff: string) => {
    const s = await api.song(songId)
    setSelection({ song: s, instrument: inst, difficulty: diff })
    setScreen('game')
  }, [])

  useEffect(() => {
    if (!lobbyPick || !mp.beginLoad || !mp.room?.songId) return
    if (startedRef.current) return
    const me = mp.room.players.find(p => p.name === (settings.profileName || 'Player'))
    if (!me?.instrument || !me?.difficulty) return
    startedRef.current = true
    void enterGame(mp.room.songId, me.instrument, me.difficulty)
  }, [lobbyPick, mp.beginLoad, mp.room, enterGame, settings.profileName])

  const leaveLobby = () => {
    startedRef.current = false
    setLobbyPick(false)
    setScreen('menu')
  }

  return (
    <>
      {screen === 'menu' && (
        <MainMenu
          onPlay={() => { setLobbyPick(false); startedRef.current = false; setScreen('songs') }}
          onSettings={() => setScreen('settings')}
          onMultiplayer={() => { startedRef.current = false; setLobbyPick(true); setScreen('lobby') }}
        />
      )}

      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('menu')} />}

      {screen === 'lobby' && (
        <Lobby
          mp={mp}
          onBack={leaveLobby}
          onPickSong={() => setScreen('songs')}
          pickedSongId={song?.id}
        />
      )}

      {screen === 'songs' && (
        <SongSelect
          onBack={() => setScreen(lobbyPick ? 'lobby' : 'menu')}
          onSelect={(selected) => {
            setSong(selected)
            if (lobbyPick) {
              setScreen('lobby')
            } else {
              setInstrument(null)
              setScreen('instrument')
            }
          }}
        />
      )}

      {screen === 'instrument' && song && (
        <InstrumentSelect
          song={song}
          onBack={() => setScreen('songs')}
          onSelect={(chosen) => {
            setInstrument(chosen)
            setScreen('difficulty')
          }}
        />
      )}

      {screen === 'difficulty' && song && instrument && (
        <DifficultySelect
          song={song}
          instrument={instrument}
          onBack={() => setScreen('instrument')}
          onSelect={(difficulty) => {
            setSelection({ song, instrument, difficulty })
            setScreen('game')
          }}
        />
      )}

      {screen === 'game' && selection && (
        <Gameplay
          song={selection.song}
          instrument={selection.instrument}
          difficulty={selection.difficulty}
          multiplayerContext={lobbyPick ? mp : undefined}
          onExit={() => setScreen(lobbyPick ? 'lobby' : 'songs')}
          onFinish={(players, chart) => {
            setResults({ players, chart })
            setScreen('result')
          }}
        />
      )}

      {screen === 'result' && selection && results && (
        <Result
          song={selection.song}
          instrument={selection.instrument}
          difficulty={selection.difficulty}
          players={results.players}
          totalNotes={results.chart.noteCount}
          onRetry={() => {
            setResults(null)
            setScreen('game')
          }}
          onSongSelect={() => {
            setResults(null)
            startedRef.current = false
            setScreen(lobbyPick ? 'lobby' : 'songs')
          }}
        />
      )}
    </>
  )
}
