import { useEffect, useMemo, useState } from 'react'
import '../styles/riff-riot.css'

import { api } from '../api/client'
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  INSTRUMENT_LABELS,
  type SongSummary,
} from '../api/types'
import { fetchCommunitySongs } from '../community/communitySongs'
import { useUISounds } from '../hooks/useUISounds'
import { CLOUD_ENABLED } from '../lib/supabase'
import { fetchTotals, type TotalRow } from '../lib/scores'
import { formatNumber, formatPercent } from '../utils/format'

interface Props {
  /** id do jogador logado, para destacar a propria linha. */
  userId?: string | null
  onBack: () => void
}

/** Instrumentos que a tabela `scores` aceita (check do banco, migration 0001). */
const INSTRUMENTS = ['guitar', 'guitar_coop', 'rhythm', 'bass', 'drums']

export function Leaderboard({ userId, onBack }: Props) {
  const uiSounds = useUISounds()
  const [songId, setSongId] = useState('')
  const [instrument, setInstrument] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [linhas, setLinhas] = useState<TotalRow[] | null>(null)
  const [songs, setSongs] = useState<SongSummary[]>([])

  // A lista de musicas serve so ao filtro: biblioteca local + comunidade, que
  // sao as duas origens de onde um placar pode ter vindo.
  useEffect(() => {
    let vivo = true
    void Promise.all([
      api.library().catch(() => null),
      CLOUD_ENABLED ? fetchCommunitySongs().catch(() => []) : Promise.resolve([]),
    ]).then(([biblioteca, comunidade]) => {
      if (!vivo) return
      const todas = [...(biblioteca?.songs ?? []), ...comunidade]
      const porId = new Map(todas.map((s) => [s.id, s]))
      setSongs([...porId.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')))
    })
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (!CLOUD_ENABLED) {
      setLinhas([])
      return
    }
    let vivo = true
    setLinhas(null)
    void fetchTotals({ songId, instrument, difficulty }).then((r) => {
      if (vivo) setLinhas(r)
    })
    return () => {
      vivo = false
    }
  }, [songId, instrument, difficulty])

  const filtrado = Boolean(songId || instrument || difficulty)

  const resumo = useMemo(() => {
    const partes = [
      songId ? (songs.find((s) => s.id === songId)?.title ?? songId) : 'TODAS AS MÚSICAS',
      instrument ? (INSTRUMENT_LABELS[instrument] ?? instrument) : 'TODOS OS INSTRUMENTOS',
      difficulty ? (DIFFICULTY_LABELS[difficulty] ?? difficulty) : 'TODAS AS DIFICULDADES',
    ]
    return partes.join(' · ').toUpperCase()
  }, [songId, instrument, difficulty, songs])

  const limpar = () => {
    uiSounds.play('back')
    setSongId('')
    setInstrument('')
    setDifficulty('')
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Ranking mundial</h1>
          <div className="screen-subtitle">{resumo}</div>
        </div>
        <div className="settings-actions">
          {filtrado && (
            <button className="btn small ghost" onClick={limpar}>
              <span>Limpar filtros</span>
            </button>
          )}
          <button
            className="btn small"
            onClick={() => {
              uiSounds.play('back')
              onBack()
            }}
          >
            <span>Voltar</span>
          </button>
        </div>
      </header>

      <div className="lb-filters">
        <div className="field">
          <label htmlFor="lb-song">Música</label>
          <select
            id="lb-song"
            value={songId}
            onChange={(event) => setSongId(event.target.value)}
          >
            <option value="">Todas</option>
            {songs.map((song) => (
              <option key={song.id} value={song.id}>
                {song.title} — {song.artist}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="lb-instrument">Instrumento</label>
          <select
            id="lb-instrument"
            value={instrument}
            onChange={(event) => setInstrument(event.target.value)}
          >
            <option value="">Todos</option>
            {INSTRUMENTS.map((value) => (
              <option key={value} value={value}>
                {INSTRUMENT_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="lb-difficulty">Dificuldade</label>
          <select
            id="lb-difficulty"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="">Todas</option>
            {DIFFICULTY_ORDER.map((value) => (
              <option key={value} value={value}>
                {DIFFICULTY_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel lb-total-box scroll">
        {!CLOUD_ENABLED ? (
          <div className="lb-vazio">
            A nuvem não está configurada neste build, então não há ranking. Faltam
            VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
          </div>
        ) : linhas === null ? (
          <div className="lb-vazio">Somando os placares...</div>
        ) : linhas.length === 0 ? (
          <div className="lb-vazio">
            {filtrado
              ? 'Ninguém pontuou ainda com esses filtros.'
              : 'Ainda não há placares. Termine uma música com a conta conectada e o primeiro será o seu.'}
          </div>
        ) : (
          <table className="mp-table lb-total">
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                <th style={{ textAlign: 'right' }}>Pontos</th>
                <th style={{ textAlign: 'right' }}>Músicas</th>
                <th style={{ textAlign: 'right' }}>Accuracy</th>
                <th style={{ textAlign: 'right' }}>Estrelas</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, indice) => (
                <tr key={linha.user_id} className={linha.user_id === userId ? 'self' : ''}>
                  <td className="mp-rank">{indice + 1}</td>
                  <td>{linha.display_name}</td>
                  <td className="num">{formatNumber(linha.total_score)}</td>
                  <td className="num">{formatNumber(linha.songs)}</td>
                  <td className="num">{formatPercent(linha.accuracy)}</td>
                  <td className="num">{formatNumber(linha.stars)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="note">
          Os pontos somam o <strong>melhor placar de cada música</strong>. Repetir a mesma música
          não soma duas vezes — nem no fácil e no expert.
        </p>
      </div>
    </div>
  )
}
