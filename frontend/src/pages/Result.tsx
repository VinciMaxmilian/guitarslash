import { useEffect, useState } from 'react'

import { DIFFICULTY_LABELS, INSTRUMENT_LABELS, type SongSummary } from '../api/types'
import type { MPResults } from '../game/multiplayerProtocol'
import type { MultiplayerSession } from '../game/useMultiplayer'
import type { PlayerSnapshot } from '../game/types'
import { formatNumber, formatPercent } from '../utils/format'
import { fetchLeaderboard, type LeaderboardRow } from '../lib/scores'
import { CLOUD_ENABLED } from '../lib/supabase'

interface Props {
  song: SongSummary
  instrument: string
  difficulty: string
  players: PlayerSnapshot[]
  totalNotes: number
  /** Presente apenas em partida LAN. */
  mp?: MultiplayerSession
  /** id do jogador logado, para destacar a propria linha no leaderboard. */
  userId?: string | null
  /** Repetir a musica nao existe em LAN: quem decide isso e o host. */
  onRetry?: () => void
  onSongSelect: () => void
}

export function Result({
  song,
  instrument,
  difficulty,
  players,
  totalNotes,
  mp,
  userId,
  onRetry,
  onSongSelect,
}: Props) {
  const player = players[0]
  const results = mp?.results ?? null

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

      {mp && !results && (
        <div className="panel" style={{ padding: 18 }}>
          <div className="note">Esperando os outros jogadores terminarem...</div>
        </div>
      )}

      {results && <MultiplayerResults results={results} selfId={mp?.selfId ?? null} />}

      {/* Leaderboard so em partida solo: em LAN o placar que interessa e o
          da sala, que ja aparece acima. */}
      {CLOUD_ENABLED && !mp && (
        <Leaderboard
          songId={song.id}
          instrument={instrument}
          difficulty={difficulty}
          userId={userId ?? null}
        />
      )}

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
          {onRetry && (
            <button className="btn primary" onClick={onRetry}>
              <span>Jogar de novo</span>
            </button>
          )}
          <button className={onRetry ? 'btn' : 'btn primary'} onClick={onSongSelect}>
            <span>{mp ? 'Voltar ao lobby' : 'Escolher outra música'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function MultiplayerResults({
  results,
  selfId,
}: {
  results: MPResults
  selfId: string | null
}) {
  const coop = results.mode === 'coop'
  const verdict = coop
    ? { texto: `BAND SCORE ${formatNumber(results.bandScore ?? 0)}`, cls: 'band' }
    : results.tie
      ? { texto: 'EMPATE', cls: 'tie' }
      : results.winnerId === selfId
        ? { texto: 'VOCE GANHOU', cls: 'win' }
        : {
            texto: `${results.players.find((p) => p.id === results.winnerId)?.name ?? '???'} GANHOU`,
            cls: 'lose',
          }

  return (
    <div className="panel" style={{ padding: 24, display: 'grid', gap: 18 }}>
      <div className={`mp-verdict ${verdict.cls}`}>{verdict.texto}</div>

      {results.mixedDifficulty && (
        <div className="lobby-warning">
          As dificuldades foram diferentes: os scores nao sao comparaveis.
        </div>
      )}

      <table className="mp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Jogador</th>
            <th>Instrumento</th>
            <th>Dificuldade</th>
            <th style={{ textAlign: 'right' }}>Score</th>
            <th style={{ textAlign: 'right' }}>Accuracy</th>
            <th style={{ textAlign: 'right' }}>Max combo</th>
            <th style={{ textAlign: 'right' }}>Acertos</th>
            <th style={{ textAlign: 'right' }}>Erros</th>
          </tr>
        </thead>
        <tbody>
          {results.players.map((row, index) => (
            <tr key={row.id} className={row.id === selfId ? 'self' : ''}>
              <td className="mp-rank">{coop ? '-' : index + 1}</td>
              <td>
                {row.name}
                {!row.connected && ' (CAIU)'}
              </td>
              <td>{INSTRUMENT_LABELS[row.instrument ?? ''] ?? row.instrument ?? '???'}</td>
              <td>{DIFFICULTY_LABELS[row.difficulty ?? ''] ?? row.difficulty ?? '???'}</td>
              <td className="num">{formatNumber(row.score)}</td>
              <td className="num">{formatPercent(row.accuracy)}</td>
              <td className="num">{formatNumber(row.maxCombo)}</td>
              <td className="num">{formatNumber(row.notesHit)}</td>
              <td className="num">{formatNumber(row.notesMissed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Leaderboard({
  songId,
  instrument,
  difficulty,
  userId,
}: {
  songId: string
  instrument: string
  difficulty: string
  userId: string | null
}) {
  const [linhas, setLinhas] = useState<LeaderboardRow[] | null>(null)

  useEffect(() => {
    let vivo = true
    void fetchLeaderboard({ songId, instrument, difficulty }).then((r) => {
      if (vivo) setLinhas(r)
    })
    return () => {
      vivo = false
    }
  }, [songId, instrument, difficulty])

  if (linhas === null) return null

  return (
    <div className="panel lb-box" style={{ padding: 20 }}>
      <div className="lb-title">
        MELHORES · {INSTRUMENT_LABELS[instrument] ?? instrument} ·{' '}
        {DIFFICULTY_LABELS[difficulty] ?? difficulty}
      </div>

      {linhas.length === 0 ? (
        <div className="lb-vazio">
          {userId
            ? 'Nenhum placar ainda nesta música. O seu foi o primeiro.'
            : 'Entre com uma conta para o seu placar aparecer aqui.'}
        </div>
      ) : (
        linhas.map((linha, indice) => (
          <div
            key={linha.user_id}
            className={`lb-row ${linha.user_id === userId ? 'eu' : ''}`}
          >
            <span className="lb-pos">{indice + 1}</span>
            <span className="lb-nome">{linha.display_name}</span>
            <span className="lb-score">{formatNumber(linha.score)}</span>
            <span className="lb-acc">{formatPercent(linha.accuracy)}</span>
          </div>
        ))
      )}
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
