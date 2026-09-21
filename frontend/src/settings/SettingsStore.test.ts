import { describe, expect, it } from 'vitest'

import { DEFAULT_BINDINGS } from '../game/config'
import { DEFAULT_GAMEPAD_BINDINGS } from '../game/gamepadProfiles'
import { DEFAULT_SETTINGS, migrate, SettingsStore, validate } from './SettingsStore'

describe('validate', () => {
  it('repara cores invalidas mantendo as validas', () => {
    const settings = validate({
      ...DEFAULT_SETTINGS,
      noteColors: ['#123456', 'nao-e-cor', '', '#abcdef', '#000000'],
    })
    expect(settings.noteColors[0]).toBe('#123456')
    expect(settings.noteColors[1]).toBe(DEFAULT_SETTINGS.noteColors[1])
    expect(settings.noteColors[3]).toBe('#abcdef')
  })

  it('limita volumes ao intervalo 0..1', () => {
    const settings = validate({
      ...DEFAULT_SETTINGS,
      volumes: { ...DEFAULT_SETTINGS.volumes, master: 8, music: -3 },
    })
    expect(settings.volumes.master).toBe(1)
    expect(settings.volumes.music).toBe(0)
  })

  it('limita a calibracao a +/- 500 ms', () => {
    const settings = validate({
      ...DEFAULT_SETTINGS,
      calibration: { audioOffsetMs: 99999, videoOffsetMs: -99999 },
    })
    expect(settings.calibration.audioOffsetMs).toBe(500)
    expect(settings.calibration.videoOffsetMs).toBe(-500)
  })

  it('mantem noteSpeed dentro de 1..10 e inteiro', () => {
    expect(
      validate({ ...DEFAULT_SETTINGS, gameplay: { ...DEFAULT_SETTINGS.gameplay, noteSpeed: 42 } })
        .gameplay.noteSpeed,
    ).toBe(10)
    expect(
      validate({ ...DEFAULT_SETTINGS, gameplay: { ...DEFAULT_SETTINGS.gameplay, noteSpeed: 0 } })
        .gameplay.noteSpeed,
    ).toBe(1)
  })

  it('completa bindings ausentes com o padrao', () => {
    const settings = validate({
      ...DEFAULT_SETTINGS,
      keyBindings: { fret0: 'KeyZ' } as never,
    })
    expect(settings.keyBindings.fret0).toBe('KeyZ')
    expect(settings.keyBindings.strum).toBe(DEFAULT_BINDINGS.strum)
  })

  it('padrao e SEM exigir palhetada', () => {
    expect(DEFAULT_SETTINGS.gameplay.requireStrum).toBe(false)
    expect(validate({ ...DEFAULT_SETTINGS }).gameplay.requireStrum).toBe(false)
    // Config antiga, gravada antes da opcao existir, cai no padrao.
    expect(migrate({ gameplay: { noteSpeed: 6 } }).gameplay.requireStrum).toBe(false)
  })

  it('limpa sinais invalidos do controle sem devolver o padrao', () => {
    // Quem tirou o vinculo de proposito nao pode ganha-lo de volta sozinho.
    const settings = validate({
      ...DEFAULT_SETTINGS,
      gamepad: {
        ...DEFAULT_SETTINGS.gamepad,
        bindings: { ...DEFAULT_GAMEPAD_BINDINGS, fret0: 'KeyA|b7', starPower: '' },
      },
    })
    expect(settings.gamepad.bindings.fret0).toBe('b7')
    expect(settings.gamepad.bindings.starPower).toBe('')
  })

  it('limita zona morta e limiar do eixo', () => {
    const settings = validate({
      ...DEFAULT_SETTINGS,
      gamepad: { ...DEFAULT_SETTINGS.gamepad, deadzone: 9, axisThreshold: 0 },
    })
    expect(settings.gamepad.deadzone).toBe(0.9)
    expect(settings.gamepad.axisThreshold).toBe(0.15)
  })

  it('descarta calibracao sem numeros', () => {
    const settings = validate({
      ...DEFAULT_SETTINGS,
      gamepad: {
        ...DEFAULT_SETTINGS.gamepad,
        calibration: {
          bom: { center: [0, 0.2], range: [1, 0.8] },
          torto: { center: 'nao-e-lista', range: [1] } as never,
        },
      },
    })
    expect(settings.gamepad.calibration.bom.center).toEqual([0, 0.2])
    expect(settings.gamepad.calibration.torto).toBeUndefined()
  })

  it('config antiga, de antes do controle existir, ganha o padrao', () => {
    const settings = migrate({ profileName: 'Zeca' })
    expect(settings.gamepad.bindings).toEqual(DEFAULT_GAMEPAD_BINDINGS)
    expect(settings.gamepad.enabled).toBe(true)
  })

  it('rejeita nivel de efeitos desconhecido', () => {
    const settings = validate({
      ...DEFAULT_SETTINGS,
      visual: { ...DEFAULT_SETTINGS.visual, effects: 'ultra' as never },
    })
    expect(settings.visual.effects).toBe('high')
  })
})

describe('migrate', () => {
  it('devolve o padrao para lixo', () => {
    expect(migrate(null).version).toBe(DEFAULT_SETTINGS.version)
    expect(migrate('texto').profileName).toBe(DEFAULT_SETTINGS.profileName)
  })

  it('preserva o que existe e completa o resto', () => {
    const settings = migrate({ profileName: 'Zeca', gameplay: { noteSpeed: 8 } })
    expect(settings.profileName).toBe('Zeca')
    expect(settings.gameplay.noteSpeed).toBe(8)
    expect(settings.gameplay.hitSounds).toBe(DEFAULT_SETTINGS.gameplay.hitSounds)
    expect(settings.volumes.master).toBe(DEFAULT_SETTINGS.volumes.master)
  })
})

describe('SettingsStore', () => {
  it('faz merge parcial sem apagar as outras secoes', () => {
    const store = new SettingsStore()
    store.update({ gameplay: { noteSpeed: 9 } })
    const settings = store.get()
    expect(settings.gameplay.noteSpeed).toBe(9)
    expect(settings.gameplay.leftyFlip).toBe(DEFAULT_SETTINGS.gameplay.leftyFlip)
    expect(settings.volumes.master).toBe(DEFAULT_SETTINGS.volumes.master)
  })

  it('notifica os inscritos', () => {
    const store = new SettingsStore()
    let recebido = 0
    const unsubscribe = store.subscribe(() => recebido++)
    store.update({ profileName: 'Ana' })
    expect(recebido).toBe(1)
    unsubscribe()
    store.update({ profileName: 'Beto' })
    expect(recebido).toBe(1)
  })

  it('setNoteColor altera apenas a lane pedida', () => {
    const store = new SettingsStore()
    store.setNoteColor(2, '#ff00ff')
    expect(store.get().noteColors[2]).toBe('#ff00ff')
    expect(store.get().noteColors[0]).toBe(DEFAULT_SETTINGS.noteColors[0])
  })

  it('setGamepadBinding altera apenas a acao pedida', () => {
    const store = new SettingsStore()
    store.setGamepadBinding('fret0', 'b7')
    expect(store.get().gamepad.bindings.fret0).toBe('b7')
    expect(store.get().gamepad.bindings.strum).toBe(DEFAULT_GAMEPAD_BINDINGS.strum)
  })

  it('setGamepadCalibration guarda e apaga por controle', () => {
    const store = new SettingsStore()
    store.setGamepadCalibration('pad-a', { center: [0.1], range: [0.9] })
    store.setGamepadCalibration('pad-b', { center: [0], range: [1] })
    expect(Object.keys(store.get().gamepad.calibration)).toEqual(['pad-a', 'pad-b'])
    store.setGamepadCalibration('pad-a', null)
    expect(store.get().gamepad.calibration['pad-a']).toBeUndefined()
    expect(store.get().gamepad.calibration['pad-b']).toBeDefined()
  })

  it('setBinding altera apenas a acao pedida', () => {
    const store = new SettingsStore()
    store.setBinding('strum', 'ArrowDown')
    expect(store.get().keyBindings.strum).toBe('ArrowDown')
    expect(store.get().keyBindings.fret0).toBe(DEFAULT_BINDINGS.fret0)
  })

  it('reset volta tudo ao padrao', () => {
    const store = new SettingsStore()
    store.update({ profileName: 'Temp', gameplay: { noteSpeed: 10 } })
    store.reset()
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
  })
})
