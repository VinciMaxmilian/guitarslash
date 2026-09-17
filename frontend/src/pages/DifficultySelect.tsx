import { useEffect, useState } from 'react'
import '../styles/riff-riot.css'
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  type SongSummary,
} from '../api/types'
import { resolveAssetUrl } from '../api/client'
import { useUISounds } from '../hooks/useUISounds'

interface Props {
  song: SongSummary
  instrument: string
  onBack: () => void
  onSelect: (difficulty: string) => void
}

export function DifficultySelect({ song, instrument, onBack, onSelect }: Props) {
  const info = song.instruments[instrument]
  const available = DIFFICULTY_ORDER.filter((d) => info?.difficulties.includes(d))

  const options = available.map((difficulty) => ({
    id: difficulty,
    name: (DIFFICULTY_LABELS[difficulty] ?? difficulty).toUpperCase(),
    sub: `${info?.noteCounts?.[difficulty] ?? 0} OF 42 SONGS`,
    disabled: false,
  }))

  const [activeIdx, setActiveIdx] = useState(0)
  const uiSounds = useUISounds()

  useEffect(() => {
    if (options.length === 0) return
    const move = (direction: number) => {
      setActiveIdx((current) => (current + direction + options.length) % options.length)
      uiSounds.play('scroll')
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); move(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); move(-1)
      } else if (e.key === 'Enter') {
        e.preventDefault(); 
        uiSounds.play('select')
        onSelect(options[activeIdx].id)
      } else if (e.key === 'Escape') {
        e.preventDefault(); 
        uiSounds.play('back')
        onBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [options, activeIdx, onSelect, onBack, uiSounds])

  return (
    <div className="rr-screen screen-diff">
      <div className="diff-bg-1" />
      <div className="diff-bg-2" />
      
      <div className="diff-box-1">
        <div className="diff-box-1-text">GLAM</div>
      </div>
      <div className="diff-box-2" />
      <div className="diff-box-3" />
      <div className="diff-text-rock">ROCK</div>
      
      <div className="diff-tape-1" />
      <div className="diff-tape-2" />
      <div className="diff-tape-3" />

      {options.length === 0 ? (
        <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, fontSize: 24, fontFamily: "'Archivo Black', sans-serif"}}>
          NO DIFFICULTIES
        </div>
      ) : (
        <>
          <div className="diff-list-container">
            {options.map((opt, index) => (
              <div 
                key={opt.id} 
                className={`diff-item ${index === activeIdx ? 'active' : ''}`}
                onMouseEnter={() => setActiveIdx(index)}
                onClick={() => onSelect(opt.id)}
                style={{cursor: 'pointer'}}
              >
                <div className="diff-item-title">{opt.name}</div>
                <div className="diff-item-sub">{opt.sub}</div>
              </div>
            ))}
          </div>

          <div className="diff-poster">
            <div className="diff-poster-inner">
              {song.assets.cover ? (
                <img src={resolveAssetUrl(song.assets.cover)!} className="diff-poster-img" alt="" />
              ) : (
                <div className="diff-poster-text">DIFFICULTY<br/>POSTER ART</div>
              )}
            </div>
            <div className="diff-poster-bottom">
              <div className="diff-poster-h1">SELECT</div>
              <div className="diff-poster-h2">DIFFICULTY</div>
            </div>
          </div>
        </>
      )}

      <div className="rr-control-bar">
        <div className="rr-control-hint" onClick={() => options.length > 0 && onSelect(options[activeIdx].id)} style={{cursor: 'pointer'}}>
          <div className="rr-key green" />
          <span className="rr-control-label">SELECT</span>
        </div>
        <div className="rr-control-hint" onClick={onBack} style={{cursor: 'pointer'}}>
          <div className="rr-key red" />
          <span className="rr-control-label">BACK</span>
        </div>
        <div className="rr-control-hint">
          <div className="rr-key white" />
          <span className="rr-control-label">UP/DOWN</span>
        </div>
      </div>
    </div>
  )
}
