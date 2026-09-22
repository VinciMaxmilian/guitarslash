import { useEffect, useState } from 'react'
import '../styles/riff-riot.css'
import { useUISounds } from '../hooks/useUISounds'
import { GAME_VERSION } from '../version'

interface MenuOption {
  label: string
  action: (() => void) | undefined
  cls: string
  disabled: boolean
  /** Tooltip que explica por que a opcao esta desligada. */
  hint?: string
}

interface Props {
  onPlay: () => void
  onSettings: () => void
  onMultiplayer: () => void
  onTraining: () => void
  onLeaderboard: () => void
  onAccount: () => void
  /** false = nuvem nao configurada. O item aparece MESMO ASSIM, desligado com
   *  explicacao: item que desaparece deixa o jogador procurando algo que nao
   *  existe mais. */
  accountAvailable: boolean
  accountName?: string | null
  /**
   * Multiplayer LAN so existe quando esta pagina vem do processo do host.
   * No deploy publico nao ha WebSocket: Serverless Function nao mantem
   * conexao aberta, e pagina em HTTPS nao abre ws:// para IP da rede local.
   */
  multiplayerAvailable: boolean
}

export function MainMenu({
  onPlay,
  onSettings,
  onMultiplayer,
  onTraining,
  onLeaderboard,
  onAccount,
  accountAvailable,
  accountName,
  multiplayerAvailable,
}: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const uiSounds = useUISounds()
  
  const options: MenuOption[] = [
    { label: 'QUICKPLAY', action: onPlay, cls: 'menu-item-3', disabled: false },
    {
      label: 'MULTIPLAYER',
      action: onMultiplayer,
      cls: 'menu-item-4',
      disabled: !multiplayerAvailable,
      hint: multiplayerAvailable
        ? undefined
        : 'Servidor de partidas nao configurado neste build (VITE_WS_URL) e a pagina nao vem de um host de LAN',
    },
    { label: 'TRAINING', action: onTraining, cls: 'menu-item-5', disabled: false },
    { label: 'LEADERBOARD', action: onLeaderboard, cls: 'menu-item-7', disabled: false },
    { label: 'OPTIONS', action: onSettings, cls: 'menu-item-6', disabled: false },
    {
      label: accountName ? accountName.toUpperCase() : 'LOGIN',
      action: onAccount,
      cls: 'menu-item-2',
      disabled: false,
      hint: accountAvailable
        ? undefined
        : 'Conta e leaderboard exigem VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY',
    },
  ]

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((idx) => {
          let next = (idx + 1) % options.length
          while (options[next].disabled) next = (next + 1) % options.length
          return next
        })
        uiSounds.play('scroll')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((idx) => {
          let next = (idx - 1 + options.length) % options.length
          while (options[next].disabled) next = (next - 1 + options.length) % options.length
          return next
        })
        uiSounds.play('scroll')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (!options[activeIdx].disabled) {
          uiSounds.play('select')
          options[activeIdx].action?.()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIdx, options, uiSounds])

  return (
    <div className="rr-screen screen-menu">
      <div className="menu-bg-1" />
      <div className="menu-bg-2" />
      <div className="menu-box-1" />
      <div className="menu-box-2" />
      <div className="menu-box-3" />
      <div className="menu-vignette" />

      <div className="menu-title-container">
        <div className="menu-title-box">
          <div className="menu-title-part1">GUITAR</div>
          <div className="menu-title-part2">SLASH</div>
          <div className="menu-title-line" />
          <div className="menu-title-sub">CHAPTER THREE</div>
        </div>
        <div className="menu-tape-1" />
        <div className="menu-tape-2" />
      </div>

      <div className="menu-list-container">
        {options.map((opt, i) => (
          <button
            key={opt.label}
            className={`menu-item-btn ${opt.cls} ${i === activeIdx ? 'active' : ''}`}
            disabled={opt.disabled}
            title={opt.hint}
            onMouseEnter={() => {
              if (!opt.disabled && activeIdx !== i) {
                setActiveIdx(i)
                uiSounds.play('scroll')
              }
            }}
            onClick={() => {
              if (!opt.disabled) {
                uiSounds.play('select')
                opt.action?.()
              }
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Apoio ao projeto: canto inferior esquerdo, fora da coluna do menu
          (que fica a direita) e acima da barra de controles. */}
      <aside className="menu-support">
        <div className="menu-support-tape" />
        <img
          className="menu-support-qr"
          src="/ui/pix-qr.svg"
          alt="QR Code Pix para apoiar o projeto"
        />
        <div className="menu-support-text">
          <div className="menu-support-kicker">PIX · APOIE</div>
          <p className="menu-support-line">
            Dê suporte ao projeto aberto, para melhores servidores e tecnologias
          </p>
          <p className="menu-support-soon">
            Em breve, novos controles de imersão (guitarras, baixos, etc)
          </p>
        </div>
      </aside>

      <div className="rr-control-bar">
        <div className="rr-control-hint no-border">
          <div className="rr-key green" />
          <span className="rr-control-label">SELECT</span>
        </div>
        <div className="rr-control-hint no-border">
          <div className="rr-key white" />
          <span className="rr-control-label">UP/DOWN</span>
        </div>
        {/* No canto, fora do fluxo centralizado das dicas de controle: a
            versao e para ser conferida quando procurada, nao lida sempre. */}
        <span className="menu-version">v{GAME_VERSION}</span>
      </div>
    </div>
  )
}
