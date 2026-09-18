import { useMemo } from 'react'

import { pickTip } from '../game/loadingTips'

interface Props {
  /** Musica que esta carregando, mostrada em letra pequena. */
  songTitle?: string
  /** Progresso das faixas de audio, quando conhecido. */
  done?: number
  total?: number
}

/**
 * Tela de carregamento.
 *
 * Os tres anjos flutuam com fases diferentes (ver `--atraso` no CSS) para nao
 * subirem e descerem em bloco, o que pareceria um elevador em vez de voo.
 *
 * A dica e sorteada UMA vez por montagem: trocar de frase no meio do
 * carregamento faz a pessoa perder a leitura.
 */
export function LoadingScreen({ songTitle, done = 0, total = 0 }: Props) {
  const tip = useMemo(() => pickTip(), [])

  return (
    <div className="ld-screen">
      <div className="ld-wind" />
      <div className="ld-wind ld-wind-2" />
      <div className="ld-vignette" />

      <div className="ld-angels">
        {[0, 1, 2].map((index) => (
          <img
            key={index}
            src="/ui/angel.png"
            alt=""
            className={`ld-angel ld-angel-${index}`}
            style={{ ['--atraso' as string]: `${index * -0.9}s` }}
          />
        ))}
      </div>

      <div className="ld-tip">{tip}</div>

      <div className="ld-bottom">
        <div className="ld-word" aria-label="Carregando">
          {'LOADING'.split('').map((letra, index) => (
            <span key={index} style={{ ['--i' as string]: index }}>
              {letra}
            </span>
          ))}
        </div>
        {songTitle && <div className="ld-song">{songTitle}</div>}
        {total > 0 && (
          <div className="ld-progress">
            faixas de áudio: {done} de {total}
          </div>
        )}
      </div>
    </div>
  )
}
