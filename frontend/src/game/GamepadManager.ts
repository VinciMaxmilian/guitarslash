import { identifyGamepad, type GamepadIdentity } from './gamepadProfiles'
import type { AxisCalibration, GamepadSettings } from '../settings/types'

/**
 * Leitura dos controles (Gamepad API).
 *
 * A Gamepad API NAO manda eventos de botao: o navegador so entrega um retrato
 * do estado quando voce pergunta. Entao este modulo faz o polling num rAF e
 * transforma o retrato em EVENTOS DE BORDA (apertou / soltou), que e o que o
 * resto do jogo entende - igual ao teclado.
 *
 * Nao conhece acoes do jogo: emite "sinais" (`b0`, `a1-`). Quem traduz sinal
 * em acao e o InputRouter, com o mapeamento das configuracoes. Assim a tela de
 * configuracoes consegue escutar QUALQUER sinal para capturar um vinculo novo.
 */

export interface GamepadDeviceInfo {
  index: number
  id: string
  identity: GamepadIdentity
  /** True quando o navegador entrega o layout padronizado. */
  standard: boolean
  buttonCount: number
  axisCount: number
}

export interface GamepadSignalEvent {
  /** `b<indice>` ou `a<indice>+` / `a<indice>-`. */
  signal: string
  pressed: boolean
  deviceIndex: number
  deviceId: string
}

export interface GamepadLiveState {
  device: GamepadDeviceInfo
  /** 0..1 por botao. */
  buttons: number[]
  /** Valor cru do navegador, antes da calibracao. */
  axesRaw: number[]
  /** Depois de centro, amplitude e zona morta. */
  axes: number[]
}

type PollConfig = Pick<GamepadSettings, 'deadzone' | 'axisThreshold' | 'calibration'>

const DEFAULT_CONFIG: PollConfig = {
  deadzone: 0.25,
  axisThreshold: 0.6,
  calibration: {},
}

/**
 * Histerese: solta com um limiar menor do que o de apertar.
 *
 * Sem isso um stick parado bem em cima do limiar gera uma chuva de palhetadas.
 */
const RELEASE_RATIO = 0.7

/** Amplitude minima aceita, para uma calibracao ruim nao travar o eixo. */
const MIN_RANGE = 0.2

export function normalizeAxis(raw: number, center: number, range: number, deadzone: number): number {
  if (!Number.isFinite(raw)) return 0
  const span = Math.max(MIN_RANGE, range)
  const bruto = Math.max(-1, Math.min(1, (raw - center) / span))
  const modulo = Math.abs(bruto)
  const zona = Math.max(0, Math.min(0.9, deadzone))
  if (modulo <= zona) return 0
  // Reescala para que o primeiro passo fora da zona morta nao de um pulo.
  return Math.sign(bruto) * ((modulo - zona) / (1 - zona))
}

/** Calibracao neutra: centro em zero, amplitude cheia. */
export function identityCalibration(axisCount: number): AxisCalibration {
  return {
    center: new Array(axisCount).fill(0),
    range: new Array(axisCount).fill(1),
  }
}

/**
 * Fecha uma amostragem de amplitude.
 *
 * A amplitude de cada eixo e a MAIOR das duas metades: um stick que chega a
 * -1 mas so a 0,8 do outro lado ainda precisa alcancar o limiar dos dois
 * lados, senao metade dos movimentos do jogador some.
 */
export function calibrationFromSamples(
  center: number[],
  min: number[],
  max: number[],
): AxisCalibration {
  const range = min.map((menor, i) => {
    const maior = max[i]
    if (!Number.isFinite(menor) || !Number.isFinite(maior)) return 1
    const centro = center[i] ?? 0
    return Math.max(MIN_RANGE, Math.abs(maior - centro), Math.abs(centro - menor))
  })
  return { center: [...center], range }
}

interface DeviceState {
  info: GamepadDeviceInfo
  held: Set<string>
  /** Extremos acumulados durante a calibracao, ou null fora dela. */
  sampling: { min: number[]; max: number[] } | null
}

type SignalHandler = (event: GamepadSignalEvent) => void
type FrameHandler = (states: GamepadLiveState[]) => void
type DevicesHandler = (devices: GamepadDeviceInfo[]) => void

export class GamepadManager {
  private config: PollConfig = DEFAULT_CONFIG
  private states = new Map<number, DeviceState>()
  private signalHandlers = new Set<SignalHandler>()
  private frameHandlers = new Set<FrameHandler>()
  private devicesHandlers = new Set<DevicesHandler>()
  private rafId = 0
  private running = false
  private lastFrame: GamepadLiveState[] = []

  /** True quando o navegador expoe a Gamepad API. */
  static get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
  }

  configure(config: PollConfig): void {
    this.config = config
  }

  /**
   * Escuta as bordas de botao.
   *
   * O polling comeca no primeiro inscrito e para quando o ultimo sai: uma tela
   * que nao usa controle nao paga um rAF por frame.
   */
  onSignal(handler: SignalHandler): () => void {
    this.signalHandlers.add(handler)
    this.ensureRunning()
    return () => {
      this.signalHandlers.delete(handler)
      this.maybeStop()
    }
  }

  /** Estado continuo, para as barras da tela de calibracao. */
  onFrame(handler: FrameHandler): () => void {
    this.frameHandlers.add(handler)
    this.ensureRunning()
    return () => {
      this.frameHandlers.delete(handler)
      this.maybeStop()
    }
  }

  onDevices(handler: DevicesHandler): () => void {
    this.devicesHandlers.add(handler)
    this.ensureRunning()
    handler(this.devices())
    return () => {
      this.devicesHandlers.delete(handler)
      this.maybeStop()
    }
  }

  devices(): GamepadDeviceInfo[] {
    return [...this.states.values()].map((state) => state.info)
  }

  /** Ultimo retrato lido, sem esperar o proximo frame. */
  frame(): GamepadLiveState[] {
    return this.lastFrame
  }

  // -------------------------------------------------------------- calibracao

  /** Le os eixos como estao agora: vira o novo centro. */
  captureCenter(deviceIndex: number): number[] | null {
    const live = this.lastFrame.find((s) => s.device.index === deviceIndex)
    return live ? [...live.axesRaw] : null
  }

  /** Comeca a acumular os extremos de cada eixo. */
  startAxisSampling(deviceIndex: number): void {
    const state = this.states.get(deviceIndex)
    if (!state) return
    const n = state.info.axisCount
    state.sampling = {
      min: new Array(n).fill(Number.POSITIVE_INFINITY),
      max: new Array(n).fill(Number.NEGATIVE_INFINITY),
    }
  }

  /** Fecha a amostragem e devolve a calibracao resultante. */
  endAxisSampling(deviceIndex: number, center: number[]): AxisCalibration | null {
    const state = this.states.get(deviceIndex)
    if (!state?.sampling) return null
    const { min, max } = state.sampling
    state.sampling = null
    return calibrationFromSamples(center, min, max)
  }

  cancelAxisSampling(deviceIndex: number): void {
    const state = this.states.get(deviceIndex)
    if (state) state.sampling = null
  }

  // ---------------------------------------------------------------- vibracao

  /**
   * Vibra o controle, quando ele souber.
   *
   * O DualShock 3 e boa parte dos genericos nao expoem atuador no navegador; a
   * chamada falha em silencio de proposito - vibracao e tempero, nao regra.
   */
  rumble(strength: number, durationMs: number, deviceIndex?: number): void {
    if (!GamepadManager.supported) return
    const forca = Math.max(0, Math.min(1, strength))
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue
      if (deviceIndex !== undefined && pad.index !== deviceIndex) continue
      const atuador = (pad as Gamepad & { vibrationActuator?: unknown }).vibrationActuator as
        | { playEffect?: (type: string, params: unknown) => Promise<unknown> }
        | undefined
      if (typeof atuador?.playEffect !== 'function') continue
      try {
        const resultado = atuador.playEffect('dual-rumble', {
          startDelay: 0,
          duration: Math.max(0, durationMs),
          weakMagnitude: forca,
          strongMagnitude: forca * 0.8,
        })
        void resultado?.catch?.(() => {})
      } catch {
        // Controle sem suporte a vibracao: segue o jogo.
      }
    }
  }

  // ----------------------------------------------------------------- polling

  private ensureRunning(): void {
    if (this.running) return
    if (!GamepadManager.supported) return
    this.running = true
    this.rafId = requestAnimationFrame(this.poll)
  }

  private maybeStop(): void {
    if (this.signalHandlers.size || this.frameHandlers.size || this.devicesHandlers.size) return
    this.stop()
  }

  /** Para o polling e solta tudo que estava apertado. */
  stop(): void {
    if (!this.running) return
    this.running = false
    cancelAnimationFrame(this.rafId)
    for (const state of this.states.values()) this.releaseAll(state)
    this.states.clear()
    this.lastFrame = []
  }

  private poll = (): void => {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this.poll)

    const pads = navigator.getGamepads?.() ?? []
    const vistos = new Set<number>()
    const frame: GamepadLiveState[] = []
    let listaMudou = false

    for (const pad of pads) {
      if (!pad || !pad.connected) continue
      vistos.add(pad.index)

      let state = this.states.get(pad.index)
      if (!state || state.info.id !== pad.id) {
        if (state) this.releaseAll(state)
        state = {
          info: {
            index: pad.index,
            id: pad.id,
            identity: identifyGamepad(pad.id),
            standard: pad.mapping === 'standard',
            buttonCount: pad.buttons.length,
            axisCount: pad.axes.length,
          },
          held: new Set(),
          sampling: null,
        }
        this.states.set(pad.index, state)
        listaMudou = true
      }

      frame.push(this.readDevice(pad, state))
    }

    for (const [index, state] of [...this.states]) {
      if (vistos.has(index)) continue
      // Desconectou com o traste apertado: solta, senao a nota fica presa.
      this.releaseAll(state)
      this.states.delete(index)
      listaMudou = true
    }

    this.lastFrame = frame
    if (listaMudou) {
      const lista = this.devices()
      for (const handler of this.devicesHandlers) handler(lista)
    }
    for (const handler of this.frameHandlers) handler(frame)
  }

  private readDevice(pad: Gamepad, state: DeviceState): GamepadLiveState {
    const deadzone = this.config.deadzone
    const limiar = Math.max(0.15, Math.min(0.95, this.config.axisThreshold))
    const calibracao = this.config.calibration?.[pad.id] ?? identityCalibration(pad.axes.length)

    const buttons: number[] = []
    for (let i = 0; i < pad.buttons.length; i += 1) {
      const botao = pad.buttons[i]
      const valor = typeof botao.value === 'number' ? botao.value : botao.pressed ? 1 : 0
      buttons.push(valor)
      // Gatilhos analogicos (LT/RT) chegam como botao de valor continuo.
      this.edge(state, `b${i}`, botao.pressed || valor > 0.5)
    }

    const axesRaw: number[] = []
    const axes: number[] = []
    for (let i = 0; i < pad.axes.length; i += 1) {
      const cru = pad.axes[i]
      axesRaw.push(cru)
      if (state.sampling) {
        state.sampling.min[i] = Math.min(state.sampling.min[i], cru)
        state.sampling.max[i] = Math.max(state.sampling.max[i], cru)
      }
      const valor = normalizeAxis(
        cru,
        calibracao.center?.[i] ?? 0,
        calibracao.range?.[i] ?? 1,
        deadzone,
      )
      axes.push(valor)
      this.axisEdge(state, `a${i}+`, valor, limiar)
      this.axisEdge(state, `a${i}-`, -valor, limiar)
    }

    return { device: state.info, buttons, axesRaw, axes }
  }

  private axisEdge(state: DeviceState, signal: string, valor: number, limiar: number): void {
    const alvo = state.held.has(signal) ? limiar * RELEASE_RATIO : limiar
    this.edge(state, signal, valor >= alvo)
  }

  private edge(state: DeviceState, signal: string, pressed: boolean): void {
    if (state.held.has(signal) === pressed) return
    if (pressed) state.held.add(signal)
    else state.held.delete(signal)
    this.emit(state, signal, pressed)
  }

  private releaseAll(state: DeviceState): void {
    for (const signal of state.held) this.emit(state, signal, false)
    state.held.clear()
  }

  private emit(state: DeviceState, signal: string, pressed: boolean): void {
    const event: GamepadSignalEvent = {
      signal,
      pressed,
      deviceIndex: state.info.index,
      deviceId: state.info.id,
    }
    for (const handler of this.signalHandlers) handler(event)
  }
}

/**
 * Um unico leitor para o app inteiro.
 *
 * Dois pollings independentes leriam o mesmo hardware duas vezes por frame e,
 * pior, a tela de configuracoes e a partida discordariam sobre o que esta
 * apertado.
 */
export const gamepadManager = new GamepadManager()
