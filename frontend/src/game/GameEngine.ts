import { AudioEngine } from './AudioEngine'
import { lookAheadFor } from './config'
import { HighwayRenderer } from './HighwayRenderer'
import { IntroSequence } from './IntroSequence'
import { InputRouter } from './InputRouter'
import { PlayerSession } from './PlayerSession'
import { audioStartDelay, chartDuration, chartTime } from './songClock'
import { FRET_ACTIONS } from './config'
import { VideoEngine } from './VideoEngine'
import type {
  BpmEvent,
  Chart,
  EngineSnapshot,
  GameAction,
  HitEvent,
  PlayerSnapshot,
} from './types'
import type { Settings } from '../settings/types'

export interface GameEngineOptions {
  canvas: HTMLCanvasElement
  video: HTMLVideoElement | null
  chart: Chart
  /** Todos os stems da musica: nome -> URL. */
  audio: Record<string, string>
  videoUrl: string | null
  settings: Settings
  /** Offset declarado no song.ini, em segundos. */
  songDelay: number
  onSnapshot: (snapshot: EngineSnapshot) => void
  onFinish: (players: PlayerSnapshot[]) => void
  onLoadProgress?: (done: number, total: number) => void
  /**
   * Cada nota resolvida do jogador local, em tempo real.
   *
   * Existe para o multiplayer: os outros desenham a faixa deste jogador em
   * miniatura a partir destes eventos. O snapshot nao serve, porque ele e
   * agregado e vem a ~15 Hz - nota individual se perderia.
   */
  onHit?: (event: HitEvent) => void
}

const SNAPSHOT_INTERVAL = 0.066 // ~15 Hz: HUD fluido sem re-render por frame
const END_PADDING = 1.5

/**
 * Orquestrador da gameplay.
 *
 * Mantem UMA linha do tempo (AudioEngine), UM renderer, UM InputRouter e uma
 * LISTA de sessoes de jogador. Roda fora do React: o React so recebe
 * snapshots do HUD, nunca a posicao das notas.
 */
export class GameEngine {
  private readonly audio = new AudioEngine()
  private readonly video = new VideoEngine()
  private readonly input = new InputRouter()
  private readonly intro = new IntroSequence()
  private renderer: HighwayRenderer

  private sessions: PlayerSession[] = []
  private beats: number[] = []

  /** True enquanto o instrumento do jogador estiver cortado por erro. */
  private stemMuted = false

  private rafId = 0
  private lastFrameTime = 0
  private lastSnapshotAt = -1
  private fps = 0
  private paused = false
  private finished = false
  private started = false

  constructor(private options: GameEngineOptions) {
    this.renderer = new HighwayRenderer(options.canvas)
    this.video.attach(options.video)
    this.beats = computeBeats(options.chart.bpm, options.chart.length)
    this.buildSessions()
    this.applySettings(options.settings)

    this.input.onInput(({ playerId, action, pressed }) => {
      const session = this.sessions.find((s) => s.id === playerId)
      if (!session) return
      if (action === 'pause') {
        if (pressed) this.togglePause()
        return
      }
      if (this.paused || this.finished) return
      session.handleAction(action, pressed, this.songTime)
      if (pressed && action === 'strum' && this.options.settings.gameplay.hitSounds) {
        this.playClick()
      }
    })
  }

  // ------------------------------------------------------------------ ciclo

  async load(): Promise<void> {
    await this.audio.unlock()
    // O video carrega em paralelo; o audio e sequencial por dentro, para nao
    // estourar a memoria com varios stems descomprimidos ao mesmo tempo.
    const video = this.options.videoUrl
      ? this.video.load(this.options.videoUrl)
      : Promise.resolve()

    await this.audio.load(
      this.options.audio,
      this.options.chart.instrument,
      this.options.onLoadProgress,
    )
    await video

    this.intro.markLoaded()
  }

  start(): void {
    if (this.started) return
    this.started = true
    // O audio comeca antes para que songTime (= audio - delay) chegue em
    // -leadIn no inicio da intro. Sem descontar o delay, a contagem
    // regressiva ficaria mais longa que o previsto exatamente nessas musicas.
    this.audio.scheduleStart(audioStartDelay(IntroSequence.leadIn, this.options.songDelay))
    this.input.attach()
    this.lastFrameTime = performance.now() / 1000
    this.rafId = requestAnimationFrame(this.loop)
  }

  togglePause(): void {
    if (this.finished) return
    this.paused ? this.resume() : this.pause()
  }

  pause(): void {
    if (this.paused || this.finished) return
    this.paused = true
    this.audio.pause()
    this.video.pause()
    for (const session of this.sessions) session.releaseAll()
    this.emitSnapshot(true)
  }

  resume(): void {
    if (!this.paused || this.finished) return
    this.paused = false
    // Pequena contagem antes de voltar, para o jogador se reposicionar.
    this.audio.resume(0.8)
    this.emitSnapshot(true)
  }

  restart(): void {
    this.finished = false
    this.paused = false
    this.started = false
    this.lastSnapshotAt = -1
    this.audio.stop()
    this.video.reset()
    this.buildSessions()
    this.start()
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId)
    this.input.detach()
    this.audio.dispose()
    this.video.dispose()
  }

  resize(): void {
    this.renderer.resize()
  }

  // ------------------------------------------------------------------ toque

  /**
   * Traste acionado por toque na tela.
   *
   * A politica de palhetada fica AQUI, e nao na interface: com `requireStrum`
   * ligado, um toque tambem palheta - senao no celular a nota nunca contaria.
   * Com ele desligado (o padrao) so o traste ja basta, e palhetar de graca
   * arriscaria overstrum e quebra de combo.
   */
  pressLane(lane: number, pressed: boolean, playerId = 0): void {
    const action = FRET_ACTIONS[lane]
    if (!action) return

    this.input.dispatchAction(playerId, action, pressed)

    if (pressed && this.options.settings.gameplay.requireStrum) {
      this.input.dispatchAction(playerId, 'strum', true)
      this.input.dispatchAction(playerId, 'strum', false)
    }
  }

  /** Solta todos os trastes. O toque perde eventos quando a aba sai de foco. */
  releaseAllLanes(playerId = 0): void {
    for (const action of FRET_ACTIONS) {
      this.input.dispatchAction(playerId, action, false)
    }
  }

  activateStarPower(playerId = 0): void {
    this.input.dispatchAction(playerId, 'starPower', true)
    this.input.dispatchAction(playerId, 'starPower', false)
  }

  applySettings(settings: Settings): void {
    this.options = { ...this.options, settings }
    this.audio.volume = settings.volumes.master * settings.volumes.music
    this.video.volume = settings.volumes.master * settings.volumes.video
    this.video.offset = settings.calibration.videoOffsetMs / 1000
    this.input.setBindings(0, invert(settings.keyBindings))
    // Trocar o modo de palhetada vale na hora, sem reiniciar a musica.
    for (const session of this.sessions) {
      session.requireStrum = settings.gameplay.requireStrum
    }
  }

  // ------------------------------------------------------------------ estado

  /**
   * Tempo do CHART. E contra ele que as notas sao posicionadas e julgadas.
   *
   * `songDelay` e o `delay` do song.ini e SUBTRAI: um delay positivo significa
   * que o audio tem uma entrada antes do chart comecar, entao o chart zero
   * acontece `delay` segundos DENTRO do audio. Somar (como era antes) fazia o
   * chart correr adiantado - em Paint It Black, com delay de 3,778 s, as notas
   * chegavam 3,778 s antes do som e as primeiras eram inalcancaveis.
   */
  get songTime(): number {
    return chartTime(
      this.audio.currentTime,
      this.options.settings.calibration.audioOffsetMs,
      this.options.songDelay,
    )
  }

  /** Duracao em tempo de CHART, que e a escala de `songTime`. */
  get duration(): number {
    // O audio precisa descontar o delay: o fim dele, em tempo de chart, vem
    // `delay` segundos antes. Sem isto a musica com delay nunca terminava,
    // porque songTime nao alcancava a condicao de fim.
    return chartDuration(
      this.options.chart.length,
      this.audio.duration,
      this.options.songDelay,
    )
  }

  /** True quando o navegador ainda exige um clique para liberar o audio. */
  get needsUserGesture(): boolean {
    return this.audio.contextState !== 'running'
  }

  private buildSessions(): void {
    this.sessions = [
      new PlayerSession({
        id: 0,
        name: this.options.settings.profileName,
        chart: this.options.chart,
        instrument: this.options.chart.instrument,
        difficulty: this.options.chart.difficulty,
        requireStrum: this.options.settings.gameplay.requireStrum,
        onHit: (event) => {
          this.setInstrumentMuted(false)
          this.options.onHit?.(event)
        },
        onMiss: () => this.setInstrumentMuted(true),
        onOverstrum: () => this.setInstrumentMuted(true),
      }),
    ]
    this.stemMuted = false
  }

  /**
   * Corta o som do instrumento do jogador quando ele erra, e devolve no
   * proximo acerto. E o feedback mais direto que existe num jogo de ritmo.
   */
  private setInstrumentMuted(muted: boolean): void {
    if (!this.audio.hasIsolatedInstrument) return

    if (!this.options.settings.gameplay.muteOnMiss) {
      if (this.stemMuted) {
        this.stemMuted = false
        this.audio.setInstrumentLevel(1)
      }
      return
    }

    if (this.stemMuted === muted) return
    this.stemMuted = muted
    this.audio.setInstrumentLevel(muted ? 0 : 1)
  }

  // ------------------------------------------------------------------ loop

  private loop = (timestamp: number): void => {
    this.rafId = requestAnimationFrame(this.loop)

    const now = timestamp / 1000
    const delta = Math.min(0.25, Math.max(0, now - this.lastFrameTime))
    this.lastFrameTime = now
    if (delta > 0) {
      this.fps = this.fps * 0.9 + (1 / delta) * 0.1
    }

    const songTime = this.songTime
    const settings = this.options.settings

    if (!this.paused && !this.finished) {
      for (const session of this.sessions) {
        session.update(songTime, delta)
      }
      if (songTime > this.duration + END_PADDING) {
        this.finish()
      }
    }

    this.video.sync(songTime, this.paused)

    const introState = this.intro.state(songTime)
    this.renderer.render({
      sessions: this.sessions,
      songTime,
      lookAhead: lookAheadFor(settings.gameplay.noteSpeed),
      reveal: introState.reveal,
      noteColors: settings.noteColors,
      beats: this.beats,
      effects: settings.visual.effects,
      leftyFlip: settings.gameplay.leftyFlip,
    })

    if (songTime - this.lastSnapshotAt >= SNAPSHOT_INTERVAL) {
      this.lastSnapshotAt = songTime
      this.emitSnapshot(false)
    }
  }

  private emitSnapshot(force: boolean): void {
    if (force) this.lastSnapshotAt = this.songTime
    const songTime = this.songTime
    this.options.onSnapshot({
      songTime,
      duration: this.duration,
      paused: this.paused,
      finished: this.finished,
      intro: this.intro.state(songTime),
      players: this.sessions.map((session) => session.snapshot()),
      fps: Math.round(this.fps),
    })
  }

  private finish(): void {
    if (this.finished) return
    this.finished = true
    this.audio.stop()
    this.video.pause()
    this.input.detach()
    this.emitSnapshot(true)
    this.options.onFinish(this.sessions.map((session) => session.snapshot()))
  }

  /** Clique curto de feedback da palhetada. */
  private playClick(): void {
    try {
      const ctx = this.audio.context
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(880, now)
      const volume =
        this.options.settings.volumes.master * this.options.settings.volumes.effects * 0.08
      gain.gain.setValueAtTime(volume, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.06)
    } catch {
      // Som de feedback nunca pode derrubar a gameplay.
    }
  }
}

// ------------------------------------------------------------------ helpers

export function computeBeats(bpm: BpmEvent[], length: number): number[] {
  const beats: number[] = []
  if (bpm.length === 0) return beats

  for (let i = 0; i < bpm.length; i++) {
    const start = bpm[i].time
    const end = i + 1 < bpm.length ? bpm[i + 1].time : length
    const interval = 60 / Math.max(1, bpm[i].bpm)
    for (let time = start; time < end; time += interval) {
      beats.push(time)
      if (beats.length > 20000) return beats
    }
  }
  return beats
}

/** keyBindings guarda acao -> codigo; o router precisa de codigo -> acao. */
function invert(bindings: Settings['keyBindings']): Record<string, GameAction> {
  const result: Record<string, GameAction> = {}
  for (const [action, code] of Object.entries(bindings)) {
    result[code] = action as GameAction
  }
  return result
}
