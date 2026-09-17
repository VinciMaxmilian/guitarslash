import { useEffect, useState } from 'react'

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

type Screen = 'menu' | 'settings' | 'songs' | 'instrument' | 'difficulty' | 'game' | 'result' | 'lobby'

export function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [song, setSong] = useState<SongSummary | null>(null)
  const [instrument, setInstrument] = useState<string | null>(null)
  const [mpContext, setMpContext] = useState<any | null>(null)
  const [selection, setSelection] = useState<{
    song: SongSummary
    instrument: string
    difficulty: string
  } | null>(null)

  const [results, setResults] = useState<{ players: PlayerSnapshot[]; chart: Chart } | null>(null)

  useBackgroundMusic(screen)

  // Pre-fetch para manter o cache quente.
  useEffect(() => {
    void api.library()
  }, [])

  const onMultiplayerStart = async (songId: string, inst: string, diff: string, context: any) => {
    const s = await api.song(songId)
    setSelection({ song: s, instrument: inst, difficulty: diff })
    setMpContext(context)
    setScreen('game')
  }

  return (
    <>
      {screen === 'menu' && (
        <MainMenu 
          onPlay={() => { setMpContext(null); setScreen('songs') }} 
          onSettings={() => setScreen('settings')} 
          onMultiplayer={() => setScreen('lobby')}
        />
      )}

      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('menu')} />}

      {screen === 'lobby' && (
        <Lobby
          onBack={() => setScreen('menu')}
          onPickSong={() => setScreen('songs')}
          pickedSongId={song?.id}
          onStart={onMultiplayerStart}
        />
      )}

      {screen === 'songs' && (
        <SongSelect
          onBack={() => setScreen(mpContext ? 'lobby' : 'menu')}
          onSelect={(selected) => {
            setSong(selected)
            if (mpContext) {
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
          multiplayerContext={mpContext}
          onExit={() => setScreen(mpContext ? 'lobby' : 'songs')}
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
            setScreen(mpContext ? 'lobby' : 'songs')
          }}
        />
      )}
    </>
  )
}
