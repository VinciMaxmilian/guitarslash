import { useEffect, useMemo, useRef, useState } from 'react'

import { api, resolveAssetUrl } from '../api/client'
import {
  DIFFICULTY_LABELS,
  INSTRUMENT_ICONS,
  INSTRUMENT_LABELS,
  type LibraryResponse,
  type SongSummary,
} from '../api/types'
import { ControlBar } from '../components/ControlBar'
import { useSettings } from '../hooks/useSettings'
import { formatTime } from '../utils/format'

interface Props {
  onBack: () => void
  onSelect: (song: SongSummary) => void
}

/** Lista de músicas em papel envelhecido, no espírito das setlists de console. */
export function SongSelect({ onBack, onSelect }: Props) {
  const settings = useSettings()
  const [library, setLibrary] = useState<LibraryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const previewRef = useRef<HTMLAudioElement | null>(null)

  const load = async (rescan = false) => {
    setLoading(true)
    setError(null)
    try {
      const data = rescan ? await api.rescan() : await api.library()
      setLibrary(data)
      setSelectedId((current) => current ?? data.songs.find(isPlayable)?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return () => stopPreview(previewRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const songs = library?.songs ?? []

  const selected = useMemo(
    () => songs.find((song) => song.id === selectedId) ?? null,
    [songs, selectedId],
  )

  const play = (song: SongSummary | null) => {
    if (!song || !isPlayable(song)) return
    stopPreview(previewRef)
    onSelect(song)
  }

  // Navegacao por teclado, como num console.
  useEffect(() => {
    if (songs.length === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      const index = songs.findIndex((song) => song.id === selectedId)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + songs.length) % songs.length
        setSelectedId(songs[next].id)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        play(songs[index] ?? null)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onBack()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, selectedId])

  // Preview: toca um trecho curto da musica selecionada.
  useEffect(() => {
    stopPreview(previewRef)
    if (!selected) return

    const url = resolveAssetUrl(selected.assets.audio.preview ?? selected.assets.audio.song)
    if (!url) return

    const audio = new Audio(url)
    audio.volume = settings.volumes.master * settings.volumes.preview
    audio.preload = 'metadata'
    previewRef.current = audio

    const startAt = selected.previewStart || Math.min(30, selected.duration * 0.3)
    const onReady = () => {
      try {
        audio.currentTime = startAt
      } catch {
        // seek antes do metadata carregar: ignora e toca do inicio
      }
      void audio.play().catch(() => undefined)
    }
    audio.addEventListener('loadedmetadata', onReady, { once: true })

    return () => {
      audio.removeEventListener('loadedmetadata', onReady)
      stopPreview(previewRef)
    }
  }, [selected, settings.volumes.master, settings.volumes.preview])

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Setlist</h1>
          <div className="screen-subtitle">
            {library ? `${library.count} música(s) · ${library.storage}` : 'Carregando…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn small ghost" onClick={() => void load(true)} disabled={loading}>
            <span>Reescanear</span>
          </button>
          <button className="btn small ghost" onClick={onBack}>
            <span>Voltar</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="error-box">
          <strong>Não foi possível carregar a biblioteca.</strong>
          <br />
          {error}
        </div>
      )}

      {!error && library?.songs.length === 0 && <EmptyLibrary dir={library.songsDir} />}

      {songs.length > 0 && (
        <div className="song-layout">
          <div className="paper song-list scroll">
            {songs.map((song) => (
              <button
                key={song.id}
                className={[
                  'song-row',
                  song.id === selectedId ? 'selected' : '',
                  isPlayable(song) ? '' : 'broken',
                ].join(' ')}
                onClick={() => setSelectedId(song.id)}
                onDoubleClick={() => play(song)}
              >
                <span>
                  <span className="song-row-title">{song.title}</span>
                  <span className="song-row-artist">{song.artist}</span>
                </span>
                <span className="song-row-meta">
                  <span className="row-stars">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <span key={index} className={index < instrumentCount(song) ? 'on' : ''}>
                        ★
                      </span>
                    ))}
                  </span>
                  <br />
                  {formatTime(song.duration)}
                  <span className="small"> · {noteTotal(song)} notas</span>
                </span>
              </button>
            ))}
          </div>

          <div className="panel detail scroll">
            {selected ? (
              <SongDetail song={selected} onPlay={() => play(selected)} />
            ) : (
              <div className="empty">Selecione uma música à esquerda.</div>
            )}
          </div>
        </div>
      )}

      {library && library.errors.length > 0 && (
        <div className="error-box">
          Algumas pastas não puderam ser lidas:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {library.errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <ControlBar
        hints={[
          { key: '↑↓', label: 'Navegar', color: 'gold' },
          { key: '⏎', label: 'Tocar', color: 'green' },
          { key: 'Esc', label: 'Voltar', color: 'red' },
        ]}
      />
    </div>
  )
}

function SongDetail({ song, onPlay }: { song: SongSummary; onPlay: () => void }) {
  const playable = isPlayable(song)
  const instruments = Object.entries(song.instruments).filter(([, info]) => info.available)

  return (
    <>
      <div className="detail-head">
        <Cover song={song} />
        <div>
          <h2 className="detail-title">{song.title}</h2>
          <div className="detail-artist">{song.artist}</div>
          {song.album && <div className="screen-subtitle">{song.album}</div>}
        </div>
      </div>

      <div className="meta-grid">
        <Meta label="Duração" value={formatTime(song.duration)} />
        <Meta label="Ano" value={song.year ?? '—'} />
        <Meta label="Gênero" value={song.genre ?? '—'} />
        <Meta label="Charter" value={song.charter ?? '—'} />
      </div>

      <div>
        <div className="meta-label" style={{ marginBottom: 7 }}>
          Instrumentos
        </div>
        <div className="chip-row">
          {instruments.length === 0 && <span className="chip warn">nenhum chart jogável</span>}
          {instruments.map(([key, info]) => (
            <span key={key} className={`chip ${info.supported ? 'on' : 'warn'}`}>
              {INSTRUMENT_ICONS[key] ?? '🎵'} {INSTRUMENT_LABELS[key] ?? key}
              {info.supported
                ? ` · ${info.difficulties.map((d) => DIFFICULTY_LABELS[d] ?? d).join(', ')}`
                : ' · em breve'}
            </span>
          ))}
        </div>
      </div>

      <div className="chip-row">
        <span className={`chip ${song.hasBackgroundVideo ? 'on' : ''}`}>
          Vídeo: {song.hasBackgroundVideo ? '✓' : '—'}
        </span>
        <span className={`chip ${song.hasCover ? 'on' : ''}`}>
          Capa: {song.hasCover ? '✓' : '—'}
        </span>
      </div>

      {song.missing.length > 0 && (
        <div className="error-box">Arquivos ausentes: {song.missing.join(', ')}</div>
      )}

      <button
        className="btn primary"
        onClick={onPlay}
        disabled={!playable}
        style={{ justifySelf: 'start' }}
      >
        <span>{playable ? 'Play' : 'Indisponível'}</span>
      </button>
    </>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-item">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value}</div>
    </div>
  )
}

function Cover({ song }: { song: SongSummary }) {
  const url = resolveAssetUrl(song.assets.cover)
  if (!url) {
    return (
      <div className="cover" aria-hidden style={{ display: 'grid', placeItems: 'center', fontSize: 30 }}>
        🎸
      </div>
    )
  }
  return <img className="cover" src={url} alt="" loading="lazy" />
}

function EmptyLibrary({ dir }: { dir: string | null }) {
  return (
    <div className="paper empty" style={{ flex: 1 }}>
      <h2>Setlist vazia</h2>
      <p>
        Coloque cada música em uma subpasta de {dir ? <code>{dir}</code> : <code>songs/</code>},
        contendo pelo menos <code>song.ini</code>, <code>notes.mid</code> e um arquivo de áudio.
      </p>
      <p>
        Opcionais: <code>album.jpg</code> e <code>background.mp4</code>.
        <br />
        Depois clique em <strong>Reescanear</strong>.
      </p>
    </div>
  )
}

function instrumentCount(song: SongSummary): number {
  return Object.values(song.instruments).filter((info) => info.available && info.supported).length
}

function noteTotal(song: SongSummary): number {
  return Object.values(song.instruments).reduce((total, info) => {
    const counts = Object.values(info.noteCounts ?? {})
    return total + (counts.length ? Math.max(...counts) : 0)
  }, 0)
}

function isPlayable(song: SongSummary): boolean {
  const hasInstrument = Object.values(song.instruments).some(
    (info) => info.available && info.supported && info.difficulties.length > 0,
  )
  return hasInstrument && Object.keys(song.assets.audio).length > 0
}

function stopPreview(ref: React.MutableRefObject<HTMLAudioElement | null>): void {
  const audio = ref.current
  if (!audio) return
  audio.pause()
  audio.src = ''
  ref.current = null
}
