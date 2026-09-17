import { DIFFICULTY_LABELS, INSTRUMENT_LABELS, type SongSummary } from '../api/types'
import type { PlayerSnapshot } from '../game/types'
import { formatNumber, formatPercent } from '../utils/format'

interface Props {
  song: SongSummary
  instrument: string
  difficulty: string
  players: PlayerSnapshot[]
  totalNotes: number
  onRetry: () => void
  onSongSelect: () => void
}

export function Result({
  song,
  instrument,
  difficulty,
  players,
  totalNotes,
  onRetry,
  onSongSelect,
}: Props) {
  const player = players[0]

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Song complete</h1>
          <div className="screen-subtitle">
            {song.title} · {song.artist} · {INSTRUMENT_LABELS[instrument] ?? instrument} ·{' '}
            {DIFFICULTY_LABELS[difficulty] ?? difficulty}
          </div>
        </div>
        <button className="btn small ghost" onClick={onSongSelect}>
          <span>Voltar</span>
        </button>
      </header>

      <div className="panel" style={{ padding: 28, display: 'grid', gap: 22 }}>
        <div style={{ textAlign: 'center', display: 'grid', gap: 8 }}>
          <div className="stars">
            {[0, 1, 2, 3, 4].map((index) => (
              <span key={index} className={index < player.stars ? 'on' : ''}>
                ★
              </span>
            ))}
          </div>
          <div className="hud-label">Score final</div>
          <div className="result-score">{formatNumber(player.score)}</div>
        </div>

        <div className="result-grid">
          <Stat label="Accuracy" value={formatPercent(player.accuracy)} />
          <Stat label="Combo máximo" value={formatNumber(player.maxCombo)} />
          <Stat label="Notas acertadas" value={`${player.notesHit} / ${totalNotes}`} />
          <Stat label="Notas erradas" value={formatNumber(player.notesMissed)} />
          <Stat label="Perfect" value={formatNumber(player.perfect)} />
          <Stat label="Great" value={formatNumber(player.great)} />
          <Stat label="Good" value={formatNumber(player.good)} />
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={onRetry}>
            <span>Jogar de novo</span>
          </button>
          <button className="btn" onClick={onSongSelect}>
            <span>Escolher outra música</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="result-stat">
      <div className="meta-label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}
