import type { GameAction } from './types'

/**
 * Identificacao e rotulos dos controles.
 *
 * Fica separado do GamepadManager porque e logica PURA: recebe a string de
 * `gamepad.id` e devolve nomes. Assim da para testar sem navegador, e a tela
 * de configuracoes usa as mesmas regras que a engine.
 */

export type GamepadProfile = 'xbox' | 'dualshock3' | 'dualshock4' | 'dualsense' | 'generic'

export interface GamepadIdentity {
  profile: GamepadProfile
  /** Nome curto para mostrar ao jogador. */
  label: string
  vendor: string | null
  product: string | null
}

/** Familia de rotulos: os botoes da Sony e da Microsoft tem nomes diferentes. */
type Family = 'xbox' | 'playstation' | 'generic'

const SONY = '054c'
const MICROSOFT = '045e'

const SONY_PRODUCTS: Record<string, GamepadProfile> = {
  '0268': 'dualshock3', // DualShock 3 / SIXAXIS
  '05c4': 'dualshock4', // DS4 primeira revisao
  '09cc': 'dualshock4', // DS4 segunda revisao
  '0ba0': 'dualshock4', // dongle USB do DS4
  '0ce6': 'dualsense', // DualSense (PS5)
  '0df2': 'dualsense', // DualSense Edge
}

const PROFILE_LABELS: Record<GamepadProfile, string> = {
  xbox: 'Controle Xbox',
  dualshock3: 'DualShock 3 (PS3)',
  dualshock4: 'DualShock 4 (PS4)',
  dualsense: 'DualSense (PS5)',
  generic: 'Controle genérico',
}

/**
 * Vendor/product a partir do `id`, que cada navegador escreve de um jeito.
 *
 * Chrome/Edge: "... (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"
 * Firefox:     "054c-09cc-Wireless Controller"
 */
export function parseVendorProduct(id: string): { vendor: string | null; product: string | null } {
  const chrome = /vendor:\s*([0-9a-f]{4}).*?product:\s*([0-9a-f]{4})/i.exec(id)
  if (chrome) return { vendor: chrome[1].toLowerCase(), product: chrome[2].toLowerCase() }

  const firefox = /^\s*([0-9a-f]{4})-([0-9a-f]{4})\b/i.exec(id)
  if (firefox) return { vendor: firefox[1].toLowerCase(), product: firefox[2].toLowerCase() }

  return { vendor: null, product: null }
}

export function identifyGamepad(id: string): GamepadIdentity {
  const { vendor, product } = parseVendorProduct(id)

  let profile: GamepadProfile = 'generic'
  if (vendor === SONY) {
    // Produto desconhecido da Sony cai no DS4: e o layout mais proximo.
    profile = (product && SONY_PRODUCTS[product]) || 'dualshock4'
  } else if (vendor === MICROSOFT) {
    profile = 'xbox'
  } else if (/dualsense|ps5/i.test(id)) {
    profile = 'dualsense'
  } else if (/dualshock\s*4|ps4/i.test(id)) {
    profile = 'dualshock4'
  } else if (/dualshock\s*3|sixaxis|ps3/i.test(id)) {
    profile = 'dualshock3'
  } else if (/xbox|xinput/i.test(id)) {
    profile = 'xbox'
  } else if (/wireless controller/i.test(id)) {
    // Ultimo recurso: e assim que o DS4 se apresenta quando nao ha fabricante
    // no id. Fica DEPOIS do Xbox, senao "Xbox Wireless Controller" cairia aqui.
    profile = 'dualshock4'
  }

  return { profile, label: PROFILE_LABELS[profile], vendor, product }
}

export function familyOf(profile: GamepadProfile): Family {
  if (profile === 'xbox') return 'xbox'
  if (profile === 'generic') return 'generic'
  return 'playstation'
}

const XBOX_BUTTONS = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
  'Back', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Guia',
]

const PS_BUTTONS = [
  '✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2',
  'Select', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'PS',
]

const STICK_NAMES = ['Stick Esq.', 'Stick Esq.', 'Stick Dir.', 'Stick Dir.']

/**
 * Nome do botao.
 *
 * `standard` e o `gamepad.mapping === 'standard'`. Sem ele a ordem dos botoes
 * e do fabricante e NAO da especificacao - chamar o botao 0 de "A" seria
 * mentira. E o caso comum do DualShock 3 e dos controles genericos.
 */
export function buttonLabel(index: number, profile: GamepadProfile, standard: boolean): string {
  if (!standard) return `Botão ${index + 1}`
  const family = familyOf(profile)
  const table = family === 'xbox' ? XBOX_BUTTONS : family === 'playstation' ? PS_BUTTONS : null
  return table?.[index] ?? `Botão ${index + 1}`
}

export function axisLabel(
  index: number,
  direction: '+' | '-',
  _profile: GamepadProfile,
  standard: boolean,
): string {
  if (!standard) return `Eixo ${index + 1} ${direction === '+' ? '+' : '−'}`
  const name = STICK_NAMES[index]
  if (!name) return `Eixo ${index + 1} ${direction === '+' ? '+' : '−'}`
  // Eixos pares sao horizontais; nos verticais, negativo e para CIMA.
  const seta = index % 2 === 0 ? (direction === '+' ? '→' : '←') : direction === '+' ? '↓' : '↑'
  return `${name} ${seta}`
}

/** `b3` -> botao 3; `a1-` -> eixo 1 no sentido negativo. */
export function isValidSignal(signal: string): boolean {
  return /^b\d{1,2}$/.test(signal) || /^a\d{1,2}[+-]$/.test(signal)
}

/** Um vinculo pode ter alternativas: "b12|b13" = qualquer um dos dois. */
export function parseSignals(expr: string | null | undefined): string[] {
  if (!expr) return []
  return expr
    .split('|')
    .map((s) => s.trim())
    .filter((s) => isValidSignal(s))
}

export function signalLabel(signal: string, profile: GamepadProfile, standard: boolean): string {
  const botao = /^b(\d{1,2})$/.exec(signal)
  if (botao) return buttonLabel(Number(botao[1]), profile, standard)
  const eixo = /^a(\d{1,2})([+-])$/.exec(signal)
  if (eixo) return axisLabel(Number(eixo[1]), eixo[2] as '+' | '-', profile, standard)
  return signal
}

/** Rotulo do vinculo inteiro, com as alternativas. */
export function bindingLabel(
  expr: string | null | undefined,
  profile: GamepadProfile,
  standard: boolean,
): string {
  const sinais = parseSignals(expr)
  if (sinais.length === 0) return '—'
  return sinais.map((s) => signalLabel(s, profile, standard)).join(' / ')
}

/**
 * Mapeamento padrao, pensado para o layout `standard` do navegador.
 *
 * Os quatro primeiros trastes ficam nos ombros e gatilhos, de fora para
 * dentro: L2 verde, L1 vermelho, R1 amarelo, R2 azul. Os dois indicadores e
 * os dois medios cobrem quatro trastes sem sair do lugar, e a ordem acompanha
 * a da highway - o verde na ponta esquerda, o azul na direita. O laranja, que
 * e o menos usado, sobra para o polegar direito na bolinha.
 *
 * A palhetada aceita cima OU baixo do D-pad, como num controle de guitarra de
 * verdade, e o star power foi para o triangulo: e o botao de acao mais longe
 * da bolinha, entao nao da para ativar sem querer no lugar do laranja.
 */
export const DEFAULT_GAMEPAD_BINDINGS: Record<GameAction, string> = {
  fret0: 'b6', // L2 / LT
  fret1: 'b4', // L1 / LB
  fret2: 'b5', // R1 / RB
  fret3: 'b7', // R2 / RT
  fret4: 'b1', // ○ / B
  strum: 'b12|b13', // D-pad ↑ ou ↓
  starPower: 'b3', // △ / Y
  pause: 'b9', // Options / Start
}
