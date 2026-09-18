import { describe, expect, it } from 'vitest'

import { toWebSocketScheme } from './hostMode'

describe('toWebSocketScheme', () => {
  it('https vira wss', () => {
    expect(toWebSocketScheme('https://partidas.exemplo.com')).toBe(
      'wss://partidas.exemplo.com',
    )
  })

  it('http vira ws', () => {
    expect(toWebSocketScheme('http://localhost:8000')).toBe('ws://localhost:8000')
  })

  it('ws e wss passam intactos', () => {
    expect(toWebSocketScheme('wss://x.com')).toBe('wss://x.com')
    expect(toWebSocketScheme('ws://x.com')).toBe('ws://x.com')
  })

  it('preserva porta e caminho', () => {
    expect(toWebSocketScheme('https://x.com:8443/partida')).toBe('wss://x.com:8443/partida')
  })

  it('nao inventa esquema para valor sem protocolo', () => {
    expect(toWebSocketScheme('partidas.exemplo.com')).toBe('partidas.exemplo.com')
  })
})
