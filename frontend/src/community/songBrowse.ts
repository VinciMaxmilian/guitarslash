import type { SongSummary } from '../api/types'

/**
 * Busca e ordenacao da lista de musicas.
 *
 * Puro de proposito: e a regra que decide o que o jogador ve, e ela tem casos
 * que erram feio em silencio - acento, maiuscula e musica sem chart legivel.
 */

export type SortMode = 'recentes' | 'alfabetica' | 'dificuldade'

export const SORT_LABELS: Record<SortMode, string> = {
  recentes: 'MAIS RECENTES',
  alfabetica: 'A - Z',
  dificuldade: 'DIFICULDADE',
}

/** Remove acento e caixa, para "Legião" casar com "legiao". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Filtra por titulo, artista, album ou charter.
 *
 * Busca por TODOS os termos (AND), em qualquer ordem: "stones black" acha
 * "The Rolling Stones - Paint It Black". Buscar a frase exata obrigaria o
 * jogador a lembrar a ordem das palavras.
 */
export function filterSongs(songs: readonly SongSummary[], query: string): SongSummary[] {
  const termos = normalize(query).split(/\s+/).filter(Boolean)
  if (termos.length === 0) return [...songs]

  return songs.filter((song) => {
    const alvo = normalize(
      [song.title, song.artist, song.album ?? '', song.charter ?? ''].join(' '),
    )
    return termos.every((termo) => alvo.includes(termo))
  })
}

/**
 * Dificuldade estimada: notas por segundo da dificuldade mais alta disponivel.
 *
 * Preferi isto ao `diff_guitar` do song.ini porque o campo do ini e subjetivo
 * (o charter escolhe), costuma faltar, e nao e comparavel entre charters. Notas
 * por segundo vem do chart de verdade e existe sempre.
 *
 * @returns 0 quando nao ha dado suficiente, e a musica vai para o fim da lista.
 */
export function difficultyScore(song: SongSummary): number {
  const duracao = song.duration
  if (!Number.isFinite(duracao) || duracao <= 0) return 0

  let maior = 0
  for (const info of Object.values(song.instruments ?? {})) {
    if (!info?.supported) continue
    // A API devolve camelCase; o pacote estatico do CDN pode trazer snake_case.
    const contagens =
      info.noteCounts ?? (info as unknown as { note_counts?: Record<string, number> }).note_counts
    for (const total of Object.values(contagens ?? {})) {
      if (Number.isFinite(total) && total > maior) maior = total
    }
  }

  return maior > 0 ? maior / duracao : 0
}

function compareTitle(a: SongSummary, b: SongSummary): number {
  // `localeCompare` com pt-BR ordena acento junto da letra base: "Ária" perto
  // de "Aria", e nao no fim do alfabeto.
  const titulo = normalize(a.title).localeCompare(normalize(b.title), 'pt-BR')
  return titulo !== 0 ? titulo : normalize(a.artist).localeCompare(normalize(b.artist), 'pt-BR')
}

export function sortSongs(songs: readonly SongSummary[], mode: SortMode): SongSummary[] {
  const lista = [...songs]

  if (mode === 'alfabetica') return lista.sort(compareTitle)

  if (mode === 'dificuldade') {
    return lista.sort((a, b) => {
      const diferenca = difficultyScore(b) - difficultyScore(a)
      // Empate (ou ambas sem dado) cai no alfabetico: ordem estavel e
      // previsivel vale mais que ordem arbitraria.
      return Math.abs(diferenca) > 1e-9 ? diferenca : compareTitle(a, b)
    })
  }

  // 'recentes': `createdAt` so existe na comunidade. Sem ele, mantem a ordem
  // que veio do servidor, que ja e a mais recente primeiro.
  return lista.sort((a, b) => {
    const ta = Date.parse(a.createdAt ?? '')
    const tb = Date.parse(b.createdAt ?? '')
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0
    if (!Number.isFinite(ta)) return 1
    if (!Number.isFinite(tb)) return -1
    return tb - ta
  })
}

/** Filtra e ordena numa passada. E o que a lista usa. */
export function browseSongs(
  songs: readonly SongSummary[],
  query: string,
  mode: SortMode,
): SongSummary[] {
  return sortSongs(filterSongs(songs, query), mode)
}
