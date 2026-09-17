import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/riff-riot.css'
import { api, resolveAssetUrl } from '../api/client'
import {
  type LibraryResponse,
  type SongSummary,
} from '../api/types'
import { useSettings } from '../hooks/useSettings'
import { formatNumber } from '../utils/format'
import { useUISounds } from '../hooks/useUISounds'

interface Props {
  onBack: () => void
  onSelect: (song: SongSummary) => void
}

export function SongSelect({ onBack, onSelect }: Props) {
  const settings = useSettings()
  const [library, setLibrary] = useState<LibraryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const uiSounds = useUISounds()

  const load = async (rescan = false) => {
    setError(null)
    try {
      const data = rescan ? await api.rescan() : await api.library()
      setLibrary(data)
      setSelectedId((current) => current ?? data.songs.find(isPlayable)?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void load()
    return () => stopPreview(previewRef)
  }, [])

  const songs = library?.songs ?? []

  const selected = useMemo(
    () => songs.find((song) => song.id === selectedId) ?? null,
    [songs, selectedId],
  )

  const play = (song: SongSummary | null) => {
    if (!song || !isPlayable(song)) return
    uiSounds.play('select')
    stopPreview(previewRef)
    onSelect(song)
  }

  useEffect(() => {
    if (songs.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      const index = songs.findIndex((song) => song.id === selectedId)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        uiSounds.play('scroll')
        const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + songs.length) % songs.length
        setSelectedId(songs[next].id)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        play(songs[index] ?? null)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        uiSounds.play('back')
        onBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [songs, selectedId, uiSounds])

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
      try { audio.currentTime = startAt } catch {}
      void audio.play().catch(() => undefined)
    }
    audio.addEventListener('loadedmetadata', onReady, { once: true })

    return () => {
      audio.removeEventListener('loadedmetadata', onReady)
      stopPreview(previewRef)
    }
  }, [selected, settings.volumes.master, settings.volumes.preview])

  const playable = selected ? isPlayable(selected) : false

  return (
    <div className="rr-screen screen-songs">
      <div className="songs-bg-1" />
      <div className="songs-bg-2" />
      <div className="songs-edge" />
      
      {error && (
        <div className="error-box" style={{position: 'absolute', zIndex: 10}}>
          <strong>Erro:</strong> {error}
        </div>
      )}

      <div className="song-list-scroll">
        <div className="song-list-title">
          <span>{library ? `${library.count} MÚSICA(S)` : 'CARREGANDO...'}</span>
          <button style={{fontSize: 16, cursor: 'pointer', fontFamily: "'Archivo Black', sans-serif", color: '#7e8a75'}} onClick={() => load(true)}>RESCANE</button>
        </div>

        {songs.map((song) => (
          <div
            key={song.id}
            className={`song-row-item ${song.id === selectedId ? 'active' : ''} ${isPlayable(song) ? '' : 'broken'}`}
            onClick={() => setSelectedId(song.id)}
            onDoubleClick={() => play(song)}
          >
            <div>
              <div className="song-row-title">{song.title}</div>
              <div className="song-row-artist">{song.artist.toUpperCase()}</div>
            </div>
            <div className="song-row-stats">
              <div className="song-row-stars">
                {[0, 1, 2, 3, 4].map((index) => (
                  <span key={index} className={index < instrumentCount(song) ? 'on' : ''}>★</span>
                ))}
              </div>
              <div className="song-row-score">{formatNumber(noteTotal(song))}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="songs-crest">
        <div className="songs-crest-inner">
          {selected?.assets.cover ? (
             <img className="songs-crest-img" src={resolveAssetUrl(selected.assets.cover)!} alt="" />
          ) : (
            <div className="songs-crest-text">BAND<br/>CREST<br/>ART</div>
          )}
        </div>
      </div>

      <div className="rr-control-bar">
        <div className="rr-control-hint">
          <div className="rr-key white" />
          <span className="rr-control-label">BROWSE</span>
        </div>
        <div className="rr-control-hint" onClick={() => play(selected)} style={{cursor: playable ? 'pointer' : 'not-allowed'}}>
          <div className="rr-key green" />
          <span className="rr-control-label">SELECT</span>
        </div>
        <div className="rr-control-hint" onClick={onBack} style={{cursor: 'pointer'}}>
          <div className="rr-key red" />
          <span className="rr-control-label">BACK</span>
        </div>
        <div className="rr-control-hint">
          <div className="rr-key yellow" />
          <span className="rr-control-label">SETLIST</span>
        </div>
        <div className="rr-control-hint">
          <div className="rr-key orange" />
          <span className="rr-control-label">DOWNLOADS</span>
        </div>
      </div>
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
