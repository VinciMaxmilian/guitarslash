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
import { TitleScreen } from './pages/TitleScreen'
import { AuthScreen } from './pages/AuthScreen'
import { UploadSong } from './pages/UploadSong'
import { TrainingSetup } from './pages/TrainingSetup'
import type { TrainingOptions } from './game/GameEngine'
import { useAuth } from './auth/useAuth'
import { submitScore } from './lib/scores'
import { useSettingsSync } from './settings/useSettingsSync'
import { Leaderboard } from './pages/Leaderboard'
import { Lobby } from './pages/Lobby'
import { MultiplayerStart } from './pages/MultiplayerStart'
import type { PlayerSnapshot, Chart } from './game/types'
import { fetchCommunitySong } from './community/communitySongs'
import { useBackgroundMusic } from './hooks/useBackgroundMusic'
import { useSettings } from './hooks/useSettings'
import { settingsStore } from './settings/SettingsStore'
import { useMultiplayer } from './game/useMultiplayer'
import { MULTIPLAYER_AVAILABLE } from './game/hostMode'

type Screen =
  | 'title'
  | 'menu'
  | 'settings'
  | 'songs'
  | 'instrument'
  | 'difficulty'
  | 'game'
  | 'result'
  | 'mp-start'
  | 'lobby'
  | 'auth'
  | 'upload'
  | 'training'
  | 'leaderboard'

export function App() {
  const settings = useSettings()
  const auth = useAuth()
  const [screen, setScreen] = useState<Screen>('title')
  const [song, setSong] = useState<SongSummary | null>(null)
  const [instrument, setInstrument] = useState<string | null>(null)
  const [multiplayer, setMultiplayer] = useState(false)
  //: undefined = criar sala nova; string = entrar na sala com esse codigo.
  const [joinCode, setJoinCode] = useState<string | undefined>(undefined)
  //: Treino: mesma gameplay, com trecho em loop e velocidade reduzida.
  const [training, setTraining] = useState(false)
  const [trainingOptions, setTrainingOptions] = useState<TrainingOptions | null>(null)
  const [selection, setSelection] = useState<{
    song: SongSummary
    instrument: string
    difficulty: string
  } | null>(null)

  const [results, setResults] = useState<{ players: PlayerSnapshot[]; chart: Chart } | null>(null)
  const mp = useMultiplayer(settings.profileName || 'Player', multiplayer, joinCode)
  //: Evita entrar duas vezes na mesma partida quando o BEGIN_LOAD se repete.
  const loadedFor = useRef<string | null>(null)
  //: Falha ao resolver a musica do host, mostrada no lobby.
  const [loadError, setLoadError] = useState<string | null>(null)

  useSettingsSync(auth.session)
  useBackgroundMusic(screen)

  useEffect(() => {
    void api.library()
  }, [])

  /**
   * Conta conectada manda no nome.
   *
   * Sem isto o jogador tem DOIS nomes: o `profileName` deste navegador, que
   * aparece no lobby, e o `display_name` da conta, que aparece no ranking -
   * e nenhuma pista de qual vale onde. O da conta ganha porque e o unico que
   * acompanha o jogador para outro aparelho.
   *
   * Nao mexe enquanto a tela de configuracoes esta aberta: seria uma
   * alteracao que o jogador nao fez aparecendo como rascunho dele.
   */
  useEffect(() => {
    const nome = auth.displayName
    if (!nome || settingsStore.editing) return
    if (settingsStore.get().profileName === nome) return
    settingsStore.update({ profileName: nome })
  }, [auth.displayName])

  /**
   * Resolve o ID que a sala trafega para a musica inteira.
   *
   * A biblioteca local e a da comunidade sao DOIS acervos: `/api/songs/<id>`
   * so conhece a pasta `songs/` da maquina, e uma musica da comunidade tem o
   * slug do Supabase como ID. Tentar so o backend deixava qualquer partida
   * com musica da comunidade travada no "baixando a musica do host".
   */
  const resolveSong = useCallback(async (songId: string): Promise<SongSummary> => {
    try {
      return await api.song(songId)
    } catch (err) {
      const daComunidade = await fetchCommunitySong(songId)
      if (daComunidade) return daComunidade
      throw err
    }
  }, [])

  const enterGame = useCallback(
    async (songId: string, inst: string, diff: string) => {
      const s = await resolveSong(songId)
      setSelection({ song: s, instrument: inst, difficulty: diff })
      setScreen('game')
    },
    [resolveSong],
  )

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
    setLoadError(null)
    // A falha PRECISA soltar a trava e aparecer na tela. Sem isto, qualquer
    // erro ao resolver a musica virava uma promise rejeitada em silencio: o
    // jogador ficava para sempre no "baixando a musica do host", sem mensagem
    // e sem nova tentativa, porque `loadedFor` ja estava marcado.
    void enterGame(songId, me.instrument, me.difficulty).catch((err) => {
      loadedFor.current = null
      setLoadError(err instanceof Error ? err.message : String(err))
    })
  }, [multiplayer, mp.beginLoad, mp.room, mp.self, enterGame])

  // Voltou para o lobby (host clicou em NOVA PARTIDA ou trocou a musica):
  // libera a trava para a proxima partida.
  //
  // Este e o UNICO lugar que libera a trava dentro de uma sessao multiplayer.
  // Liberar ao sair da partida (que era o que `backFromGame` e a tela de
  // resultado faziam) reabria a entrada automatica enquanto a sala ainda
  // estava em `loading`/`playing` com o `beginLoad` de pe: o proximo
  // ROOM_STATE - e eles chegam a todo momento - jogava o jogador de volta
  // para dentro da musica que ele acabara de sair.
  useEffect(() => {
    if (mp.room?.phase !== 'lobby') return
    loadedFor.current = null
    setLoadError(null)
  }, [mp.room?.phase])

  // O host saiu do ar no meio do jogo: nao deixa a tela quebrada.
  useEffect(() => {
    if (!multiplayer || mp.connection !== 'failed') return
    if (screen === 'game') setScreen('lobby')
  }, [multiplayer, mp.connection, screen])

  const leaveMultiplayer = useCallback(() => {
    loadedFor.current = null
    setMultiplayer(false)
    setJoinCode(undefined)
    setResults(null)
    setScreen('menu')
  }, [])

  const abrirLobby = useCallback((code?: string) => {
    loadedFor.current = null
    setLoadError(null)
    setJoinCode(code)
    setMultiplayer(true)
    setScreen('lobby')
  }, [])

  const backFromGame = useCallback(() => {
    // Solo pode liberar a trava: ela so existe para o multiplayer.
    if (!multiplayer) loadedFor.current = null
    setScreen(multiplayer ? 'lobby' : 'songs')
  }, [multiplayer])

  return (
    <>
      {screen === 'title' && <TitleScreen onStart={() => setScreen('menu')} />}

      {screen === 'menu' && (
        <MainMenu
          multiplayerAvailable={MULTIPLAYER_AVAILABLE}
          onPlay={() => {
            setMultiplayer(false)
            setTraining(false)
            loadedFor.current = null
            setScreen('songs')
          }}
          onSettings={() => setScreen('settings')}
          onAccount={() => setScreen('auth')}
          accountAvailable={auth.enabled}
          accountName={auth.displayName}
          onTraining={() => {
            setMultiplayer(false)
            setTraining(true)
            loadedFor.current = null
            setScreen('songs')
          }}
          onLeaderboard={() => setScreen('leaderboard')}
          onMultiplayer={() => setScreen('mp-start')}
        />
      )}

      {screen === 'leaderboard' && (
        <Leaderboard
          userId={auth.session?.user?.id ?? null}
          onBack={() => setScreen('menu')}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen auth={auth} onBack={() => setScreen('menu')} />
      )}

      {screen === 'auth' && <AuthScreen auth={auth} onBack={() => setScreen('menu')} />}

      {screen === 'mp-start' && (
        <MultiplayerStart
          onCreate={() => abrirLobby(undefined)}
          onJoin={(code) => abrirLobby(code)}
          onBack={() => setScreen('menu')}
        />
      )}

      {screen === 'lobby' && (
        <Lobby
          mp={mp}
          onBack={leaveMultiplayer}
          onPickSong={() => setScreen('songs')}
          pickedSongId={song?.id}
          loadError={loadError}
        />
      )}

      {screen === 'upload' && auth.session && (
        <UploadSong
          userId={auth.session.user.id}
          onBack={() => setScreen('songs')}
          onDone={() => setScreen('songs')}
        />
      )}

      {screen === 'songs' && (
        <SongSelect
          // Enviar exige conta: sem isso nao ha a quem responsabilizar pelo
          // conteudo, e a policy do Storage tambem recusaria.
          onUpload={auth.session ? () => setScreen('upload') : undefined}
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
            setScreen(training ? 'training' : 'game')
          }}
        />
      )}

      {screen === 'training' && selection && (
        <TrainingSetup
          song={selection.song}
          instrument={selection.instrument}
          difficulty={selection.difficulty}
          onBack={() => setScreen('difficulty')}
          onStart={(opcoes) => {
            setTrainingOptions(opcoes)
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
          training={training ? (trainingOptions ?? undefined) : undefined}
          onExit={training ? () => setScreen('training') : backFromGame}
          onFinish={(players, chart) => {
            setResults({ players, chart })
            setScreen('result')
            // Placar so vai para a nuvem em partida solo e com conta. Falha no
            // envio nao interfere na tela de resultado.
            const eu = players[0]
            const userId = auth.session?.user?.id
            if (eu && userId && !multiplayer && !training) {
              void submitScore(userId, {
                songId: selection.song.id,
                instrument: selection.instrument,
                difficulty: selection.difficulty,
              }, eu)
            }
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
          userId={auth.session?.user?.id ?? null}
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
            if (!multiplayer) loadedFor.current = null
            setScreen(multiplayer ? 'lobby' : 'songs')
          }}
        />
      )}
    </>
  )
}
