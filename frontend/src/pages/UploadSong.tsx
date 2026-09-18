import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/riff-riot.css'

import { api } from '../api/client'
import {
  uploadSong,
  type UploadProgress,
} from '../community/communitySongs'
import {
  MAX_UPLOAD_BYTES,
  inspectFolder,
  parseIni,
  slugify,
  type IniMetadata,
  type InspectedFolder,
} from '../community/songFolder'
import { useUISounds } from '../hooks/useUISounds'

interface Props {
  userId: string
  onBack: () => void
  onDone: () => void
}

function mb(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/**
 * Envio de uma musica da comunidade.
 *
 * A pasta e validada ANTES de subir: gastar a cota do jogador com um envio que
 * o jogo nao conseguiria tocar seria o pior resultado possivel aqui.
 */
export function UploadSong({ userId, onBack, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [arquivos, setArquivos] = useState<File[]>([])
  const [progresso, setProgresso] = useState<UploadProgress | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const uiSounds = useUISounds()

  const pasta: InspectedFolder | null = useMemo(
    () => (arquivos.length > 0 ? inspectFolder(arquivos) : null),
    [arquivos],
  )

  // Le o song.ini para mostrar o que vai ser registrado. Ver o titulo antes de
  // enviar e o que pega pasta errada ou ini vazio.
  const [meta, setMeta] = useState<IniMetadata | null>(null)
  useEffect(() => {
    const ini = pasta?.ini
    if (!ini) {
      setMeta(null)
      return
    }
    let vivo = true
    void ini.file.text().then((texto) => {
      if (vivo) setMeta(parseIni(texto))
    })
    return () => {
      vivo = false
    }
  }, [pasta])

  const enviar = async () => {
    if (!pasta?.ok || progresso) return
    setErro(null)
    setProgresso({ step: 'Preparando', done: 0, total: 1 })

    const resultado = await uploadSong(userId, arquivos, setProgresso, (path) =>
      api.inspectCommunityChart(path),
    )

    setProgresso(null)
    if (!resultado.ok) {
      setErro(resultado.error ?? 'Falha no envio.')
      return
    }
    setPronto(true)
    uiSounds.play('select')
  }

  return (
    <div className="rr-screen screen-diff">
      <div className="diff-bg-1" />
      <div className="diff-bg-2" />

      <div className="lobby">
        <div className="lobby-header">
          <div className="lobby-title">ENVIAR MÚSICA</div>
        </div>

        {pronto ? (
          <div className="auth-card">
            <p className="mp-start-p">
              Música enviada. Ela já aparece na aba <strong>COMUNIDADE</strong>.
            </p>
            <button
              className="btn primary"
              onClick={() => {
                uiSounds.play('select')
                onDone()
              }}
            >
              <span>VER NA LISTA</span>
            </button>
          </div>
        ) : (
          <div className="auth-card up-card">
            <p className="mp-start-p">
              Escolha a <strong>pasta</strong> da música, no formato do Clone Hero: com{' '}
              <code>song.ini</code>, <code>notes.mid</code> e o áudio. Você encontra charts
              prontos no{' '}
              <a href="https://www.enchor.us/" target="_blank" rel="noreferrer noopener">
                enchor.us
              </a>
              .
            </p>

            <input
              ref={inputRef}
              type="file"
              multiple
              // Atributos de pasta nao estao na tipagem do React.
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              style={{ display: 'none' }}
              onChange={(event) => {
                setErro(null)
                setArquivos(Array.from(event.target.files ?? []))
              }}
            />

            <button
              className="btn"
              onClick={() => {
                uiSounds.play('scroll')
                inputRef.current?.click()
              }}
            >
              <span>{arquivos.length > 0 ? 'TROCAR PASTA' : 'ESCOLHER PASTA'}</span>
            </button>

            {pasta && (
              <div className="up-resumo">
                <div className="up-linha">
                  <span>chart</span>
                  <strong>{pasta.chart?.name ?? '— faltando —'}</strong>
                </div>
                <div className="up-linha">
                  <span>música</span>
                  <strong>
                    {meta ? meta.title || '(sem nome no song.ini)' : 'lendo...'}
                  </strong>
                </div>
                <div className="up-linha">
                  <span>artista</span>
                  <strong>
                    {meta ? meta.artist || '(sem artista)' : 'lendo...'}
                  </strong>
                </div>
                {meta && (
                  <div className="up-linha">
                    <span>id na lista</span>
                    <strong>{slugify(meta.artist, meta.title || 'musica')}</strong>
                  </div>
                )}
                {meta && meta.delay !== 0 && (
                  <div className="up-linha">
                    <span>delay do ini</span>
                    <strong>{meta.delay.toFixed(3)} s</strong>
                  </div>
                )}
                <div className="up-linha">
                  <span>áudio</span>
                  <strong>
                    {pasta.audio.length > 0
                      ? `${pasta.audio.length} faixa(s)`
                      : '— faltando —'}
                  </strong>
                </div>
                <div className="up-linha">
                  <span>capa</span>
                  <strong>{pasta.cover?.name ?? 'sem capa'}</strong>
                </div>
                <div className="up-linha">
                  <span>tamanho</span>
                  <strong>
                    {mb(pasta.totalBytes)} de {mb(MAX_UPLOAD_BYTES)}
                  </strong>
                </div>
              </div>
            )}

            {pasta?.errors.map((mensagem) => (
              <div key={mensagem} className="lobby-warning">
                {mensagem}
              </div>
            ))}
            {pasta?.warnings.map((mensagem) => (
              <div key={mensagem} className="lobby-note">
                {mensagem}
              </div>
            ))}
            {erro && <div className="lobby-warning">{erro}</div>}

            {progresso && (
              <div className="up-progresso">
                <div className="up-progresso-texto">
                  {progresso.step} ({progresso.done}/{progresso.total})
                </div>
                <div className="lobby-load">
                  <div
                    className="lobby-load-fill"
                    style={{
                      width: `${Math.round(
                        (progresso.done / Math.max(1, progresso.total)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <button
              className="btn primary"
              disabled={!pasta?.ok || progresso !== null}
              onClick={enviar}
            >
              <span>{progresso ? 'ENVIANDO...' : 'ENVIAR'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="rr-control-bar">
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
