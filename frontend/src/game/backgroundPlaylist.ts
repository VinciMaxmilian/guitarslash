import type { SongSummary } from '../api/types'

/**
 * Escolha da musica de fundo dos menus.
 *
 * Existe separado do hook para poder ser testado: a regra de qual stem usar
 * tem casos que nao sao obvios e que ja quebraram a musica de fundo.
 */

/**
 * Ordem de preferencia dos stems.
 *
 * `preview` primeiro: e um trecho curto, feito justamente para isto, e pesa
 * pouco para baixar. Depois `song`, que e a base da musica.
 */
const PREFERRED_STEMS = ['preview', 'song'] as const

/**
 * URL do stem a usar, ou null se a musica nao tiver audio nenhum.
 *
 * O ultimo passo (qualquer stem) nao e detalhe: ha musicas SEM `song` - so
 * com bass, drums, guitar e vocals separados. Sem esse fallback elas ficavam
 * silenciosas no menu.
 */
export function backgroundStem(audio: Record<string, string> | undefined): string | null {
  if (!audio) return null

  for (const stem of PREFERRED_STEMS) {
    if (audio[stem]) return audio[stem]
  }

  // Ordena as chaves para a escolha ser estavel entre execucoes.
  const resto = Object.keys(audio).sort()
  for (const chave of resto) {
    if (audio[chave]) return audio[chave]
  }
  return null
}

export interface BackgroundTrack {
  songId: string
  title: string
  /** Caminho cru do stem; quem chama resolve para URL absoluta. */
  path: string
}

/**
 * Fila de musicas para o menu, embaralhada.
 *
 * Devolve uma FILA, e nao uma escolha unica, porque um arquivo pode falhar ao
 * carregar (codec, 404, rede) e o menu deve tentar a proxima em vez de ficar
 * em silencio.
 */
export function buildPlaylist(
  songs: readonly SongSummary[],
  random: () => number = Math.random,
): BackgroundTrack[] {
  const tocaveis: BackgroundTrack[] = []

  for (const song of songs) {
    const path = backgroundStem(song.assets?.audio)
    if (path) tocaveis.push({ songId: song.id, title: song.title, path })
  }

  // Fisher-Yates: embaralha sem vies e sem depender de sort instavel.
  for (let i = tocaveis.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const trocado = tocaveis[Math.min(j, i)]
    tocaveis[Math.min(j, i)] = tocaveis[i]
    tocaveis[i] = trocado
  }

  return tocaveis
}
