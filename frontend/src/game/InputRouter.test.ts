import { describe, expect, it } from 'vitest'

import { InputRouter } from './InputRouter'
import type { GameAction } from './types'
import type { InputEvent } from './InputRouter'

function criar() {
  const router = new InputRouter()
  const eventos: InputEvent[] = []
  router.onInput((event) => eventos.push(event))
  router.setGamepadBindings(0, {
    fret0: 'b0',
    fret1: 'b1',
    fret2: 'b3',
    fret3: 'b2',
    fret4: 'b4',
    strum: 'b12|b13',
    starPower: 'b5',
    pause: 'b9',
  } as Record<GameAction, string>)
  return { router, eventos }
}

describe('InputRouter - controle', () => {
  it('traduz sinal em acao', () => {
    const { router, eventos } = criar()
    router.dispatchSignal('b0', true)
    router.dispatchSignal('b0', false)
    expect(eventos).toEqual([
      { playerId: 0, action: 'fret0', pressed: true },
      { playerId: 0, action: 'fret0', pressed: false },
    ])
  })

  it('sinal sem vinculo nao vira acao', () => {
    const { router, eventos } = criar()
    expect(router.dispatchSignal('b7', true)).toBe(false)
    expect(eventos).toHaveLength(0)
  })

  it('alternativas disparam a mesma acao', () => {
    const { router, eventos } = criar()
    router.dispatchSignal('b12', true)
    router.dispatchSignal('b12', false)
    router.dispatchSignal('b13', true)
    router.dispatchSignal('b13', false)
    expect(eventos.filter((e) => e.action === 'strum')).toHaveLength(4)
  })

  it('duas alternativas juntas contam como UMA palhetada', () => {
    // Segurar cima e baixo e soltar so um nao pode gerar uma palhetada nova
    // nem soltar a nota longa antes da hora.
    const { router, eventos } = criar()
    router.dispatchSignal('b12', true)
    router.dispatchSignal('b13', true)
    router.dispatchSignal('b12', false)
    expect(eventos).toEqual([{ playerId: 0, action: 'strum', pressed: true }])
    router.dispatchSignal('b13', false)
    expect(eventos).toHaveLength(2)
    expect(eventos[1].pressed).toBe(false)
  })

  it('controles diferentes nao derrubam o traste um do outro', () => {
    const { router, eventos } = criar()
    router.dispatchSignal('b0', true, 0)
    router.dispatchSignal('b0', true, 1)
    router.dispatchSignal('b0', false, 0)
    expect(eventos).toEqual([{ playerId: 0, action: 'fret0', pressed: true }])
    router.dispatchSignal('b0', false, 1)
    expect(eventos[1]).toEqual({ playerId: 0, action: 'fret0', pressed: false })
  })

  it('desconectar solta o que o controle segurava', () => {
    const { router, eventos } = criar()
    router.dispatchSignal('b0', true, 1)
    router.releaseDevice(1)
    expect(eventos[1]).toEqual({ playerId: 0, action: 'fret0', pressed: false })
  })

  it('soltar sem ter apertado nao emite nada', () => {
    const { router, eventos } = criar()
    router.dispatchSignal('b0', false)
    expect(eventos).toHaveLength(0)
  })

  it('toque e controle no mesmo traste nao brigam', () => {
    const { router, eventos } = criar()
    router.dispatchAction(0, 'fret0', true)
    router.dispatchSignal('b0', true)
    expect(eventos).toHaveLength(1)
    router.dispatchSignal('b0', false)
    expect(eventos).toHaveLength(1)
    router.dispatchAction(0, 'fret0', false)
    expect(eventos[1].pressed).toBe(false)
  })

  it('remapear substitui o mapa antigo', () => {
    const { router, eventos } = criar()
    router.setGamepadBindings(0, { fret0: 'b9' } as Record<GameAction, string>)
    expect(router.dispatchSignal('b0', true)).toBe(false)
    router.dispatchSignal('b9', true)
    expect(eventos).toEqual([{ playerId: 0, action: 'fret0', pressed: true }])
  })
})
