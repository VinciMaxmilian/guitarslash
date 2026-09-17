import type { Chart } from '../game/types'
import type { LibraryResponse, SongSummary } from './types'

/**
 * Base da API.
 *
 * Vazio = mesma origem, que e exatamente o caso do modo host na LAN
 * (o backend serve o SPA) e tambem do dev com o proxy do Vite.
 * No deploy Netlify + Vercel, VITE_API_URL aponta para a Vercel.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

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
  library: () => request<LibraryResponse>('/api/songs'),
  rescan: () => request<LibraryResponse>('/api/songs/rescan', { method: 'POST' }),
  song: (songId: string) => request<SongSummary>(`/api/songs/${encodeURIComponent(songId)}`),
  chart: (songId: string, instrument: string, difficulty: string) =>
    request<Chart>(
      `/api/songs/${encodeURIComponent(songId)}/chart/${encodeURIComponent(instrument)}/${encodeURIComponent(difficulty)}`,
    ),
}
