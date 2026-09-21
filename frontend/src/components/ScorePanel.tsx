import { GAME_CONFIG } from '../game/config'
import { formatNumber } from '../utils/format'

/**
 * Painel de score + multiplicador, no formato do jogo de referencia:
 * moldura escura, digitos verdes de LED em cima e um mostrador circular
 * embaixo com o multiplicador.
 *
 * O anel em volta do multiplicador nao e enfeite: ele mostra o quanto falta de
 * combo para o proximo degrau. Sem isso o jogador so descobre que subiu depois
 * que o numero muda.
 */

/** Cor por degrau do multiplicador. Fria no x1, quente no maximo. */
const CORES_MULTIPLICADOR: Record<number, string> = {
  1: 'mult-1',
  2: 'mult-2',
  3: 'mult-3',
  4: 'mult-4',
}

/** Quantos LEDs tem o medidor de combo, como no jogo de referencia. */
export const STREAK_LEDS = 5
/** Quantos LEDs tem o medidor de star power. */
export const STAR_POWER_LEDS = 6

/** Estado de um LED: apagado, meio aceso, aceso. */
export type LedFill = 0 | 1 | 2

/**
 * Reparte um progresso 0..1 numa fileira de LEDs que acendem por METADE.
 *
 * Acender por metade nao e enfeite: com 10 notas por degrau (ver
 * `multiplierSteps`) e 5 LEDs, cada nota acertada acende exatamente meia luz.
 * E o que deixa o jogador CONTAR quanto falta para o proximo multiplicador
 * sem tirar os olhos da pista.
 *
 * Se algum dia os degraus deixarem de ser de 10 notas, os LEDs continuam
 * proporcionais - so deixam de bater uma metade por nota.
 */
export function ledFill(progress: number, count: number): LedFill[] {
  const metades = Math.round(Math.min(1, Math.max(0, progress)) * count * 2)
  return Array.from({ length: count }, (_, index) => {
    const restante = metades - index * 2
    return (restante >= 2 ? 2 : restante === 1 ? 1 : 0) as LedFill
  })
}

export function multiplierClass(multiplier: number): string {
  // Star power dobra o multiplicador e pode passar do maximo dos degraus.
  const teto = GAME_CONFIG.score.maxMultiplier
  if (multiplier > teto) return 'mult-sp'
  return CORES_MULTIPLICADOR[multiplier] ?? 'mult-1'
}

interface Props {
  score: number
  multiplier: number
  /** 0..1 dentro do degrau atual. */
  comboProgress: number
  combo: number
  starPowerActive: boolean
}

export function ScorePanel({
  score,
  multiplier,
  comboProgress,
  combo,
  starPowerActive,
}: Props) {
  const classe = multiplierClass(multiplier)

  const leds = ledFill(comboProgress, STREAK_LEDS)
  // No teto do multiplicador nao ha proximo degrau a preencher: os LEDs ficam
  // todos acesos e param de contar, em vez de fingir um progresso que acabou.
  const noTeto = comboProgress >= 1 && multiplier >= GAME_CONFIG.score.maxMultiplier

  return (
    <div className="gh-panel gh-score-panel">
      <div className="gh-screen">
        <div className="gh-digits">{formatNumber(score)}</div>
      </div>

      {/* Coluna de LEDs a esquerda e o mostrador a direita: e o arranjo do
          jogo de referencia, e mantem os dois no campo de visao periferica de
          quem esta olhando para a hit line. */}
      <div className="gh-streak-row">
        <div className={`gh-streak ${classe} ${noTeto ? 'cheio' : ''}`}>
          {leds.map((fill, index) => (
            <span
              key={index}
              className={`gh-led ${fill === 2 ? 'on' : fill === 1 ? 'half' : ''}`}
            />
          ))}
        </div>

        <div className={`gh-dial ${classe} ${starPowerActive ? 'sp' : ''}`}>
          <div className="gh-dial-face">
            <span className="gh-dial-x">x</span>
            <span className="gh-dial-num">{multiplier}</span>
          </div>
        </div>
      </div>

      <div className="gh-combo">{combo > 0 ? `${combo} COMBO` : ' '}</div>
    </div>
  )
}

/**
 * Medidor de star power: seis LEDs azuis que enchem com a energia.
 *
 * A marca no terceiro LED e o ponto de ativacao (metade da barra). Sem ela o
 * jogador so descobre que da para ativar tentando.
 */
export function StarPowerMeter({ energy, active }: { energy: number; active: boolean }) {
  const leds = ledFill(energy, STAR_POWER_LEDS)
  const pronto = energy >= GAME_CONFIG.starPower.activationThreshold

  return (
    <div className={`gh-panel gh-sp ${active ? 'ativo' : pronto ? 'pronto' : ''}`}>
      <div className="gh-sp-leds">
        {leds.map((fill, index) => (
          <span
            key={index}
            className={`gh-sp-led ${fill === 2 ? 'on' : fill === 1 ? 'half' : ''}`}
            // Escalonado: aceso tudo ao mesmo tempo, o pulso vira um pisca-pisca.
            style={{ ['--atraso' as string]: `${index * 70}ms` }}
          />
        ))}
        <span className="gh-sp-marca" />
      </div>
      <div className="gh-sp-label">{active ? 'ATIVO' : pronto ? 'PRONTO' : 'STAR POWER'}</div>
    </div>
  )
}

/**
 * Medidor de desempenho, no formato do arco da referencia: zona vermelha a
 * esquerda, amarela no meio, verde a direita, com ponteiro.
 *
 * O valor e rolante (ver GAME_CONFIG.rockMeter), e nao a accuracy acumulada:
 * accuracy quase nao se move depois de algumas centenas de notas e o ponteiro
 * ficaria parado.
 */
export function RockMeter({ value }: { value: number }) {
  const clamped = Math.min(1, Math.max(0, value))
  // -90deg = fundo da zona vermelha, +90deg = topo da verde.
  const anguloPonteiro = -90 + clamped * 180
  const zona = clamped < 0.25 ? 'danger' : clamped < 0.5 ? 'warning' : 'good'

  return (
    <div className={`gh-panel gh-rock ${zona}`}>
      <div className="gh-rock-arc">
        <div className="gh-rock-zones" />
        <div
          className="gh-rock-needle"
          style={{ transform: `translateX(-50%) rotate(${anguloPonteiro}deg)` }}
        />
        <div className="gh-rock-hub" />
        <div className="gh-rock-label">ROCK</div>
      </div>
    </div>
  )
}
