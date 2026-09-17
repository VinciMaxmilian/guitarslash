import { useState } from 'react'

import type { SongSummary } from './api/types'
import { Stage } from './components/Stage'
import type { Chart, PlayerSnapshot } from './game/types'
import { DifficultySelect } from './pages/DifficultySelect'
import { Gameplay } from './pages/Gameplay'
import { InstrumentSelect } from './pages/InstrumentSelect'
import { MainMenu } from './pages/MainMenu'
import { Result } from './pages/Result'
import { SettingsScreen } from './pages/SettingsScreen'
import { SongSelect } from './pages/SongSelect'

type Screen = 'menu' | 'songs' | 'instrument' | 'difficulty' | 'game' | 'result' | 'settings'

interface Selection {
  song: SongSummary
  instrument: string
  difficulty: string
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [song, setSong] = useState<SongSummary | null>(null)
  const [instrument, setInstrument] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [results, setResults] = useState<{ players: PlayerSnapshot[]; chart: Chart } | null>(null)

  // A gameplay tem fundo proprio (video + highway) e nao usa o palco dos menus.
  if (screen === 'game' && selection) {
    return (
      <Gameplay
        song={selection.song}
        instrument={selection.instrument}
        difficulty={selection.difficulty}
        onExit={() => setScreen('songs')}
        onFinish={(players, chart) => {
          setResults({ players, chart })
          setScreen('result')
        }}
      />
    )
  }

  return (
    <Stage>
      {screen === 'menu' && (
        <MainMenu onPlay={() => setScreen('songs')} onSettings={() => setScreen('settings')} />
      )}

      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('menu')} />}

      {screen === 'songs' && (
        <SongSelect
          onBack={() => setScreen('menu')}
          onSelect={(selected) => {
            setSong(selected)
            setInstrument(null)
            setScreen('instrument')
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
            setScreen('songs')
          }}
        />
      )}
    </Stage>
  )
}
