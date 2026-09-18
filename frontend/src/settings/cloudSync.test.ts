import { describe, expect, it } from 'vitest'

import { decideSync, fromCloudPayload, toCloudPayload } from './cloudSync'
import { DEFAULT_SETTINGS } from './SettingsStore'

describe('decideSync', () => {
  it('sem registro na nuvem, envia o local', () => {
    expect(decideSync(null, 1_700_000_000_000)).toBe('push')
    expect(decideSync(null, null)).toBe('push')
  })

  it('sem carimbo local, a nuvem ganha', () => {
    // Primeiro login neste navegador: e o que o jogador espera ao entrar na
    // conta em outro aparelho.
    expect(decideSync('2026-01-01T00:00:00Z', null)).toBe('pull')
  })

  it('o mais recente ganha', () => {
    const nuvem = '2026-06-01T00:00:00Z'
    const t = Date.parse(nuvem)
    expect(decideSync(nuvem, t - 60_000)).toBe('pull')
    expect(decideSync(nuvem, t + 60_000)).toBe('push')
  })

  it('empate nao escreve nada', () => {
    const nuvem = '2026-06-01T00:00:00Z'
    expect(decideSync(nuvem, Date.parse(nuvem))).toBe('nada')
  })

  it('data invalida na nuvem nao apaga o local', () => {
    expect(decideSync('nao-e-data', 1_700_000_000_000)).toBe('push')
  })
})

describe('toCloudPayload', () => {
  it('nao envia keyBindings', () => {
    // Mapeamento de teclado e por aparelho: sobrescrever deixaria o jogador
    // sem controle no outro.
    expect(toCloudPayload(DEFAULT_SETTINGS)).not.toHaveProperty('keyBindings')
  })

  it('envia o que e de perfil', () => {
    const p = toCloudPayload(DEFAULT_SETTINGS)
    expect(p).toHaveProperty('profileName')
    expect(p).toHaveProperty('calibration')
    expect(p).toHaveProperty('volumes')
    expect(p).toHaveProperty('noteColors')
  })

  it('nao muta o objeto original', () => {
    const antes = JSON.stringify(DEFAULT_SETTINGS)
    toCloudPayload(DEFAULT_SETTINGS)
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(antes)
  })
})

describe('fromCloudPayload', () => {
  it('devolve patch sem os campos locais', () => {
    const patch = fromCloudPayload({
      profileName: 'Ana',
      keyBindings: { strum: 'KeyZ' },
      version: 99,
    })
    expect(patch).toEqual({ profileName: 'Ana' })
  })

  it('lixo na nuvem nao vira patch', () => {
    expect(fromCloudPayload(null)).toBeNull()
    expect(fromCloudPayload('texto')).toBeNull()
    expect(fromCloudPayload(42)).toBeNull()
    expect(fromCloudPayload([1, 2])).toBeNull()
  })

  it('payload que so tinha campos locais nao vira patch', () => {
    expect(fromCloudPayload({ keyBindings: {}, version: 1 })).toBeNull()
  })

  it('ida e volta preserva o que e de perfil', () => {
    const patch = fromCloudPayload(toCloudPayload(DEFAULT_SETTINGS))
    expect(patch?.profileName).toBe(DEFAULT_SETTINGS.profileName)
    expect(patch?.calibration).toEqual(DEFAULT_SETTINGS.calibration)
  })
})
