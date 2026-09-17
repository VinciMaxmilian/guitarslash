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
import { IS_HOST_MODE } from './game/hostMode'

type Screen = 'menu' | 'settings' | 'songs' | 'instrument' | 'difficulty' | 'game' | 'result' | 'lobby'

export function App() {
  const settings = useSettings()
  const [screen, setScreen] = useState<Screen>('menu')
  const [song, setSong] = useState<SongSummary | null>(null)
  const [instrument, setInstrument] = useState<string | null>(null)
  const [multiplayer, setMultiplayer] = useState(false)
  const [selection, setSelection] = useState<{
    song: SongSummary
    instrument: string
    difficulty: string
  } | null>(null)

  const [results, setResults] = useState<{ players: PlayerSnapshot[]; chart: Chart } | null>(null)
  const mp = useMultiplayer(settings.profileName || 'Player', multiplayer)
  //: Evita entrar duas vezes na mesma partida quando o BEGIN_LOAD se repete.
  const loadedFor = useRef<string | null>(null)

  useBackgroundMusic(screen)

  useEffect(() => {
    void api.library()
  }, [])

  const enterGame = useCallback(async (songId: string, inst: string, diff: string) => {
    const s = await api.song(songId)
    setSelection({ song: s, instrument: inst, difficulty: diff })
    setScreen('game')
  }, [])

  // BEGIN_LOAD do host: todo mundo esta pronto, entra na tela de jogo.
  useEffect(() => {
    if (!multiplayer || !mp.beginLoad) return
    const songId = mp.room?.songId
    const me = mp.self()
    if (!songId || !me?.instrument || !me.difficulty || me.spectator) return

    // A chave inclui a musica: uma segunda partida com a mesma escolha ainda
    // entra, e um BEGIN_LOAD repetido da mesma partida nao.
    const key = `${songId}:${me.instrument}:${me.difficulty}`
    if (loadedFor.current === key) return
    loadedFor.current = key
    void enterGame(songId, me.instrument, me.difficulty)
  }, [multiplayer, mp.beginLoad, mp.room, mp.self, enterGame])

  // Voltou para o lobby (host clicou em NOVA PARTIDA ou trocou a musica):
  // libera a trava para a proxima partida.
  useEffect(() => {
    if (mp.room?.phase === 'lobby') loadedFor.current = null
  }, [mp.room?.phase])

  // O host saiu do ar no meio do jogo: nao deixa a tela quebrada.
  useEffect(() => {
    if (!multiplayer || mp.connection !== 'failed') return
    if (screen === 'game') setScreen('lobby')
  }, [multiplayer, mp.connection, screen])

  const leaveMultiplayer = useCallback(() => {
    loadedFor.current = null
    setMultiplayer(false)
    setResults(null)
    setScreen('menu')
  }, [])

  const backFromGame = useCallback(() => {
    loadedFor.current = null
    setScreen(multiplayer ? 'lobby' : 'songs')
  }, [multiplayer])

  return (
    <>
      {screen === 'menu' && (
        <MainMenu
          multiplayerAvailable={IS_HOST_MODE}
          onPlay={() => {
            setMultiplayer(false)
            loadedFor.current = null
            setScreen('songs')
          }}
          onSettings={() => setScreen('settings')}
          onMultiplayer={() => {
            loadedFor.current = null
            setMultiplayer(true)
            setScreen('lobby')
          }}
        />
      )}

      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('menu')} />}

      {screen === 'lobby' && (
        <Lobby
          mp={mp}
          onBack={leaveMultiplayer}
          onPickSong={() => setScreen('songs')}
          pickedSongId={song?.id}
        />
      )}

      {screen === 'songs' && (
        <SongSelect
          onBack={() => setScreen(multiplayer ? 'lobby' : 'menu')}
          onSelect={(selected) => {
            setSong(selected)
            if (multiplayer) {
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
          mp={multiplayer ? mp : undefined}
          onExit={backFromGame}
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
          mp={multiplayer ? mp : undefined}
          onRetry={
            multiplayer
              ? undefined
              : () => {
                  setResults(null)
                  setScreen('game')
                }
          }
          onSongSelect={() => {
            setResults(null)
            loadedFor.current = null
            setScreen(multiplayer ? 'lobby' : 'songs')
          }}
        />
      )}
    </>
  )
}
