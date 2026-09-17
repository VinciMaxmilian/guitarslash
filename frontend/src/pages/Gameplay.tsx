import { useEffect, useRef, useState } from 'react'

import { api, resolveAssetUrl } from '../api/client'
import { DIFFICULTY_LABELS, INSTRUMENT_LABELS, type SongSummary } from '../api/types'
import { GameEngine } from '../game/GameEngine'
import type { Chart, EngineSnapshot, PlayerSnapshot } from '../game/types'
import { useSettings } from '../hooks/useSettings'
import { formatNumber, formatPercent, formatTime } from '../utils/format'
import { useUISounds } from '../hooks/useUISounds'

interface Props {
  song: SongSummary
  instrument: string
  difficulty: string
  multiplayerContext?: any
  onExit: () => void
  onFinish: (results: PlayerSnapshot[], chart: Chart) => void
}

export function Gameplay({ song, instrument, difficulty, multiplayerContext, onExit, onFinish }: Props) {
  const settings = useSettings()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const chartRef = useRef<Chart | null>(null)
  const uiSounds = useUISounds()

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

    const boot = async () => {
      try {
        const chart = await api.chart(song.id, instrument, difficulty)
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
          onSnapshot: setSnapshot,
          onFinish: (players) => onFinish(players, chart),
        })
        engineRef.current = engine

        await engine.load()
        if (cancelled) {
          engine.destroy()
          return
        }

        setReady(true)
        if (multiplayerContext) {
          multiplayerContext.reportLoadProgress(1)
        }
        if (engine.needsUserGesture) {
          setNeedsGesture(true)
        } else if (!multiplayerContext) {
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
  }, [song.id, instrument, difficulty, uiSounds])

  // Configuracoes alteradas em tempo real chegam na engine sem remontar nada.
  useEffect(() => {
    engineRef.current?.applySettings(settings)
  }, [settings])

  useEffect(() => {
    if (!multiplayerContext || !ready || needsGesture) return
    const startAt = multiplayerContext.startAt as number | null
    if (startAt == null) return
    const wait = Math.max(0, startAt - Date.now())
    const timer = window.setTimeout(() => {
      uiSounds.play('start1')
      uiSounds.play('start2')
      engineRef.current?.start()
    }, wait)
    return () => window.clearTimeout(timer)
  }, [multiplayerContext, multiplayerContext?.startAt, ready, needsGesture, uiSounds])

  useEffect(() => {
    if (!multiplayerContext || !snapshot?.players[0]) return
    multiplayerContext.reportScore(snapshot.players[0])
  }, [snapshot?.players?.[0]?.score, snapshot?.players?.[0]?.combo, snapshot?.players?.[0]?.starPowerActive])

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

  const player = snapshot?.players[0]
  const intro = snapshot?.intro
  const videoUrl = resolveAssetUrl(song.assets.backgroundVideo)

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

      {player && snapshot && (
        <Hud
          player={player}
          songTime={snapshot.songTime}
          duration={snapshot.duration}
          showFps={settings.gameplay.showFps}
          fps={snapshot.fps}
          multiplayerContext={multiplayerContext}
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
        <div className="overlay">
          <div className="panel overlay-box">
            <h2>Carregando</h2>
            <div className="screen-subtitle">{song.title}</div>
            {progress.total > 0 && (
              <div className="note">
                faixas de áudio: {progress.done} de {progress.total}
              </div>
            )}
            <div className="loading-bar" />
          </div>
        </div>
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
            <button className="btn ghost" onClick={onExit}>
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
            <button className="btn" onClick={onExit}>
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
  multiplayerContext,
}: {
  player: PlayerSnapshot
  songTime: number
  duration: number
  showFps: boolean
  fps: number
  multiplayerContext?: any
}) {
  const others = multiplayerContext?.room?.players.filter((p: any) => p.name !== player.name) || []

  return (
    <div className="hud">
      {showFps && <div className="fps">{fps} fps</div>}

      <div className="hud-top">
        <div>
          <div className="hud-label">Score</div>
          <div className="hud-score">{formatNumber(player.score)}</div>
          <div className="hud-combo">
            {player.combo > 0 ? `${player.combo} de combo` : 'sem combo'}
            {player.maxCombo > 0 && ` · máx ${player.maxCombo}`}
          </div>

          {others.length > 0 && (
            <div style={{ marginTop: 20 }}>
              {others.map((p: any) => (
                <div key={p.id} style={{ marginBottom: 10 }}>
                  <div className="hud-label" style={{ color: '#c2481c' }}>{p.name}</div>
                  <div className="hud-score" style={{ fontSize: 24 }}>{formatNumber(p.scoreState?.score || 0)}</div>
                  <div className="hud-combo" style={{ fontSize: 10 }}>
                    {p.scoreState?.combo > 0 ? `${p.scoreState.combo} combo` : ''}
                    {p.scoreState?.starPowerActive ? ' ★' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div className="hud-label">Multiplicador</div>
          <div className="hud-multiplier">x{player.multiplier}</div>
        </div>

        <div className="hud-right">
          <div className="hud-label">Star Power</div>
          <div className="sp-meter">
            <div
              className={`sp-fill ${player.starPowerActive ? 'active' : ''}`}
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
