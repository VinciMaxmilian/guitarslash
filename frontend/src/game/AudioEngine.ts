/**
 * Fonte principal de tempo do jogo, e mixer dos stems.
 *
 * O relogio do jogo NAO e o requestAnimationFrame nem um setInterval: e o
 * relogio do AudioContext. A posicao visual das notas e sempre derivada de
 * `currentTime`, entao variacao de FPS nunca dessincroniza a gameplay.
 *
 * `currentTime` fica NEGATIVO durante a contagem regressiva, o que faz as
 * primeiras notas entrarem na tela antes da musica comecar.
 *
 * STEMS: pacotes de musica costumam separar as faixas (song.opus e a base
 * SEM a guitarra, guitar.opus e so a guitarra, etc). Tocar apenas song.opus
 * deixaria faltando justamente o instrumento escolhido, entao carregamos
 * todos os stems e tocamos juntos, agendados no mesmo instante.
 */

export class AudioDecodeError extends Error {
  constructor(
    public readonly url: string,
    cause?: unknown,
  ) {
    super(
      'Nao foi possivel decodificar o audio. ' +
        'Verifique se o navegador suporta o formato (Opus falha em algumas versoes do Safari).',
    )
    this.name = 'AudioDecodeError'
    this.cause = cause
  }
}

interface Stem {
  name: string
  buffer: AudioBuffer
  gain: GainNode
  source: AudioBufferSourceNode | null
  /** Volume alvo do stem, antes do volume geral. */
  level: number
}

/** `preview` e um trecho curto para a tela de selecao, nunca parte da mixagem. */
const EXCLUDED_STEMS = new Set(['preview'])

/** Stems que entram mais baixos por padrao. */
const DEFAULT_LEVELS: Record<string, number> = {
  crowd: 0.35,
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private stems: Stem[] = []

  /** Instante do AudioContext em que a posicao 0 da musica acontece. */
  private zeroCtxTime = 0
  private pausedAt = 0
  private running = false

  private _volume = 1

  get context(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this._volume
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  get duration(): number {
    return this.stems.reduce((longest, stem) => Math.max(longest, stem.buffer.duration), 0)
  }

  get stemNames(): string[] {
    return this.stems.map((stem) => stem.name)
  }

  get isRunning(): boolean {
    return this.running
  }

  /** Estado do AudioContext sem forcar a criacao dele. */
  get contextState(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none'
  }

  /**
   * Carrega todos os stems em paralelo. Um stem que falhar sozinho nao
   * derruba a musica - so some da mixagem.
   */
  async load(
    urls: Record<string, string>,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    const entries = Object.entries(urls).filter(([name]) => !EXCLUDED_STEMS.has(name))
    if (entries.length === 0) {
      throw new Error('Esta musica nao tem arquivo de audio.')
    }

    const ctx = this.context
    let done = 0
    const failures: unknown[] = []

    const loaded = await Promise.all(
      entries.map(async ([name, url]) => {
        try {
          const response = await fetch(url)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.arrayBuffer()
          const buffer = await ctx.decodeAudioData(data)
          return { name, buffer }
        } catch (error) {
          failures.push(error)
          return null
        } finally {
          done++
          onProgress?.(done, entries.length)
        }
      }),
    )

    this.stems = []
    for (const item of loaded) {
      if (!item) continue
      const gain = ctx.createGain()
      const level = DEFAULT_LEVELS[item.name] ?? 1
      gain.gain.value = level
      gain.connect(this.master!)
      this.stems.push({ name: item.name, buffer: item.buffer, gain, source: null, level })
    }

    if (this.stems.length === 0) {
      throw new AudioDecodeError(entries[0][1], failures[0])
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
   * Todos os stems partem do MESMO instante agendado.
   */
  scheduleStart(delaySeconds: number, offset = 0): void {
    if (this.stems.length === 0) throw new Error('audio nao carregado')
    this.stopSources()

    const ctx = this.context
    const startAt = ctx.currentTime + Math.max(0, delaySeconds)
    const from = Math.max(0, offset)

    for (const stem of this.stems) {
      if (from >= stem.buffer.duration) continue
      const source = ctx.createBufferSource()
      source.buffer = stem.buffer
      source.connect(stem.gain)
      source.start(startAt, from)
      stem.source = source
    }

    this.zeroCtxTime = startAt - from
    this.pausedAt = from
    this.running = true
  }

  pause(): void {
    if (!this.running) return
    this.pausedAt = this.currentTime
    this.stopSources()
    this.running = false
  }

  resume(delaySeconds = 0): void {
    if (this.running || this.stems.length === 0) return
    this.scheduleStart(delaySeconds, Math.max(0, this.pausedAt))
  }

  stop(): void {
    this.stopSources()
    this.running = false
    this.pausedAt = 0
  }

  /** Posicao atual da musica em segundos. Negativa antes do inicio. */
  get currentTime(): number {
    if (!this.running || !this.ctx) return this.pausedAt
    return this.ctx.currentTime - this.zeroCtxTime
  }

  /**
   * Ajusta o volume de um stem, com rampa curta para nao estalar.
   * Usado para cortar o instrumento do jogador quando ele erra.
   */
  setStemLevel(name: string, level: number, rampSeconds = 0.04): void {
    const stem = this.stems.find((item) => item.name === name)
    if (!stem || !this.ctx) return
    const target = Math.max(0, Math.min(1, level)) * (DEFAULT_LEVELS[name] ?? 1)
    if (Math.abs(stem.gain.gain.value - target) < 0.001) return
    const now = this.ctx.currentTime
    stem.gain.gain.cancelScheduledValues(now)
    stem.gain.gain.setValueAtTime(stem.gain.gain.value, now)
    stem.gain.gain.linearRampToValueAtTime(target, now + rampSeconds)
  }

  hasStem(name: string): boolean {
    return this.stems.some((stem) => stem.name === name)
  }

  get volume(): number {
    return this._volume
  }

  set volume(value: number) {
    this._volume = Math.min(1, Math.max(0, value))
    if (this.master) {
      this.master.gain.value = this._volume
    }
  }

  dispose(): void {
    this.stopSources()
    this.stems = []
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
      this.master = null
    }
  }

  private stopSources(): void {
    for (const stem of this.stems) {
      if (!stem.source) continue
      try {
        stem.source.onended = null
        stem.source.stop()
      } catch {
        // ja parado
      }
      stem.source.disconnect()
      stem.source = null
    }
  }
}

/**
 * Qual stem corresponde ao instrumento escolhido.
 * Devolve null quando o pacote nao separa aquele instrumento (mix unico).
 */
export function stemForInstrument(
  instrument: string,
  available: readonly string[],
): string | null {
  const candidates: Record<string, string[]> = {
    guitar: ['guitar', 'lead'],
    guitar_coop: ['guitar', 'lead'],
    rhythm: ['rhythm', 'guitar'],
    bass: ['bass', 'rhythm'],
    drums: ['drums', 'drums_1'],
    keys: ['keys'],
    vocals: ['vocals', 'vocals_1'],
  }

  for (const name of candidates[instrument] ?? []) {
    if (available.includes(name)) return name
  }
  return null
}
