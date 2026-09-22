/**
 * Camada de video de fundo.
 *
 * O video NUNCA e fonte de tempo: ele persegue o AudioEngine. Desvios
 * pequenos sao corrigidos com playbackRate (imperceptivel) e desvios
 * grandes com seek direto.
 *
 * O video TOCA EM LOOP: quase todo background de musica e um clipe curto, bem
 * mais curto que a musica. Sem loop ele congelava no ultimo frame e o resto
 * da musica era jogado contra uma imagem parada. Por isso o alvo e o tempo da
 * musica dobrado na duracao do video (`raw % duration`), e o desvio e medido
 * de forma circular - senao, no instante da volta, uma diferenca de milesimos
 * apareceria como um desvio do tamanho do clipe inteiro e o seek corretivo
 * brigaria com o loop.
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
      element.loop = true
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

  /**
   * Duracao util para o loop, ou null enquanto o metadado nao chegou.
   *
   * Streams e alguns webm reportam Infinity ou NaN; nesses casos nao da para
   * dobrar o tempo e o video toca direto.
   */
  private get cycle(): number | null {
    const duration = this.element?.duration ?? Number.NaN
    return Number.isFinite(duration) && duration > 0 ? duration : null
  }

  /**
   * Distancia do video ate o alvo, pelo caminho mais curto do ciclo.
   *
   * Com loop, `currentTime` perto de 0 e alvo perto do fim (ou o contrario)
   * estao a milesimos de distancia, e nao a um clipe inteiro.
   */
  private driftTo(current: number, target: number, cycle: number | null): number {
    const bruto = current - target
    if (cycle === null) return bruto

    const dentro = ((bruto % cycle) + cycle) % cycle
    return dentro > cycle / 2 ? dentro - cycle : dentro
  }

  /** Chamado a cada frame com o tempo autoritativo do audio. */
  sync(songTime: number, paused: boolean): void {
    const element = this.element
    if (!element || !this.ready) return

    const bruto = songTime + this.offset

    if (paused || bruto < 0) {
      if (!element.paused) element.pause()
      if (bruto < 0) {
        element.currentTime = 0
        element.playbackRate = 1
      }
      this.wanted = false
      return
    }

    const cycle = this.cycle
    const target = cycle === null ? bruto : bruto % cycle

    if (!this.wanted) {
      this.wanted = true
      element.currentTime = Math.max(0, target)
      void element.play().catch(() => undefined)
    }

    if (element.paused) {
      void element.play().catch(() => undefined)
    }

    const drift = this.driftTo(element.currentTime, target, cycle)

    if (Math.abs(drift) > HARD_DRIFT) {
      element.currentTime = Math.max(0, target)
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
