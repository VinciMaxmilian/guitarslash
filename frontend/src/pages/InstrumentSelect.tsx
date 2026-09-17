import {
  DIFFICULTY_LABELS,
  INSTRUMENT_ICONS,
  INSTRUMENT_LABELS,
  type SongSummary,
} from '../api/types'
import { ControlBar } from '../components/ControlBar'
import { PickList } from '../components/PickList'

interface Props {
  song: SongSummary
  onBack: () => void
  onSelect: (instrument: string) => void
}

/** Mostra SOMENTE os instrumentos que existem no chart da musica. */
export function InstrumentSelect({ song, onBack, onSelect }: Props) {
  const options = Object.entries(song.instruments)
    .filter(([, info]) => info.available)
    .map(([key, info]) => {
      const playable = info.supported && info.difficulties.length > 0
      return {
        id: key,
        name: INSTRUMENT_LABELS[key] ?? key,
        icon: INSTRUMENT_ICONS[key] ?? '🎵',
        sub: playable
          ? info.difficulties.map((d) => DIFFICULTY_LABELS[d] ?? d).join(' · ')
          : 'Chega em uma fase futura',
        disabled: !playable,
      }
    })

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Instrumento</h1>
          <div className="screen-subtitle">
            {song.title} · {song.artist}
          </div>
        </div>
        <button className="btn small ghost" onClick={onBack}>
          <span>Voltar</span>
        </button>
      </header>

      {options.length === 0 ? (
        <div className="panel empty">Esta música não tem nenhum instrumento no chart.</div>
      ) : (
        <div className="poster-layout">
          <PickList options={options} onPick={onSelect} onBack={onBack} />

          <div className="poster-card">
            <div className="poster-mark">🤘</div>
            <div className="poster-title">
              Select
              <br />
              Instrument
            </div>
            <div className="poster-rule" />
            <div className="poster-sub">{song.artist}</div>
          </div>
        </div>
      )}

      <ControlBar
        hints={[
          { key: '↑↓', label: 'Navegar', color: 'gold' },
          { key: '⏎', label: 'Selecionar', color: 'green' },
          { key: 'Esc', label: 'Voltar', color: 'red' },
        ]}
      />
    </div>
  )
}
