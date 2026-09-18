import type { MPHit } from './multiplayerProtocol'
import type { Chart, ChartNote } from './types'

/**
 * Faixa de um OPONENTE, em miniatura.
 *
 * A faixa nao viaja pela rede. Todo mundo toca a mesma musica, entao cada
 * cliente ja tem (ou busca) o chart do oponente e desenha localmente, usando o
 * proprio relogio. Pela rede vem so o que nao da para derivar: quais notas ele
 * acertou, e com que julgamento.
 *
 * Consequencia boa: a faixa espelho continua rolando lisa mesmo se a rede
 * engasgar. So as marcas de acerto atrasam alguns instantes.
 */

/** Janela visivel da miniatura, em segundos de musica. */
export const MINI_LOOK_AHEAD = 1.6

/** Quanto tempo a marca de acerto/erro fica brilhando. */
const FLASH_DURATION = 0.28

/** Tolerancia ao casar um acerto da rede com a nota do chart. */
const MATCH_TOLERANCE = 0.09

export type MiniJudgement = 'miss' | 'good' | 'great' | 'perfect'

const JUDGEMENTS: MiniJudgement[] = ['miss', 'good', 'great', 'perfect']

export interface MiniNote {
  time: number
  lane: number
  /** null = ainda nao resolvida. */
  judgement: MiniJudgement | null
  /** 0 = na hit line, 1 = no fundo da faixa. */
  progress: number
}

/**
 * Guarda o que o oponente acertou e responde o que desenhar agora.
 *
 * Uma instancia por oponente. `applyHits` recebe o que veio no placar
 * agregado; `visibleNotes` e chamado a cada frame.
 */
export class MiniHighwayState {
  /** tempo da nota (arredondado) -> julgamento, por lane. */
  private resolved = new Map<string, MiniJudgement>()
  private notes: ChartNote[] = []

  constructor(chart?: Chart) {
    if (chart) this.setChart(chart)
  }

  setChart(chart: Chart): void {
    // Ordenado por tempo: `visibleNotes` faz busca binaria em cima disto.
    this.notes = [...chart.notes].sort((a, b) => a.time - b.time)
    this.resolved.clear()
  }

  get noteCount(): number {
    return this.notes.length
  }

  private key(time: number, lane: number): string {
    // Casa por tempo arredondado: o chart do oponente e o mesmo arquivo, mas
    // o tempo vem em ms pela rede e volta para segundos aqui.
    return `${Math.round(time * 100)}:${lane}`
  }

  /** Aplica os acertos recebidos no placar agregado. */
  applyHits(hits: MPHit[] | undefined): void {
    if (!hits) return
    for (const [timeMs, lane, code] of hits) {
      const judgement = JUDGEMENTS[code] ?? 'miss'
      const time = timeMs / 1000
      const alvo = this.closestNote(time, lane)
      if (alvo) this.resolved.set(this.key(alvo.time, alvo.lane), judgement)
    }
  }

  /** Nota do chart mais proxima daquele tempo naquela lane. */
  private closestNote(time: number, lane: number): ChartNote | null {
    let melhor: ChartNote | null = null
    let menor = MATCH_TOLERANCE
    for (const note of this.notes) {
      if (note.time < time - MATCH_TOLERANCE) continue
      if (note.time > time + MATCH_TOLERANCE) break
      if (note.lane !== lane) continue
      const distancia = Math.abs(note.time - time)
      if (distancia <= menor) {
        menor = distancia
        melhor = note
      }
    }
    return melhor
  }

  judgementAt(time: number, lane: number): MiniJudgement | null {
    return this.resolved.get(this.key(time, lane)) ?? null
  }

  /**
   * Notas a desenhar agora.
   *
   * Inclui um pedaco do passado recente para o flash do acerto aparecer, e
   * `MINI_LOOK_AHEAD` segundos de futuro.
   */
  visibleNotes(songTime: number, lookAhead: number = MINI_LOOK_AHEAD): MiniNote[] {
    const inicio = songTime - FLASH_DURATION
    const fim = songTime + lookAhead
    const visiveis: MiniNote[] = []

    for (const note of this.notes) {
      if (note.time < inicio) continue
      if (note.time > fim) break
      visiveis.push({
        time: note.time,
        lane: note.lane,
        judgement: this.judgementAt(note.time, note.lane),
        progress: Math.max(0, (note.time - songTime) / lookAhead),
      })
    }
    return visiveis
  }

  /** Brilho 1..0 de uma nota ja resolvida; 0 quando o flash acabou. */
  flashFor(note: MiniNote, songTime: number): number {
    if (!note.judgement) return 0
    const idade = songTime - note.time
    if (idade < 0 || idade > FLASH_DURATION) return 0
    return 1 - idade / FLASH_DURATION
  }

  reset(): void {
    this.resolved.clear()
  }
}
