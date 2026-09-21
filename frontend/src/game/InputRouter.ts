import { parseSignals } from './gamepadProfiles'
import type { GameAction } from './types'

export interface InputEvent {
  playerId: number
  action: GameAction
  pressed: boolean
}

interface Binding {
  playerId: number
  /** codigo fisico (event.code) -> acao */
  keys: Map<string, GameAction>
  /** sinal do controle (`b0`, `a1-`) -> acoes */
  pad: Map<string, GameAction[]>
}

/**
 * UM unico par de listeners no documento, para qualquer numero de jogadores.
 *
 * Usa `event.code` (posicao fisica da tecla) e nao `event.key`, para o
 * mapeamento nao depender do layout do teclado do jogador.
 *
 * Teclado, controle e toque entram TODOS pelo mesmo caminho, e o router conta
 * quantas origens seguram cada acao. Sem essa contagem, quem segura o traste
 * verde no controle e encosta na tecla A soltaria o traste ao largar apenas
 * uma das duas - a nota longa morreria no meio sem motivo visivel.
 */
export class InputRouter {
  private bindings: Binding[] = []
  private handler: ((event: InputEvent) => void) | null = null
  private attached = false
  private pressedCodes = new Set<string>()
  /** `playerId:acao` -> origens que a seguram (`key:KeyA`, `pad0:b3`, `touch`). */
  private holds = new Map<string, Set<string>>()

  setBindings(playerId: number, keys: Record<string, GameAction>): void {
    const map = new Map<string, GameAction>()
    for (const [code, action] of Object.entries(keys)) {
      map.set(code, action)
    }
    this.binding(playerId).keys = map
  }

  /** acao -> sinais do controle, com alternativas separadas por `|`. */
  setGamepadBindings(playerId: number, bindings: Record<GameAction, string>): void {
    const map = new Map<string, GameAction[]>()
    for (const [action, expr] of Object.entries(bindings) as [GameAction, string][]) {
      for (const signal of parseSignals(expr)) {
        const lista = map.get(signal)
        if (lista) lista.push(action)
        else map.set(signal, [action])
      }
    }
    this.binding(playerId).pad = map
  }

  onInput(handler: (event: InputEvent) => void): void {
    this.handler = handler
  }

  /**
   * Entrada que nao vem do teclado nem do controle (toque na tela).
   *
   * Entra pelo MESMO caminho das teclas, entao o julgamento da nota nao sabe
   * de onde veio o comando - dedo, tecla e botao sao tratados igual.
   */
  dispatchAction(playerId: number, action: GameAction, pressed: boolean): void {
    this.hold(playerId, action, 'touch', pressed)
  }

  /**
   * Sinal cru do controle, ja como borda (apertou/soltou).
   *
   * O indice do aparelho entra na origem, e nao no sinal: dois controles
   * plugados podem segurar o mesmo traste sem um derrubar o outro.
   */
  dispatchSignal(signal: string, pressed: boolean, deviceIndex = 0): boolean {
    if (!this.handler) return false
    let handled = false
    for (const binding of this.bindings) {
      const actions = binding.pad.get(signal)
      if (!actions) continue
      for (const action of actions) {
        this.hold(binding.playerId, action, `pad${deviceIndex}:${signal}`, pressed)
      }
      handled = true
    }
    return handled
  }

  /** Solta tudo que um controle estava segurando (desconectou, perdeu foco). */
  releaseDevice(deviceIndex: number): void {
    this.releaseSources((source) => source.startsWith(`pad${deviceIndex}:`))
  }

  attach(): void {
    if (this.attached) return
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    this.attached = true
  }

  detach(): void {
    if (!this.attached) return
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.attached = false
    this.pressedCodes.clear()
    this.holds.clear()
  }

  private binding(playerId: number): Binding {
    const existing = this.bindings.find((b) => b.playerId === playerId)
    if (existing) return existing
    const novo: Binding = { playerId, keys: new Map(), pad: new Map() }
    this.bindings.push(novo)
    return novo
  }

  /**
   * Conta as origens e so avisa o jogo nas bordas reais: a primeira que aperta
   * e a ultima que solta.
   */
  private hold(playerId: number, action: GameAction, source: string, pressed: boolean): void {
    if (!this.handler) return
    const key = `${playerId}:${action}`
    let sources = this.holds.get(key)
    if (!sources) {
      sources = new Set()
      this.holds.set(key, sources)
    }

    if (pressed) {
      const vazio = sources.size === 0
      sources.add(source)
      if (vazio) this.handler({ playerId, action, pressed: true })
      return
    }

    if (!sources.delete(source)) return
    if (sources.size === 0) this.handler({ playerId, action, pressed: false })
  }

  private releaseSources(matches: (source: string) => boolean): void {
    for (const [key, sources] of this.holds) {
      const alvos = [...sources].filter(matches)
      if (alvos.length === 0) continue
      const [playerId, action] = key.split(':') as [string, GameAction]
      for (const source of alvos) {
        this.hold(Number(playerId), action, source, false)
      }
    }
  }

  private dispatch(code: string, pressed: boolean): boolean {
    if (!this.handler) return false
    let handled = false
    for (const binding of this.bindings) {
      const action = binding.keys.get(code)
      if (!action) continue
      this.hold(binding.playerId, action, `key:${code}`, pressed)
      handled = true
    }
    return handled
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // `repeat` do sistema operacional nao e palhetada nova.
    if (event.repeat || this.pressedCodes.has(event.code)) return
    if (this.dispatch(event.code, true)) {
      this.pressedCodes.add(event.code)
      event.preventDefault()
    }
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    this.pressedCodes.delete(event.code)
    if (this.dispatch(event.code, false)) {
      event.preventDefault()
    }
  }

  /** Perder o foco solta todas as teclas, senao o traste fica "preso". */
  private onBlur = (): void => {
    for (const code of this.pressedCodes) {
      this.dispatch(code, false)
    }
    this.pressedCodes.clear()
  }
}
