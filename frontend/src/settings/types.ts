import type { GameAction } from '../game/types'

export type EffectsLevel = 'low' | 'medium' | 'high'

/**
 * Centro e amplitude uteis de cada eixo de um controle.
 *
 * Controle generico raramente devolve 0 com o stick parado, e quase nunca
 * alcanca 1 nos extremos. Sem isso, a zona morta ou come metade do curso ou
 * deixa o traste "apertado" sozinho.
 */
export interface AxisCalibration {
  /** Leitura crua com o stick em repouso, por eixo. */
  center: number[]
  /** Distancia do centro ate o extremo, por eixo. */
  range: number[]
}

export interface GamepadSettings {
  enabled: boolean
  /** `gamepad.id` do controle aceito, ou null para aceitar qualquer um. */
  deviceId: string | null
  /** Zona morta 0..0.9, aplicada ao valor JA normalizado pela calibracao. */
  deadzone: number
  /** A partir de quanto um eixo conta como botao apertado (0,15..0,95). */
  axisThreshold: number
  vibration: boolean
  /**
   * acao -> sinais do controle. String vazia = acao sem vinculo.
   *
   * Aceita alternativas com `|` ("b12|b13"): a palhetada precisa funcionar
   * tanto para cima quanto para baixo, como numa guitarra de verdade.
   */
  bindings: Record<GameAction, string>
  /** `gamepad.id` -> calibracao. Cada controle tem a sua. */
  calibration: Record<string, AxisCalibration>
}

export interface Settings {
  /** Usado para migrar configuracoes antigas sem quebrar o jogo. */
  version: number
  profileName: string
  /** Uma cor por lane, na ordem verde/vermelho/amarelo/azul/laranja. */
  noteColors: string[]
  /** acao -> event.code (posicao fisica da tecla). */
  keyBindings: Record<GameAction, string>
  gamepad: GamepadSettings
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
