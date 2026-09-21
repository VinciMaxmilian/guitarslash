import { describe, expect, it } from 'vitest'

import {
  DEFAULT_GAMEPAD_BINDINGS,
  bindingLabel,
  buttonLabel,
  identifyGamepad,
  isValidSignal,
  parseSignals,
  parseVendorProduct,
  signalLabel,
} from './gamepadProfiles'

describe('parseVendorProduct', () => {
  it('le o formato do Chrome', () => {
    expect(parseVendorProduct('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'))
      .toEqual({ vendor: '054c', product: '09cc' })
  })

  it('le o formato do Firefox', () => {
    expect(parseVendorProduct('054c-0ce6-DualSense Wireless Controller')).toEqual({
      vendor: '054c',
      product: '0ce6',
    })
  })

  it('devolve nulos quando o id nao tem os codigos', () => {
    expect(parseVendorProduct('Generic USB Joystick')).toEqual({ vendor: null, product: null })
  })
})

describe('identifyGamepad', () => {
  it('reconhece a familia PlayStation pelo produto', () => {
    expect(identifyGamepad('(Vendor: 054c Product: 0268)').profile).toBe('dualshock3')
    expect(identifyGamepad('(Vendor: 054c Product: 09cc)').profile).toBe('dualshock4')
    expect(identifyGamepad('(Vendor: 054c Product: 0ce6)').profile).toBe('dualsense')
  })

  it('produto desconhecido da Sony cai no DS4, nao no generico', () => {
    // O layout do DS4 e o mais proximo; virar generico apagaria os simbolos.
    expect(identifyGamepad('(Vendor: 054c Product: ffff)').profile).toBe('dualshock4')
  })

  it('reconhece Xbox pelo fabricante e pelo texto', () => {
    expect(identifyGamepad('(Vendor: 045e Product: 028e)').profile).toBe('xbox')
    expect(identifyGamepad('Xbox Wireless Controller').profile).toBe('xbox')
  })

  it('controle sem assinatura vira generico', () => {
    const identidade = identifyGamepad('USB Gamepad')
    expect(identidade.profile).toBe('generic')
    expect(identidade.label).toBe('Controle genérico')
  })
})

describe('buttonLabel', () => {
  it('usa os nomes de cada familia no layout padronizado', () => {
    expect(buttonLabel(0, 'xbox', true)).toBe('A')
    expect(buttonLabel(0, 'dualsense', true)).toBe('✕')
    expect(buttonLabel(3, 'xbox', true)).toBe('Y')
    expect(buttonLabel(3, 'dualshock4', true)).toBe('△')
  })

  it('fora do layout padronizado nao inventa nome', () => {
    // A ordem dos botoes e do fabricante: chamar o botao 0 de "A" seria mentira.
    expect(buttonLabel(0, 'xbox', false)).toBe('Botão 1')
    expect(buttonLabel(0, 'dualshock3', false)).toBe('Botão 1')
  })

  it('botao alem da tabela cai no numero', () => {
    expect(buttonLabel(30, 'xbox', true)).toBe('Botão 31')
  })
})

describe('signalLabel', () => {
  it('nomeia eixos pelo stick e pelo sentido', () => {
    expect(signalLabel('a0-', 'xbox', true)).toBe('Stick Esq. ←')
    expect(signalLabel('a1-', 'xbox', true)).toBe('Stick Esq. ↑')
    expect(signalLabel('a3+', 'xbox', true)).toBe('Stick Dir. ↓')
  })
})

describe('parseSignals', () => {
  it('aceita alternativas e descarta lixo', () => {
    expect(parseSignals('b12|b13')).toEqual(['b12', 'b13'])
    expect(parseSignals('b0|nao-existe|a1-')).toEqual(['b0', 'a1-'])
    expect(parseSignals('')).toEqual([])
    expect(parseSignals(null)).toEqual([])
  })

  it('valida o formato do sinal', () => {
    expect(isValidSignal('b0')).toBe(true)
    expect(isValidSignal('a10+')).toBe(true)
    expect(isValidSignal('a1')).toBe(false)
    expect(isValidSignal('KeyA')).toBe(false)
  })
})

describe('bindingLabel', () => {
  it('mostra as alternativas juntas', () => {
    expect(bindingLabel('b12|b13', 'xbox', true)).toBe('D-pad ↑ / D-pad ↓')
  })

  it('acao sem vinculo aparece como traco', () => {
    expect(bindingLabel('', 'xbox', true)).toBe('—')
  })
})

describe('DEFAULT_GAMEPAD_BINDINGS', () => {
  it('todos os sinais padrao sao validos', () => {
    for (const expr of Object.values(DEFAULT_GAMEPAD_BINDINGS)) {
      expect(parseSignals(expr).length).toBeGreaterThan(0)
    }
  })

  it('os trastes ficam nos ombros e gatilhos, na ordem da highway', () => {
    // L2 verde, L1 vermelho, R1 amarelo, R2 azul, bolinha laranja.
    const trastes = (['fret0', 'fret1', 'fret2', 'fret3', 'fret4'] as const).map(
      (a) => DEFAULT_GAMEPAD_BINDINGS[a],
    )
    expect(trastes).toEqual(['b6', 'b4', 'b5', 'b7', 'b1'])
    expect(trastes.map((s) => signalLabel(s, 'dualshock4', true))).toEqual([
      'L2',
      'L1',
      'R1',
      'R2',
      '○',
    ])
    expect(trastes.map((s) => signalLabel(s, 'xbox', true))).toEqual([
      'LT',
      'LB',
      'RB',
      'RT',
      'B',
    ])
  })

  it('a palhetada aceita cima e baixo do D-pad', () => {
    expect(parseSignals(DEFAULT_GAMEPAD_BINDINGS.strum)).toEqual(['b12', 'b13'])
  })

  it('o star power nao encosta no traste laranja', () => {
    // Bolinha e triangulo vizinhos seriam ativacao sem querer no meio da musica.
    expect(DEFAULT_GAMEPAD_BINDINGS.starPower).toBe('b3')
    expect(DEFAULT_GAMEPAD_BINDINGS.starPower).not.toBe(DEFAULT_GAMEPAD_BINDINGS.fret4)
  })

  it('nao ha botao repetido entre acoes diferentes', () => {
    const todos = Object.values(DEFAULT_GAMEPAD_BINDINGS).flatMap((e) => parseSignals(e))
    expect(new Set(todos).size).toBe(todos.length)
  })
})
