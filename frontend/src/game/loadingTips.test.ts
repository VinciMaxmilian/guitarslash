import { describe, expect, it } from 'vitest'

import { LOADING_TIPS, pickTip } from './loadingTips'

describe('pickTip', () => {
  it('devolve uma dica da lista', () => {
    expect(LOADING_TIPS).toContain(pickTip())
  })

  it('respeita o sorteio', () => {
    expect(pickTip(undefined, () => 0)).toBe(LOADING_TIPS[0])
    expect(pickTip(undefined, () => 0.999999)).toBe(LOADING_TIPS[LOADING_TIPS.length - 1])
  })

  it('nao repete a dica anterior', () => {
    const anterior = LOADING_TIPS[0]
    // Mesmo com o sorteio insistindo no indice 0, a anterior sai da lista.
    expect(pickTip(anterior, () => 0)).not.toBe(anterior)
  })

  it('nunca estoura o limite do array', () => {
    for (const r of [0, 0.5, 0.9999, 1]) {
      expect(pickTip(undefined, () => r)).toBeTypeOf('string')
      expect(pickTip(LOADING_TIPS[3], () => r)).toBeTypeOf('string')
    }
  })

  it('cobre a lista inteira ao longo de varios sorteios', () => {
    const vistas = new Set<string>()
    for (let i = 0; i < LOADING_TIPS.length; i += 1) {
      vistas.add(pickTip(undefined, () => i / LOADING_TIPS.length))
    }
    expect(vistas.size).toBe(LOADING_TIPS.length)
  })

  it('as dicas nao tem duplicata', () => {
    expect(new Set(LOADING_TIPS).size).toBe(LOADING_TIPS.length)
  })
})
