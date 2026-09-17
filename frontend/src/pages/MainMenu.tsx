import { ControlBar } from '../components/ControlBar'

interface Props {
  onPlay: () => void
  onSettings: () => void
}

/**
 * Menu principal: logo desgastado de um lado, lista vertical do outro,
 * com hierarquia feita por tamanho de tipo - nada de caixinhas.
 */
export function MainMenu({ onPlay, onSettings }: Props) {
  return (
    <>
      <div className="menu">
        <div className="menu-brand">
          <h1 className="logo">
            Guitar
            <br />
            Slash
          </h1>
          <div className="logo-rule" />
          <div className="logo-sub">Legends of nothing</div>
        </div>

        <nav className="menu-list">
          <button className="menu-item big" onClick={onPlay}>
            Quickplay
          </button>
          <button className="menu-item mid" disabled title="Chega na Fase 3">
            Co-op LAN<span className="tag">fase 3</span>
          </button>
          <button className="menu-item mid" disabled title="Chega na Fase 3">
            Versus LAN<span className="tag">fase 3</span>
          </button>
          <button className="menu-item small" onClick={onSettings}>
            Opções
          </button>
        </nav>
      </div>

      <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, zIndex: 3 }}>
        <ControlBar
          hints={[
            { key: '↑↓', label: 'Navegar', color: 'gold' },
            { key: '⏎', label: 'Selecionar', color: 'green' },
            { key: 'A S D F G', label: 'Trastes', color: 'blue' },
          ]}
        />
      </div>
    </>
  )
}
