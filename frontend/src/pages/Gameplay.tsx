import { useEffect, useMemo, useRef, useState } from 'react'

import { api, resolveAssetUrl } from '../api/client'
import { DIFFICULTY_LABELS, INSTRUMENT_LABELS, type SongSummary } from '../api/types'
import { GameEngine, type TrainingOptions } from '../game/GameEngine'
import { ScoreReporter } from '../game/ScoreReporter'
import { OpponentHighways } from '../components/OpponentHighways'
import { RockMeter, ScorePanel } from '../components/ScorePanel'
import { LoadingScreen } from '../components/LoadingScreen'
import { TouchControls } from '../components/TouchControls'
import { hasTouch } from '../game/touchLanes'
import { judgementCode } from '../game/multiplayerProtocol'
import type { MultiplayerSession } from '../game/useMultiplayer'
import type { MPScoreboardRow } from '../game/multiplayerProtocol'
import type { Chart, EngineSnapshot, PlayerSnapshot } from '../game/types'
import { useSettings } from '../hooks/useSettings'
import { formatNumber, formatPercent, formatTime } from '../utils/format'
import { useUISounds } from '../hooks/useUISounds'

interface Props {
  song: SongSummary
  instrument: string
  difficulty: string
  /** Presente apenas em partida LAN. */
  mp?: MultiplayerSession
  /** Presente apenas no modo treino: trecho em loop e velocidade. */
  training?: TrainingOptions
  onExit: () => void
  onFinish: (results: PlayerSnapshot[], chart: Chart) => void
}

export function Gameplay({
  song,
  instrument,
  difficulty,
  mp,
  training,
  onExit,
  onFinish,
}: Props) {
  const settings = useSettings()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const chartRef = useRef<Chart | null>(null)
  const uiSounds = useUISounds()
  // O snapshot muda a cada frame; o ScoreReporter corta isso para ~10 Hz e
  // manda so o que mudou. O julgamento das notas nunca depende da rede.
  const reporter = useRef<ScoreReporter | null>(null)
  //: A partida comeca e termina UMA vez; ambas as travas sao liberadas ao
  //: montar uma partida nova (efeito de boot abaixo).
  const startedRef = useRef(false)
  const finishedRef = useRef(false)

  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // Monta a engine uma vez por combinacao musica/instrumento/dificuldade.
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    startedRef.current = false
    finishedRef.current = false

    const boot = async () => {
      try {
        const chart = await api.chartFor(song, instrument, difficulty)
        if (cancelled) return
        chartRef.current = chart

        // Todos os stems entram na mixagem: `song` costuma ser a base SEM o
        // instrumento que o jogador escolheu.
        const audio: Record<string, string> = {}
        for (const [stem, url] of Object.entries(song.assets.audio ?? {})) {
          const resolved = resolveAssetUrl(url)
          if (resolved) audio[stem] = resolved
        }
        if (Object.keys(audio).length === 0) {
          throw new Error('Esta música não tem arquivo de áudio.')
        }

        const engine = new GameEngine({
          canvas,
          video: videoRef.current,
          chart,
          audio,
          onLoadProgress: (done, total) => setProgress({ done, total }),
          videoUrl: resolveAssetUrl(song.assets.backgroundVideo),
          settings,
          songDelay: song.delay,
          training,
          onSnapshot: setSnapshot,
          onFinish: (players) => onFinish(players, chart),
          // Frase de star power fechada: o raio e desenhado pela engine, o som
          // sai daqui porque e o mesmo banco de sons da interface.
          onStarPowerPhrase: () => uiSounds.play('start2'),
          // Cada nota resolvida entra na fila; sai junto do placar a 10 Hz.
          onHit: (event) =>
            reporter.current?.queueHit([
              Math.round(event.time * 1000),
              event.lane,
              judgementCode(event.judgement),
            ]),
        })
        engineRef.current = engine

        await engine.load()
        if (cancelled) {
          engine.destroy()
          return
        }

        setReady(true)
        if (mp) {
          mp.reportLoadProgress(1)
        }
        if (engine.needsUserGesture) {
          setNeedsGesture(true)
        } else if (!mp) {
          uiSounds.play('start1')
          uiSounds.play('start2')
          engine.start()
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    void boot()

    return () => {
      cancelled = true
      engineRef.current?.destroy()
      engineRef.current = null
    }
    // settings entra so na montagem; mudancas sao aplicadas pelo efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `training` entra nas deps: trocar trecho ou velocidade precisa remontar
    // a engine, senao o loop continuaria no trecho antigo.
  }, [song.id, instrument, difficulty, training, uiSounds])

  // Configuracoes alteradas em tempo real chegam na engine sem remontar nada.
  useEffect(() => {
    engineRef.current?.applySettings(settings)
  }, [settings])

  // Estes efeitos dependem de PEDACOS de `mp`, nunca do objeto inteiro: `mp` e
  // recriado a cada atualizacao de placar (10 Hz), e um efeito que dependesse
  // dele re-rodaria 10 vezes por segundo.
  const msUntilStart = mp?.msUntilStart
  const reportScore = mp?.reportScore
  const reportFinished = mp?.reportFinished
  const startAt = mp?.startAt ?? null

  // START_AT vem no relogio do HOST. `msUntilStart` aplica o offset medido
  // pelo ClockSync; comparar o timestamp cru com Date.now() faria a musica
  // comecar no ato (ou nunca), porque as maquinas nao tem a hora igual.
  //
  // A trava `startedRef` existe porque, passado o horario de inicio,
  // `msUntilStart()` devolve 0: sem ela, qualquer re-execucao deste efeito
  // dispararia o som de inicio na hora, em loop.
  useEffect(() => {
    if (!msUntilStart || !ready || needsGesture) return
    if (startedRef.current || startAt == null) return
    const wait = msUntilStart() ?? 0
    const timer = window.setTimeout(() => {
      startedRef.current = true
      uiSounds.play('start1')
      uiSounds.play('start2')
      engineRef.current?.start()
    }, wait)
    return () => window.clearTimeout(timer)
  }, [msUntilStart, startAt, ready, needsGesture, uiSounds])

  // Um ScoreReporter por partida. Recriar zeraria o throttle e o diff dele.
  useEffect(() => {
    if (!reportScore) return
    reporter.current = new ScoreReporter(reportScore)
    return () => {
      reporter.current = null
    }
  }, [reportScore])

  const me = snapshot?.players[0]
  useEffect(() => {
    if (!me) return
    reporter.current?.report(me, performance.now())
  }, [me])

  // Fim da musica: o estado final vai completo e sem throttle, para o host
  // montar o RESULTS com o numero certo.
  useEffect(() => {
    if (!reportFinished || !me || !snapshot?.finished || finishedRef.current) return
    finishedRef.current = true
    reportFinished(reporter.current?.final(me) ?? {})
  }, [reportFinished, me, snapshot?.finished])

  useEffect(() => {
    const onResize = () => engineRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startNow = () => {
    setNeedsGesture(false)
    uiSounds.play('start1')
    uiSounds.play('start2')
    engineRef.current?.start()
  }

  // Oponentes: vem do placar agregado, filtrados por id (nunca por nome).
  const rivals: MPScoreboardRow[] = useMemo(
    () => (mp?.scoreboard?.players ?? []).filter((row) => row.id !== mp?.selfId),
    [mp?.scoreboard, mp?.selfId],
  )

  // Chart de cada oponente, para desenhar a faixa dele. Quando ele toca o
  // mesmo instrumento e dificuldade que eu, reaproveita o chart ja carregado.
  const [rivalCharts, setRivalCharts] = useState<Map<string, Chart>>(new Map())
  const roomPlayers = mp?.room?.players
  useEffect(() => {
    if (!mp || !roomPlayers) return
    let cancelled = false

    const carregar = async () => {
      const proximo = new Map<string, Chart>()
      for (const outro of roomPlayers) {
        if (outro.id === mp.selfId || !outro.instrument || !outro.difficulty) continue
        try {
          const mesmo =
            outro.instrument === instrument && outro.difficulty === difficulty
              ? chartRef.current
              : await api.chartFor(song, outro.instrument, outro.difficulty)
          if (mesmo) proximo.set(outro.id, mesmo)
        } catch {
          // Sem o chart dele a miniatura fica vazia; nao vale quebrar a partida.
        }
      }
      if (!cancelled) setRivalCharts(proximo)
    }

    void carregar()
    return () => {
      cancelled = true
    }
  }, [mp, roomPlayers, song.id, instrument, difficulty])

  const getSongTime = useMemo(() => () => engineRef.current?.songTime ?? 0, [])

  // Decidido uma vez: trocar os controles no meio da musica seria pior que
  // escolher errado. `hasTouch` olha capacidade, nao tamanho de tela.
  const [touch] = useState(hasTouch)
  const tocarLane = useMemo(
    () => (lane: number, pressed: boolean) => engineRef.current?.pressLane(lane, pressed),
    [],
  )
  const soltarTudo = useMemo(() => () => engineRef.current?.releaseAllLanes(), [])
  const starPower = useMemo(() => () => engineRef.current?.activateStarPower(), [])
  const pausar = useMemo(() => () => engineRef.current?.togglePause(), [])

  const player = me
  const intro = snapshot?.intro
  const videoUrl = resolveAssetUrl(song.assets.backgroundVideo)

  /**
   * Sair da partida.
   *
   * Em LAN, sair no meio sem avisar deixava a sala TRAVADA: o host so fecha a
   * partida quando todos os jogadores mandaram FINISHED, e quem foi embora
   * nunca manda. Os outros ficavam na musica ate o timeout, e o lobby nunca
   * voltava. Mandar o estado final na saida encerra a participacao com o
   * placar que existia, que e o que o resultado deve mostrar.
   */
  const sair = () => {
    if (reportFinished && !finishedRef.current) {
      finishedRef.current = true
      reportFinished(me ? (reporter.current?.final(me) ?? {}) : {})
    }
    onExit()
  }

  return (
    <div className="gameplay">
      {videoUrl ? (
        <video
          ref={videoRef}
          className="gameplay-video"
          style={{
            opacity: settings.visual.videoOpacity,
            filter: `brightness(${settings.visual.videoBrightness})`,
          }}
          muted={settings.volumes.video <= 0}
          playsInline
        />
      ) : (
        <div className="gameplay-fallback" />
      )}

      <canvas ref={canvasRef} className="gameplay-canvas" />

      {mp && rivals.length > 0 && (
        <OpponentHighways
          rivals={rivals}
          charts={rivalCharts}
          getSongTime={getSongTime}
          noteColors={settings.noteColors}
        />
      )}

      {/* Fora quando ha overlay: sem isto o dedo aperta traste por tras do
          menu de pausa. */}
      {touch && ready && !error && !needsGesture && !snapshot?.paused && player && (
        <TouchControls
          onLane={tocarLane}
          onReleaseAll={soltarTudo}
          onStarPower={starPower}
          onPause={pausar}
          noteColors={settings.noteColors}
          leftyFlip={settings.gameplay.leftyFlip}
          starPowerReady={player.starPowerEnergy >= 0.5}
          starPowerActive={player.starPowerActive}
        />
      )}

      {player && snapshot && (
        <Hud
          player={player}
          songTime={snapshot.songTime}
          duration={snapshot.duration}
          showFps={settings.gameplay.showFps}
          fps={snapshot.fps}
        />
      )}

      {mp && rivals.length > 0 && (
        <RivalPanel
          rivals={rivals}
          mode={mp.room?.mode}
          bandScore={mp.scoreboard?.bandScore}
          myScore={player?.score ?? 0}
        />
      )}

      {intro && intro.phase !== 'PLAYING' && (
        <IntroOverlay
          song={song}
          instrument={instrument}
          difficulty={difficulty}
          opacity={intro.cardOpacity}
          countdown={intro.countdown}
        />
      )}

      {!ready && !error && (
        <LoadingScreen songTitle={song.title} done={progress.done} total={progress.total} />
      )}

      {needsGesture && (
        <div className="overlay">
          <div className="panel overlay-box">
            <h2>Pronto?</h2>
            <p className="note">
              O navegador exige um clique antes de tocar áudio.
            </p>
            <button className="btn primary" onClick={startNow}>
              <span>Começar</span>
            </button>
          </div>
        </div>
      )}

      {snapshot?.paused && (
        <div className="overlay">
          <div className="panel overlay-box">
            <h2>Pausado</h2>
            <button className="btn primary" onClick={() => engineRef.current?.resume()}>
              <span>Continuar</span>
            </button>
            <button className="btn" onClick={() => engineRef.current?.restart()}>
              <span>Reiniciar</span>
            </button>
            <button className="btn ghost" onClick={sair}>
              <span>Sair</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="overlay">
          <div className="panel overlay-box">
            <h2>Erro</h2>
            <div className="error-box">{error}</div>
            <button className="btn" onClick={sair}>
              <span>Voltar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Hud({
  player,
  songTime,
  duration,
  showFps,
  fps,
}: {
  player: PlayerSnapshot
  songTime: number
  duration: number
  showFps: boolean
  fps: number
}) {

  return (
    <div className="hud">
      {showFps && <div className="fps">{fps} fps</div>}

      <div className="hud-top">
        <ScorePanel
          score={player.score}
          multiplier={player.multiplier}
          comboProgress={player.comboToNextMultiplier}
          combo={player.combo}
          starPowerActive={player.starPowerActive}
        />

        <div className="hud-right">
          <div className="hud-label">Star Power</div>
          <div className="sp-meter">
            <div
              className={`sp-fill ${
                player.starPowerActive
                  ? 'active'
                  : player.starPowerEnergy >= 0.5
                    ? 'ready'
                    : ''
              }`}
              style={{ width: `${Math.round(player.starPowerEnergy * 100)}%` }}
            />
          </div>
          <div className="hud-combo" style={{ marginTop: 4 }}>
            {player.starPowerActive
              ? 'ativo'
              : player.starPowerEnergy >= 0.5
                ? 'pronto (Enter)'
                : `${Math.round(player.starPowerEnergy * 100)}%`}
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <RockMeter value={player.rockMeter} />
          </div>
        </div>
      </div>

      <div className="hud-bottom">
        <div>
          <div className="hud-label">Accuracy</div>
          <div className="hud-accuracy">{formatPercent(player.accuracy)}</div>
        </div>
        <div className="hud-time">
          {formatTime(Math.max(0, songTime))} / {formatTime(duration)}
        </div>
      </div>
    </div>
  )
}

/**
 * Placar dos oponentes, na lateral.
 *
 * Vem do agregado do host (~10 Hz) e e filtrado por id, nunca por nome: dois
 * jogadores podem se chamar igual.
 */
function RivalPanel({
  rivals,
  mode,
  bandScore,
  myScore,
}: {
  rivals: MPScoreboardRow[]
  mode?: string
  bandScore?: number
  myScore: number
}) {
  const coop = mode === 'coop'
  // Em versus a posicao importa; em co-op todo mundo soma para o mesmo lado.
  const ordenados = coop
    ? rivals
    : [...rivals].sort((a, b) => b.score - a.score)

  return (
    <aside className="rival-panel">
      {coop && bandScore != null && (
        <div className="rival-band">
          <div className="rival-band-label">BAND SCORE</div>
          <div className="rival-band-score">{formatNumber(bandScore)}</div>
        </div>
      )}

      {ordenados.map((rival) => {
        const diferenca = rival.score - myScore
        return (
          <div key={rival.id} className={`rival-row ${rival.connected ? '' : 'off'}`}>
            <div className="rival-row-top">
              <span className="rival-row-name">{rival.name}</span>
              {rival.starPowerActive && <span className="rival-star">★</span>}
            </div>
            <div className="rival-row-score">{formatNumber(rival.score)}</div>

            {!coop && (
              <div className={`rival-gap ${diferenca > 0 ? 'atras' : 'frente'}`}>
                {diferenca === 0
                  ? 'empatado'
                  : diferenca > 0
                    ? `+${formatNumber(diferenca)}`
                    : `-${formatNumber(-diferenca)}`}
              </div>
            )}

            <div className="rival-stats">
              <span>{formatPercent(rival.accuracy)}</span>
              <span>x{rival.multiplier}</span>
              <span>{rival.combo > 0 ? `${rival.combo} combo` : '—'}</span>
            </div>
            <div className="rival-notes">
              {rival.notesHit} acertos · {rival.notesMissed} erros
            </div>
            {!rival.connected && <div className="rival-off">DESCONECTADO</div>}
            {rival.finished && <div className="rival-done">TERMINOU</div>}
          </div>
        )
      })}
    </aside>
  )
}

function IntroOverlay({
  song,
  instrument,
  difficulty,
  opacity,
  countdown,
}: {
  song: SongSummary
  instrument: string
  difficulty: string
  opacity: number
  countdown: string | null
}) {
  return (
    <div className="intro-overlay">
      <div className="intro-card" style={{ opacity }}>
        <div className="intro-song">{song.title}</div>
        <div className="intro-artist">{song.artist}</div>
        <div className="intro-meta">
          {INSTRUMENT_LABELS[instrument] ?? instrument} ·{' '}
          {DIFFICULTY_LABELS[difficulty] ?? difficulty}
        </div>
      </div>
      {countdown && (
        <div className="countdown" key={countdown}>
          {countdown}
        </div>
      )}
    </div>
  )
}
