export interface InstrumentInfo {
  available: boolean
  supported: boolean
  difficulties: string[]
  noteCounts: Record<string, number>
}

export interface SongAssets {
  cover: string | null
  backgroundVideo: string | null
  chart: string | null
  audio: Record<string, string>
}

export interface SongSummary {
  id: string
  title: string
  artist: string
  album: string | null
  year: string | null
  genre: string | null
  charter: string | null
  duration: number
  previewStart: number
  /** 'community' = veio do Supabase; ausente/'local' = pasta songs/. */
  source?: 'local' | 'community'
  /** Caminho do notes.mid no bucket. So em musica da comunidade. */
  chartPath?: string
  uploaderId?: string
  /** Nome de quem enviou. So em musica da comunidade. */
  uploaderName?: string | null
  /** ISO do envio. So em musica da comunidade; ordena "mais recentes". */
  createdAt?: string
  delay: number
  hasBackgroundVideo: boolean
  hasCover: boolean
  instruments: Record<string, InstrumentInfo>
  assets: SongAssets
  missing: string[]
}

export interface LibraryResponse {
  count: number
  songsDir: string | null
  storage: string
  songs: SongSummary[]
  errors: string[]
}

export const INSTRUMENT_LABELS: Record<string, string> = {
  guitar: 'Guitarra',
  guitar_coop: 'Guitarra (co-op)',
  rhythm: 'Base',
  bass: 'Baixo',
  drums: 'Bateria',
  keys: 'Teclado',
  vocals: 'Vocal',
}

export const INSTRUMENT_ICONS: Record<string, string> = {
  guitar: '🎸',
  guitar_coop: '🎸',
  rhythm: '🎸',
  bass: '🎸',
  drums: '🥁',
  keys: '🎹',
  vocals: '🎤',
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  expert: 'Expert',
}

export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'expert']
