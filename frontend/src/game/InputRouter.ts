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
}

/**
 * UM unico par de listeners no documento, para qualquer numero de jogadores.
 *
 * Usa `event.code` (posicao fisica da tecla) e nao `event.key`, para o
 * mapeamento nao depender do layout do teclado do jogador.
 */
export class InputRouter {
  private bindings: Binding[] = []
  private handler: ((event: InputEvent) => void) | null = null
  private attached = false
  private pressedCodes = new Set<string>()

  setBindings(playerId: number, keys: Record<string, GameAction>): void {
    const map = new Map<string, GameAction>()
    for (const [code, action] of Object.entries(keys)) {
      map.set(code, action)
    }
    const existing = this.bindings.find((b) => b.playerId === playerId)
    if (existing) existing.keys = map
    else this.bindings.push({ playerId, keys: map })
  }

  onInput(handler: (event: InputEvent) => void): void {
    this.handler = handler
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
  }

  private dispatch(code: string, pressed: boolean): boolean {
    if (!this.handler) return false
    let handled = false
    for (const binding of this.bindings) {
      const action = binding.keys.get(code)
      if (!action) continue
      this.handler({ playerId: binding.playerId, action, pressed })
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
