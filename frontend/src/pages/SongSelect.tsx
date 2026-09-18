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
import { backgroundStem } from '../game/backgroundPlaylist'
import { fetchCommunitySongs } from '../community/communitySongs'
import { CLOUD_ENABLED } from '../lib/supabase'

interface Props {
  onBack: () => void
  onSelect: (song: SongSummary) => void
  /** Abre a tela de envio. Ausente = sem conta ou sem nuvem. */
  onUpload?: () => void
}

type Aba = 'principais' | 'comunidade'

export function SongSelect({ onBack, onSelect, onUpload }: Props) {
  const settings = useSettings()
  const [library, setLibrary] = useState<LibraryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('principais')
  const [comunidade, setComunidade] = useState<SongSummary[] | null>(null)
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

  // A comunidade so e buscada quando a aba e aberta: quem joga so as proprias
  // musicas nao paga uma consulta ao banco por abrir a lista.
  useEffect(() => {
    if (aba !== 'comunidade' || comunidade !== null || !CLOUD_ENABLED) return
    void fetchCommunitySongs().then(setComunidade)
  }, [aba, comunidade])

  const songs = useMemo(
    () => (aba === 'comunidade' ? (comunidade ?? []) : (library?.songs ?? [])),
    [aba, comunidade, library],
  )

  // Trocar de aba precisa mover a selecao: o id da aba anterior nao existe aqui.
  useEffect(() => {
    setSelectedId((atual) =>
      songs.some((s) => s.id === atual) ? atual : (songs.find(isPlayable)?.id ?? null),
    )
  }, [songs])

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

    // `backgroundStem` em vez de `preview ?? song`: ha musicas sem os dois, so
    // com stems separados (bass/drums/guitar/vocals), e elas ficavam mudas.
    const url = resolveAssetUrl(backgroundStem(selected.assets.audio))
    if (!url) return

    const audio = new Audio(url)
    audio.volume = settings.volumes.master * settings.volumes.preview
    audio.preload = 'metadata'
    previewRef.current = audio

    const startAt = selected.previewStart || Math.min(30, selected.duration * 0.3)
    let comecou = false

    const tocar = () => {
      if (comecou) return
      comecou = true
      void audio.play().catch(() => undefined)
    }

    const onReady = () => {
      // O seek e o trecho bom da musica, entao vale tentar. Mas ele faz o
      // navegador pedir Range (HTTP 206), e em Ogg/Opus isso as vezes nao
      // conclui - por isso a falha aqui NAO pode impedir o play.
      try {
        if (startAt > 0 && Number.isFinite(audio.duration) && startAt < audio.duration) {
          audio.currentTime = startAt
        }
      } catch {
        // Segue do inicio: melhor do que silencio.
      }
      tocar()
    }

    audio.addEventListener('loadedmetadata', onReady, { once: true })
    // Rede de seguranca: se os metadados nunca chegarem (arquivo quebrado,
    // codec sem suporte), toca do inicio em vez de ficar mudo para sempre.
    const fallback = window.setTimeout(tocar, 900)

    return () => {
      window.clearTimeout(fallback)
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
        {CLOUD_ENABLED && (
          <div className="sl-tabs">
            <button
              className={`sl-tab ${aba === 'principais' ? 'ativa' : ''}`}
              onClick={() => {
                uiSounds.play('scroll')
                setAba('principais')
              }}
            >
              PRINCIPAIS
            </button>
            <button
              className={`sl-tab ${aba === 'comunidade' ? 'ativa' : ''}`}
              onClick={() => {
                uiSounds.play('scroll')
                setAba('comunidade')
              }}
            >
              COMUNIDADE
            </button>
            {onUpload && (
              <button
                className="sl-tab enviar"
                onClick={() => {
                  uiSounds.play('select')
                  onUpload()
                }}
              >
                + ENVIAR
              </button>
            )}
          </div>
        )}

        <div className="song-list-title">
          <span>
            {aba === 'comunidade'
              ? comunidade === null
                ? 'CARREGANDO...'
                : `${comunidade.length} MÚSICA(S) DA COMUNIDADE`
              : library
                ? `${library.count} MÚSICA(S)`
                : 'CARREGANDO...'}
          </span>
          {aba === 'principais' ? (
            <button className="sl-acao" onClick={() => load(true)}>RESCANE</button>
          ) : (
            <button className="sl-acao" onClick={() => setComunidade(null)}>ATUALIZAR</button>
          )}
        </div>

        {aba === 'comunidade' && comunidade?.length === 0 && (
          <div className="sl-vazio">
            Nenhuma música da comunidade ainda.
            {onUpload ? ' Seja o primeiro a enviar.' : ' Entre com uma conta para enviar a sua.'}
          </div>
        )}

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
