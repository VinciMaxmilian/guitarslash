import { describe, expect, it } from 'vitest'

import pkg from '../package.json'
import { GAME_VERSION } from './version'

describe('GAME_VERSION', () => {
  it('vem do package.json, e nao de um numero escrito a mao', () => {
    // O rodape do menu mostra este valor. Se algum dia alguem passar a
    // escrever a versao dentro do src, os dois numeros vao divergir e a tela
    // vai mentir sobre o que esta rodando - e este teste quebra antes disso.
    expect(GAME_VERSION).toBe(pkg.version)
  })

  it('nao caiu no valor de emergencia', () => {
    // '0.0.0' e o que sobra quando o `define` do Vite nao rodou.
    expect(GAME_VERSION).not.toBe('0.0.0')
  })

  it('tem o formato maior.menor.correcao', () => {
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
