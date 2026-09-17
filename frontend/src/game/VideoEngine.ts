/**
 * Camada de video de fundo.
 *
 * O video NUNCA e fonte de tempo: ele persegue o AudioEngine. Desvios
 * pequenos sao corrigidos com playbackRate (imperceptivel) e desvios
 * grandes com seek direto.
 */

const SOFT_DRIFT = 0.05
const HARD_DRIFT = 0.3
const SOFT_RATE = 0.06

export class VideoEngine {
  private element: HTMLVideoElement | null = null
  private ready = false
  private wanted = false

  /** Offset de calibracao do video, em segundos. */
  offset = 0

  attach(element: HTMLVideoElement | null): void {
    this.element = element
    if (element) {
      element.muted = true
      element.playsInline = true
      element.preload = 'auto'
      element.loop = false
    }
  }

  async load(url: string): Promise<void> {
    const element = this.element
    if (!element) return

    this.ready = false
    element.src = url

    await new Promise<void>((resolve) => {
      const done = () => {
        element.removeEventListener('loadeddata', done)
        element.removeEventListener('error', done)
        resolve()
      }
      element.addEventListener('loadeddata', done, { once: true })
      element.addEventListener('error', done, { once: true })
      element.load()
    })

    this.ready = !element.error
  }

  get hasVideo(): boolean {
    return this.ready
  }

  /** Chamado a cada frame com o tempo autoritativo do audio. */
  sync(songTime: number, paused: boolean): void {
    const element = this.element
    if (!element || !this.ready) return

    const target = songTime + this.offset

    if (paused || target < 0) {
      if (!element.paused) element.pause()
      if (target < 0) {
        element.currentTime = 0
        element.playbackRate = 1
      }
      this.wanted = false
      return
    }

    if (!this.wanted) {
      this.wanted = true
      element.currentTime = Math.max(0, Math.min(target, element.duration || target))
      void element.play().catch(() => undefined)
    }

    if (element.paused) {
      void element.play().catch(() => undefined)
    }

    const drift = element.currentTime - target

    if (Math.abs(drift) > HARD_DRIFT) {
      const duration = element.duration || Number.POSITIVE_INFINITY
      element.currentTime = Math.max(0, Math.min(target, duration))
      element.playbackRate = 1
      return
    }

    if (Math.abs(drift) > SOFT_DRIFT) {
      // Video atrasado -> acelera de leve. Adiantado -> desacelera.
      element.playbackRate = drift < 0 ? 1 + SOFT_RATE : 1 - SOFT_RATE
    } else if (element.playbackRate !== 1) {
      element.playbackRate = 1
    }
  }

  pause(): void {
    this.element?.pause()
  }

  reset(): void {
    const element = this.element
    if (!element) return
    element.pause()
    element.currentTime = 0
    element.playbackRate = 1
    this.wanted = false
  }

  set volume(value: number) {
    if (!this.element) return
    this.element.volume = Math.min(1, Math.max(0, value))
    this.element.muted = value <= 0
  }

  dispose(): void {
    const element = this.element
    if (element) {
      element.pause()
      element.removeAttribute('src')
      element.load()
    }
    this.element = null
    this.ready = false
  }
}
