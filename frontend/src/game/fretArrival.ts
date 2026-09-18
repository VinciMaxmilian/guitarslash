/**
 * Chegada dos trastes na intro.
 *
 * Os trastes nao aparecem junto com a pista: cada um sobe do fundo, passa um
 * pouco do lugar e assenta - a leitura de "pulando" em vez de "surgindo".
 * Entram em sequencia, da esquerda para a direita.
 *
 * Tudo derivado do `reveal` da IntroSequence, que por sua vez vem do relogio
 * da musica. Nao ha contador proprio, entao a animacao nunca dessincroniza -
 * e um frame perdido nao deixa traste no lugar errado.
 */

/** Fracao do reveal entre a entrada de um traste e a do seguinte. */
const STAGGER = 0.1

/** Fracao do reveal que um traste leva para assentar. */
const SPAN = 0.46

/** Quanto o traste passa do lugar antes de voltar. Maior = pulo mais solto. */
const OVERSHOOT = 2.2

export interface FretArrival {
  /** 0 = ainda nao chegou, 1 = assentado. Pode passar de 1 no repique. */
  progress: number
  /** Deslocamento vertical em fracao do raio do traste. Negativo = acima. */
  offsetY: number
  /** Escala do traste. */
  scale: number
  alpha: number
}

/** Chegou no lugar com um repique, em vez de parar seco. */
function easeOutBack(t: number): number {
  const c = OVERSHOOT
  const p = t - 1
  return 1 + (c + 1) * p * p * p + c * p * p
}

/**
 * Estado de chegada de um traste.
 *
 * @param reveal 0..1 da IntroSequence
 * @param lane indice da lane, 0 a laneCount-1
 */
export function fretArrival(reveal: number, lane: number, laneCount: number): FretArrival {
  // Terminado o reveal, nada de resto de animacao: o traste esta no lugar.
  if (reveal >= 1) return { progress: 1, offsetY: 0, scale: 1, alpha: 1 }

  // Comprime a sequencia para caber inteira dentro do reveal, qualquer que
  // seja o numero de lanes.
  const ultima = Math.max(0, laneCount - 1)
  const total = ultima * STAGGER + SPAN
  const escala = total > 1 ? 1 / total : 1

  const inicio = lane * STAGGER * escala
  const fim = inicio + SPAN * escala

  if (reveal <= inicio) return { progress: 0, offsetY: 1, scale: 0.35, alpha: 0 }

  const bruto = Math.min(1, (reveal - inicio) / (fim - inicio))
  const progress = easeOutBack(bruto)

  return {
    progress,
    // Sobe do fundo; o overshoot leva o valor abaixo de zero e o traste
    // passa do lugar antes de assentar.
    offsetY: 1 - progress,
    scale: 0.35 + 0.65 * Math.min(1.12, progress),
    // Aparece rapido: se o alpha acompanhasse o pulo, o traste chegaria
    // apagado justamente no momento em que o olho vai nele.
    alpha: Math.min(1, bruto * 3),
  }
}
