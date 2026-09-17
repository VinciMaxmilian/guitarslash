export interface Hint {
  key: string
  label: string
  color?: 'gold' | 'green' | 'red' | 'blue'
}

/** Barra de dicas de controle no rodape, no estilo de console. */
export function ControlBar({ hints }: { hints: Hint[] }) {
  return (
    <div className="screen-foot">
      <div className="control-bar">
        {hints.map((hint) => (
          <span className="control-hint" key={hint.label}>
            <span className={`key ${hint.color ?? 'gold'}`}>{hint.key}</span>
            {hint.label}
          </span>
        ))}
      </div>
    </div>
  )
}
