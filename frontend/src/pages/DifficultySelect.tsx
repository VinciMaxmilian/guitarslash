import {
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  INSTRUMENT_LABELS,
  type SongSummary,
} from '../api/types'
import { ControlBar } from '../components/ControlBar'
import { PickList } from '../components/PickList'

interface Props {
  song: SongSummary
  instrument: string
  onBack: () => void
  onSelect: (difficulty: string) => void
}

/** Só aparecem as dificuldades que o instrumento realmente possui. */
export function DifficultySelect({ song, instrument, onBack, onSelect }: Props) {
  const info = song.instruments[instrument]
  const available = DIFFICULTY_ORDER.filter((d) => info?.difficulties.includes(d))

  const options = available.map((difficulty) => ({
    id: difficulty,
    name: DIFFICULTY_LABELS[difficulty] ?? difficulty,
    sub: `${info?.noteCounts?.[difficulty] ?? 0} notas`,
  }))

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Dificuldade</h1>
          <div className="screen-subtitle">
            {song.title} · {INSTRUMENT_LABELS[instrument] ?? instrument}
          </div>
        </div>
        <button className="btn small ghost" onClick={onBack}>
          <span>Voltar</span>
        </button>
      </header>

      {options.length === 0 ? (
        <div className="panel empty">Este instrumento não tem dificuldades no chart.</div>
      ) : (
        <div className="poster-layout">
          <PickList options={options} onPick={onSelect} onBack={onBack} />

          <div className="poster-card">
            <div className="poster-mark">🎸</div>
            <div className="poster-title">
              Select
              <br />
              Difficulty
            </div>
            <div className="poster-rule" />
            <div className="poster-sub">Guitar Slash</div>
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
