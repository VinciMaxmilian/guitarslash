import type { GameAction } from '../game/types'

export type EffectsLevel = 'low' | 'medium' | 'high'

export interface Settings {
  /** Usado para migrar configuracoes antigas sem quebrar o jogo. */
  version: number
  profileName: string
  /** Uma cor por lane, na ordem verde/vermelho/amarelo/azul/laranja. */
  noteColors: string[]
  /** acao -> event.code (posicao fisica da tecla). */
  keyBindings: Record<GameAction, string>
  volumes: {
    master: number
    music: number
    effects: number
    video: number
    preview: number
  }
  calibration: {
    audioOffsetMs: number
    videoOffsetMs: number
  }
  gameplay: {
    /** 1 (lento) a 10 (rapido). */
    noteSpeed: number
    /**
     * false (padrao) = basta apertar o traste certo, sem palhetar.
     * true = a nota so conta com a palhetada, e palhetar no vazio quebra o combo.
     */
    requireStrum: boolean
    /** Corta o som do instrumento do jogador enquanto ele estiver errando. */
    muteOnMiss: boolean
    hitSounds: boolean
    showFps: boolean
    leftyFlip: boolean
  }
  visual: {
    effects: EffectsLevel
    videoOpacity: number
    videoBrightness: number
  }
}
