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

  return (
    <div className="gh-panel gh-score-panel">
      <div className="gh-screen">
        <div className="gh-digits">{formatNumber(score)}</div>
      </div>

      <div className={`gh-dial ${classe} ${starPowerActive ? 'sp' : ''}`}>
        {/* Anel de progresso: conic-gradient e barato e nao precisa de canvas. */}
        <div
          className="gh-dial-ring"
          style={{ ['--progresso' as string]: `${Math.round(comboProgress * 100)}%` }}
        />
        <div className="gh-dial-face">
          <span className="gh-dial-x">x</span>
          <span className="gh-dial-num">{multiplier}</span>
        </div>
      </div>

      <div className="gh-combo">{combo > 0 ? `${combo} COMBO` : ' '}</div>
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
