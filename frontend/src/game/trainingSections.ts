import type { Chart } from './types'

/**
 * Trechos para treinar.
 *
 * O chart traz marcadores de secao (`[section Verse 1]` no MIDI), mas eles nao
 * bastam: nem todo chart tem, e o ultimo marcador nao diz onde termina. Aqui
 * os marcadores viram intervalos fechados, e o chart sem marcador nenhum e
 * fatiado em pedacos de tamanho fixo - senao "treinar" seria tocar a musica
 * inteira, o que e exatamente o que o treino deveria evitar.
 */

/** Tamanho dos trechos quando o chart nao tem marcador de secao. */
const FALLBACK_SECONDS = 20

/** Trecho curto demais nao da para praticar nada. */
const MIN_SECONDS = 4

export interface TrainingSection {
  name: string
  from: number
  to: number
  /** Quantas notas caem no trecho. Trecho sem nota nao serve. */
  noteCount: number
}

/** Velocidades oferecidas. Abaixo de 50% o audio fica irreconhecivel. */
export const TRAINING_RATES = [0.5, 0.6, 0.75, 0.9, 1] as const

function countNotes(chart: Chart, from: number, to: number): number {
  let total = 0
  for (const note of chart.notes) {
    if (note.time >= from && note.time < to) total += 1
  }
  return total
}

export function buildSections(chart: Chart): TrainingSection[] {
  const fim = Math.max(chart.length, chart.notes.at(-1)?.time ?? 0)
  if (fim <= 0) return []

  const marcadores = [...(chart.sections ?? [])]
    .filter((s) => Number.isFinite(s.time) && s.time >= 0)
    .sort((a, b) => a.time - b.time)

  const cruas: { name: string; from: number; to: number }[] = []

  if (marcadores.length > 0) {
    marcadores.forEach((marcador, indice) => {
      // O fim de uma secao e o inicio da seguinte; a ultima vai ate o fim.
      const proximo = marcadores[indice + 1]?.time ?? fim
      cruas.push({ name: marcador.name, from: marcador.time, to: proximo })
    })
    // Musica que comeca antes do primeiro marcador: o trecho inicial existe.
    if (marcadores[0].time > MIN_SECONDS) {
      cruas.unshift({ name: 'Início', from: 0, to: marcadores[0].time })
    }
  } else {
    // Sem marcador, fatia em pedacos iguais.
    const total = Math.ceil(fim / FALLBACK_SECONDS)
    for (let i = 0; i < total; i += 1) {
      const from = i * FALLBACK_SECONDS
      cruas.push({
        name: `Trecho ${i + 1}`,
        from,
        to: Math.min(fim, from + FALLBACK_SECONDS),
      })
    }
  }

  const trechos: TrainingSection[] = []
  for (const crua of cruas) {
    if (crua.to - crua.from < MIN_SECONDS) continue
    const noteCount = countNotes(chart, crua.from, crua.to)
    // Trecho sem nota nenhuma (intro instrumental, silencio) nao serve para
    // praticar: listar seria oferecer algo que nao exercita nada.
    if (noteCount === 0) continue
    trechos.push({ ...crua, noteCount })
  }

  return trechos
}

/** Trecho que cobre a musica inteira, para quem quer tocar tudo mais devagar. */
export function fullSection(chart: Chart): TrainingSection {
  const fim = Math.max(chart.length, chart.notes.at(-1)?.time ?? 0)
  return {
    name: 'Música inteira',
    from: 0,
    to: fim,
    noteCount: chart.notes.length,
  }
}
