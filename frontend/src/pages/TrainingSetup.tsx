import { useEffect, useMemo, useState } from 'react'
import '../styles/riff-riot.css'

import { api } from '../api/client'
import { DIFFICULTY_LABELS, INSTRUMENT_LABELS, type SongSummary } from '../api/types'
import type { Chart } from '../game/types'
import {
  TRAINING_RATES,
  buildSections,
  fullSection,
  type TrainingSection,
} from '../game/trainingSections'
import type { TrainingOptions } from '../game/GameEngine'
import { useUISounds } from '../hooks/useUISounds'
import { formatTime } from '../utils/format'

interface Props {
  song: SongSummary
  instrument: string
  difficulty: string
  onBack: () => void
  onStart: (training: TrainingOptions) => void
}

/**
 * Escolha do trecho e da velocidade antes de treinar.
 *
 * Os trechos vem dos marcadores de secao do chart; sem eles, de uma divisao em
 * pedacos iguais (ver trainingSections.ts).
 */
export function TrainingSetup({ song, instrument, difficulty, onBack, onStart }: Props) {
  const [chart, setChart] = useState<Chart | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [indice, setIndice] = useState(0)
  const [rate, setRate] = useState(0.75)
  const uiSounds = useUISounds()

  useEffect(() => {
    let vivo = true
    setErro(null)
    api
      .chartFor(song, instrument, difficulty)
      .then((c) => {
        if (vivo) setChart(c)
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [song, instrument, difficulty])

  const trechos: TrainingSection[] = useMemo(() => {
    if (!chart) return []
    return [fullSection(chart), ...buildSections(chart)]
  }, [chart])

  const escolhido = trechos[indice] ?? null

  return (
    <div className="rr-screen screen-diff">
      <div className="diff-bg-1" />
      <div className="diff-bg-2" />

      <div className="lobby">
        <div className="lobby-header">
          <div className="lobby-title">TREINO</div>
          <div className="lobby-status">
            {song.title} · {INSTRUMENT_LABELS[instrument] ?? instrument} ·{' '}
            {DIFFICULTY_LABELS[difficulty] ?? difficulty}
          </div>
        </div>

        {erro && <div className="lobby-warning">{erro}</div>}
        {!chart && !erro && <div className="lobby-note">Lendo o chart...</div>}

        {chart && trechos.length === 0 && (
          <div className="lobby-warning">
            Este chart não tem trecho com notas para treinar.
          </div>
        )}

        {chart && trechos.length > 0 && (
          <>
            <div className="tr-secao">
              <div className="tr-rotulo">TRECHO</div>
              <div className="tr-lista">
                {trechos.map((trecho, i) => (
                  <button
                    key={`${trecho.name}-${trecho.from}`}
                    className={`tr-item ${i === indice ? 'ativo' : ''}`}
                    onClick={() => {
                      uiSounds.play('scroll')
                      setIndice(i)
                    }}
                  >
                    <span className="tr-item-nome">{trecho.name}</span>
                    <span className="tr-item-meta">
                      {formatTime(trecho.from)} – {formatTime(trecho.to)} ·{' '}
                      {trecho.noteCount} notas
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="tr-secao">
              <div className="tr-rotulo">VELOCIDADE</div>
              <div className="tr-rates">
                {TRAINING_RATES.map((valor) => (
                  <button
                    key={valor}
                    className={`tr-rate ${valor === rate ? 'ativo' : ''}`}
                    onClick={() => {
                      uiSounds.play('scroll')
                      setRate(valor)
                    }}
                  >
                    {Math.round(valor * 100)}%
                  </button>
                ))}
              </div>
              {rate < 1 && (
                <div className="lobby-note">
                  Em velocidade reduzida o som fica mais grave: o navegador não
                  preserva o tom ao desacelerar.
                </div>
              )}
            </div>

            <div className="lobby-note">
              O trecho repete em loop e o placar zera a cada repetição. Treino
              não conta para o leaderboard.
            </div>
          </>
        )}
      </div>

      <div className="rr-control-bar">
        <div
          className="rr-control-hint"
          onClick={() => {
            if (!escolhido) return
            uiSounds.play('select')
            onStart({ from: escolhido.from, to: escolhido.to, rate })
          }}
          style={{ cursor: escolhido ? 'pointer' : 'not-allowed', opacity: escolhido ? 1 : 0.5 }}
        >
          <div className="rr-key green" />
          <span className="rr-control-label">TREINAR</span>
        </div>
        <div
          className="rr-control-hint"
          onClick={() => {
            uiSounds.play('back')
            onBack()
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="rr-key red" />
          <span className="rr-control-label">VOLTAR</span>
        </div>
      </div>
    </div>
  )
}
