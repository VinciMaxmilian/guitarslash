import { useEffect, useState } from 'react'
import '../styles/riff-riot.css'
import {
  DIFFICULTY_LABELS,
  INSTRUMENT_ICONS,
  INSTRUMENT_LABELS,
  type SongSummary,
} from '../api/types'
import { resolveAssetUrl } from '../api/client'
import { useUISounds } from '../hooks/useUISounds'

interface Props {
  song: SongSummary
  onBack: () => void
  onSelect: (instrument: string) => void
}

export function InstrumentSelect({ song, onBack, onSelect }: Props) {
  const options = Object.entries(song.instruments)
    .filter(([, info]) => info.available)
    .map(([key, info]) => {
      const playable = info.supported && info.difficulties.length > 0
      return {
        id: key,
        name: (INSTRUMENT_LABELS[key] ?? key).toUpperCase(),
        sub: playable
          ? info.difficulties.map((d) => DIFFICULTY_LABELS[d] ?? d).join(' OF ') + ' SONGS'
          : '0 OF 42 SONGS',
        disabled: !playable,
      }
    })

  const firstEnabled = options.findIndex((opt) => !opt.disabled)
  const [activeIdx, setActiveIdx] = useState(Math.max(0, firstEnabled))
  const uiSounds = useUISounds()

  useEffect(() => {
    if (options.length === 0) return
    const move = (direction: number) => {
      setActiveIdx((current) => {
        for (let step = 1; step <= options.length; step++) {
          const next = (current + direction * step + options.length * step) % options.length
          if (!options[next]?.disabled) return next
        }
        return current
      })
      uiSounds.play('scroll')
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); move(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); move(-1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (!options[activeIdx]?.disabled) {
          uiSounds.play('select')
          onSelect(options[activeIdx].id)
        }
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
          INSTRUMENT NOT AVAILABLE
        </div>
      ) : (
        <>
          <div className="diff-list-container">
            {options.map((opt, index) => (
              <div 
                key={opt.id} 
                className={`diff-item ${index === activeIdx ? 'active' : ''}`}
                style={{ opacity: opt.disabled ? 0.4 : 1, cursor: opt.disabled ? 'not-allowed' : 'pointer' }}
                onMouseEnter={() => !opt.disabled && setActiveIdx(index)}
                onClick={() => !opt.disabled && onSelect(opt.id)}
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
                <div className="diff-poster-text">INSTRUMENT<br/>POSTER ART</div>
              )}
            </div>
            <div className="diff-poster-bottom">
              <div className="diff-poster-h1">SELECT</div>
              <div className="diff-poster-h2">INSTRUMENT</div>
            </div>
          </div>
        </>
      )}

      <div className="rr-control-bar">
        <div className="rr-control-hint" onClick={() => !options[activeIdx]?.disabled && onSelect(options[activeIdx].id)} style={{cursor: 'pointer'}}>
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
