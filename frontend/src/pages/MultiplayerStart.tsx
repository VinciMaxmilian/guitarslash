import { useState } from 'react'
import '../styles/riff-riot.css'
import { useUISounds } from '../hooks/useUISounds'
import { MULTIPLAYER_KIND } from '../game/hostMode'
import { CODE_ALPHABET, CODE_LENGTH } from '../game/multiplayerProtocol'

interface Props {
  onCreate: () => void
  onJoin: (code: string) => void
  onBack: () => void
}

/** Deixa o campo no formato que o servidor espera, enquanto a pessoa digita. */
export function sanitizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => CODE_ALPHABET.includes(c))
    .slice(0, CODE_LENGTH)
    .join('')
}

export function MultiplayerStart({ onCreate, onJoin, onBack }: Props) {
  const [code, setCode] = useState('')
  const uiSounds = useUISounds()
  const completo = code.length === CODE_LENGTH

  const entrar = () => {
    if (!completo) return
    uiSounds.play('select')
    onJoin(code)
  }

  return (
    <div className="rr-screen screen-diff">
      <div className="diff-bg-1" />
      <div className="diff-bg-2" />

      <div className="lobby">
        <div className="lobby-header">
          <div className="lobby-title">MULTIPLAYER</div>
          <div className="lobby-status">
            {MULTIPLAYER_KIND === 'lan' ? 'REDE LOCAL' : 'ONLINE'}
          </div>
        </div>

        <div className="mp-start">
          <div className="mp-start-card">
            <div className="mp-start-h">CRIAR SALA</div>
            <p className="mp-start-p">
              Você vira o host. O código aparece na tela para os outros entrarem.
            </p>
            <button
              className="btn primary"
              onClick={() => {
                uiSounds.play('select')
                onCreate()
              }}
            >
              <span>CRIAR</span>
            </button>
          </div>

          <div className="mp-start-card">
            <div className="mp-start-h">ENTRAR NUMA SALA</div>
            <p className="mp-start-p">Digite o código que o host te passou.</p>
            <input
              className="mp-code-input"
              value={code}
              onChange={(event) => setCode(sanitizeCode(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') entrar()
              }}
              placeholder={'-'.repeat(CODE_LENGTH)}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Código da sala"
            />
            <button className="btn primary" disabled={!completo} onClick={entrar}>
              <span>ENTRAR</span>
            </button>
          </div>
        </div>

        {MULTIPLAYER_KIND === 'lan' && (
          <div className="lobby-note">
            Na mesma sala? Use fones, ou deixe o volume alto só no host.
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
