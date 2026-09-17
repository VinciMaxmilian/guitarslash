/**
 * Fonte principal de tempo do jogo.
 *
 * O relogio do jogo NAO e o requestAnimationFrame nem um setInterval: e o
 * relogio do AudioContext. A posicao visual das notas e sempre derivada de
 * `currentTime`, entao variacao de FPS nunca dessincroniza a gameplay.
 *
 * `currentTime` fica NEGATIVO durante a contagem regressiva, o que faz as
 * primeiras notas entrarem na tela antes da musica comecar.
 */

export class AudioDecodeError extends Error {
  constructor(public readonly url: string, cause?: unknown) {
    super(
      'Nao foi possivel decodificar o audio. ' +
        'Verifique se o navegador suporta o formato (Opus falha em algumas versoes do Safari).',
    )
    this.name = 'AudioDecodeError'
    this.cause = cause
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null

  /** Instante do AudioContext em que a posicao 0 da musica acontece. */
  private zeroCtxTime = 0
  private pausedAt = 0
  private running = false

  private _volume = 1

  get context(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new Ctor()
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this._volume
      this.gain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  get duration(): number {
    return this.buffer?.duration ?? 0
  }

  /** Estado do AudioContext sem forcar a criacao dele. */
  get contextState(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none'
  }

  get isRunning(): boolean {
    return this.running
  }

  async load(url: string): Promise<void> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Falha ao baixar o audio (${response.status})`)
    }
    const data = await response.arrayBuffer()
    try {
      this.buffer = await this.context.decodeAudioData(data)
    } catch (error) {
      throw new AudioDecodeError(url, error)
    }
  }

  /** Garante que o contexto esteja ativo. Precisa de um gesto do usuario antes. */
  async unlock(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  /**
   * Agenda o inicio da musica para daqui a `delaySeconds`.
   * Durante a espera, `currentTime` e negativo.
   */
  scheduleStart(delaySeconds: number, offset = 0): void {
    if (!this.buffer) throw new Error('audio nao carregado')
    this.stopSource()

    const ctx = this.context
    const startAt = ctx.currentTime + Math.max(0, delaySeconds)

    this.source = ctx.createBufferSource()
    this.source.buffer = this.buffer
    this.source.connect(this.gain!)
    this.source.start(startAt, Math.max(0, offset))

    this.zeroCtxTime = startAt - offset
    this.pausedAt = offset
    this.running = true
  }

  pause(): void {
    if (!this.running) return
    this.pausedAt = this.currentTime
    this.stopSource()
    this.running = false
  }

  resume(delaySeconds = 0): void {
    if (this.running || !this.buffer) return
    this.scheduleStart(delaySeconds, Math.max(0, this.pausedAt))
  }

  stop(): void {
    this.stopSource()
    this.running = false
    this.pausedAt = 0
  }

  /** Posicao atual da musica em segundos. Negativa antes do inicio. */
  get currentTime(): number {
    if (!this.running || !this.ctx) return this.pausedAt
    return this.ctx.currentTime - this.zeroCtxTime
  }

  get volume(): number {
    return this._volume
  }

  set volume(value: number) {
    this._volume = Math.min(1, Math.max(0, value))
    if (this.gain) {
      this.gain.gain.value = this._volume
    }
  }

  dispose(): void {
    this.stopSource()
    this.buffer = null
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
      this.gain = null
    }
  }

  private stopSource(): void {
    if (!this.source) return
    try {
      this.source.onended = null
      this.source.stop()
    } catch {
      // ja parado
    }
    this.source.disconnect()
    this.source = null
  }
}
