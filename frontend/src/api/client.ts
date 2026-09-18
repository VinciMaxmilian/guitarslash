import type { Chart } from '../game/types'
import { IS_HOST_MODE } from '../game/hostMode'
import type { LibraryResponse, SongSummary } from './types'

/**
 * Base da API.
 *
 * Vazio = mesma origem, que e exatamente o caso do modo host na LAN
 * (o backend serve o SPA) e tambem do dev com o proxy do Vite.
 * No deploy Netlify + Vercel, VITE_API_URL aponta para a Vercel.
 *
 * Em modo host, VITE_API_URL e IGNORADO de proposito: o mesmo frontend/dist
 * pode ter sido buildado para o Netlify (apontando para a Vercel), e a maquina
 * do host precisa servir a biblioteca dela mesma, funcionando offline.
 */
export const API_BASE = IS_HOST_MODE
  ? ''
  : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, init)
  } catch (error) {
    throw new ApiError(
      `Nao foi possivel falar com o backend em ${API_BASE || 'mesma origem'}. ` +
        'Verifique se ele esta rodando.',
      0,
    )
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(detail, response.status)
  }

  return (await response.json()) as T
}

/** Assets podem vir relativos (storage local) ou absolutos (CDN). */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE}${url}`
}

export const api = {
  /**
   * Chart de uma musica, venha ela da pasta local ou da comunidade.
   *
   * Os dois casos batem no MESMO parser no backend. Parsear MIDI no navegador
   * criaria um segundo parser, e chart lido diferente entre jogadores e
   * dessincronia na partida.
   */
  chartFor: (song: SongSummary, instrument: string, difficulty: string) =>
    song.source === 'community' && song.chartPath
      ? request<Chart>(
          `/api/community/chart?path=${encodeURIComponent(song.chartPath)}` +
            `&instrument=${encodeURIComponent(instrument)}` +
            `&difficulty=${encodeURIComponent(difficulty)}`,
        )
      : request<Chart>(
          `/api/songs/${encodeURIComponent(song.id)}/chart/${encodeURIComponent(instrument)}/${encodeURIComponent(difficulty)}`,
        ),

  inspectCommunityChart: (path: string) =>
    request<{ instruments: Record<string, unknown>; length: number }>(
      `/api/community/inspect?path=${encodeURIComponent(path)}`,
    ),

  library: () => request<LibraryResponse>('/api/songs'),
  rescan: () => request<LibraryResponse>('/api/songs/rescan', { method: 'POST' }),
  song: (songId: string) => request<SongSummary>(`/api/songs/${encodeURIComponent(songId)}`),
  chart: (songId: string, instrument: string, difficulty: string) =>
    request<Chart>(
      `/api/songs/${encodeURIComponent(songId)}/chart/${encodeURIComponent(instrument)}/${encodeURIComponent(difficulty)}`,
    ),
}
