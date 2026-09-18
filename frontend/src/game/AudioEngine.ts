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

/** Stems que entram mais baixos na mixagem da base. */
const DEFAULT_LEVELS: Record<string, number> = {
  crowd: 0.35,
}

/** Nome interno da base ja somada. */
const BACKING_STEM = '__backing'

/**
 * Soma varios AudioBuffers num so, canal a canal.
 *
 * Cresce conforme aparecem stems mais longos, e sobe para estereo se algum
 * stem tiver dois canais. Assim nao dependemos de todos os arquivos do pacote
 * terem exatamente a mesma duracao.
 */
class Mixdown {
  private channels: Float32Array<ArrayBuffer>[] = []
  private length = 0
  private sampleRate = 0

  add(buffer: AudioBuffer, level: number): void {
    this.sampleRate = buffer.sampleRate
    this.grow(buffer.numberOfChannels, buffer.length)

    for (let channel = 0; channel < this.channels.length; channel++) {
      // Mono num destino estereo entra nos dois lados.
      const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1))
      const target = this.channels[channel]
      for (let i = 0; i < source.length; i++) {
        target[i] += source[i] * level
      }
    }
  }

  private grow(channelCount: number, length: number): void {
    const channels = Math.max(this.channels.length, channelCount)
    const size = Math.max(this.length, length)
    if (channels === this.channels.length && size === this.length) return

    const grown: Float32Array<ArrayBuffer>[] = []
    for (let channel = 0; channel < channels; channel++) {
      const next = new Float32Array(size)
      const previous = this.channels[channel] ?? this.channels[0]
      if (previous) next.set(previous)
      grown.push(next)
    }
    this.channels = grown
    this.length = size
  }

  toAudioBuffer(ctx: AudioContext): AudioBuffer | null {
    if (this.channels.length === 0 || this.length === 0) return null
    const buffer = ctx.createBuffer(this.channels.length, this.length, this.sampleRate)
    for (let channel = 0; channel < this.channels.length; channel++) {
      buffer.copyToChannel(this.channels[channel], channel)
    }
    // Libera as copias de trabalho assim que o buffer final existe.
    this.channels = []
    return buffer
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private stems: Stem[] = []

  /** Instante do AudioContext em que a posicao 0 da musica acontece. */
  /** Instante do contexto em que a contagem de posicao comecou. */
  private startCtxTime = 0
  /** Posicao da musica naquele instante. */
  private startOffset = 0
  /**
   * Velocidade de reproducao. 1 = normal; usado pelo modo treino.
   *
   * O Web Audio nao preserva o tom ao mudar a taxa, entao a musica soa mais
   * grave em velocidade reduzida. Para treinar isso e aceitavel, e evita
   * carregar uma biblioteca de time-stretch.
   */
  private rate = 1
  private pausedAt = 0
  private running = false

  /** Stem isolado do instrumento do jogador, quando o pacote separa as faixas. */
  private soloStem: string | null = null

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
   * Carrega os stems e monta DOIS buffers: a base (todos os stems somados) e
   * o instrumento do jogador, separado para poder ser cortado quando ele erra.
   *
   * Por que somar em vez de guardar cada stem: um AudioBuffer descomprimido
   * custa ~44100 * 4 bytes por canal por segundo. Uma musica de 7 minutos com
   * 7 stems passaria de 1 GB de RAM. Somando, o pico fica em dois buffers.
   *
   * A decodificacao e SEQUENCIAL de proposito: em paralelo, todos os arquivos
   * ficariam descomprimidos na memoria ao mesmo tempo, que e exatamente o que
   * estamos evitando.
   */
  async load(
    urls: Record<string, string>,
    instrument?: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    const entries = Object.entries(urls).filter(([name]) => !EXCLUDED_STEMS.has(name))
    if (entries.length === 0) {
      throw new Error('Esta musica nao tem arquivo de audio.')
    }

    const ctx = this.context
    const soloName = instrument ? stemForInstrument(instrument, entries.map(([name]) => name)) : null

    const backing = new Mixdown()
    let solo: AudioBuffer | null = null
    const failures: unknown[] = []
    let done = 0

    for (const [name, url] of entries) {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.arrayBuffer()
        const buffer = await ctx.decodeAudioData(data)

        if (name === soloName) {
          solo = buffer
        } else {
          backing.add(buffer, DEFAULT_LEVELS[name] ?? 1)
        }
      } catch (error) {
        failures.push(error)
      } finally {
        done++
        onProgress?.(done, entries.length)
      }
    }

    this.stems = []

    const backingBuffer = backing.toAudioBuffer(ctx)
    if (backingBuffer) this.addStem(BACKING_STEM, backingBuffer)
    if (solo && soloName) this.addStem(soloName, solo)

    if (this.stems.length === 0) {
      throw new AudioDecodeError(entries[0][1], failures[0])
    }

    this.soloStem = solo && soloName ? soloName : null
  }

  private addStem(name: string, buffer: AudioBuffer): void {
    const gain = this.context.createGain()
    gain.gain.value = 1
    gain.connect(this.master!)
    this.stems.push({ name, buffer, gain, source: null, level: 1 })
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
      source.playbackRate.value = this.rate
      source.connect(stem.gain)
      source.start(startAt, from)
      stem.source = source
    }

    this.startCtxTime = startAt
    this.startOffset = from
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
    // A posicao avanca `rate` segundos de musica por segundo de contexto. Com
    // rate 1 isto e identico a `ctx.currentTime - zeroCtxTime`.
    return this.startOffset + (this.ctx.currentTime - this.startCtxTime) * this.rate
  }

  get playbackRate(): number {
    return this.rate
  }

  /**
   * Troca a velocidade sem pular no tempo.
   *
   * Re-ancora a contagem na posicao ATUAL: sem isso, mudar a taxa reescreveria
   * o passado e a musica saltaria.
   */
  setPlaybackRate(rate: number): void {
    const alvo = Math.min(2, Math.max(0.25, rate))
    if (Math.abs(alvo - this.rate) < 0.001) return

    const posicao = this.currentTime
    this.rate = alvo

    if (this.ctx && this.running) {
      this.startOffset = posicao
      this.startCtxTime = this.ctx.currentTime
      for (const stem of this.stems) {
        stem.source?.playbackRate.setValueAtTime(alvo, this.ctx.currentTime)
      }
    } else {
      this.pausedAt = posicao
    }
  }

  /** Salta para uma posicao da musica. Usado pelo loop do treino. */
  seek(seconds: number): void {
    const destino = Math.max(0, seconds)
    if (this.running) this.scheduleStart(0, destino)
    else this.pausedAt = destino
  }

  /** True quando da para cortar so o instrumento do jogador. */
  get hasIsolatedInstrument(): boolean {
    return this.soloStem !== null
  }

  /**
   * Ajusta o volume do instrumento do jogador, com rampa curta para nao
   * estalar. E o que corta o som quando ele erra.
   */
  setInstrumentLevel(level: number, rampSeconds = 0.05): void {
    if (!this.soloStem) return
    this.setStemLevel(this.soloStem, level, rampSeconds)
  }

  setStemLevel(name: string, level: number, rampSeconds = 0.05): void {
    const stem = this.stems.find((item) => item.name === name)
    if (!stem || !this.ctx) return
    const target = Math.max(0, Math.min(1, level)) * stem.level
    if (Math.abs(stem.gain.gain.value - target) < 0.001) return
    const now = this.ctx.currentTime
    stem.gain.gain.cancelScheduledValues(now)
    stem.gain.gain.setValueAtTime(stem.gain.gain.value, now)
    stem.gain.gain.linearRampToValueAtTime(target, now + rampSeconds)
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
    this.soloStem = null
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
