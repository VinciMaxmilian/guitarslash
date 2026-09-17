import { useEffect, useRef, useState } from 'react'

export interface PickOption {
  id: string
  name: string
  sub: string
  icon?: string
  disabled?: boolean
}

interface Props {
  options: PickOption[]
  onPick: (id: string) => void
  onBack?: () => void
}

/**
 * Lista vertical de cartaz: tipografia grande e faixa de selecao que sangra
 * para fora. Navegavel por teclado (setas + Enter), como num console.
 */
export function PickList({ options, onPick, onBack }: Props) {
  const firstEnabled = options.findIndex((option) => !option.disabled)
  const [active, setActive] = useState(Math.max(0, firstEnabled))
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const move = (direction: number) => {
      setActive((current) => {
        for (let step = 1; step <= options.length; step++) {
          const next = (current + direction * step + options.length * step) % options.length
          if (!options[next]?.disabled) return next
        }
        return current
      })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        move(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        move(-1)
      } else if (event.key === 'Enter' || event.code === 'Space') {
        const option = options[active]
        if (option && !option.disabled) {
          event.preventDefault()
          onPick(option.id)
        }
      } else if (event.key === 'Escape' && onBack) {
        event.preventDefault()
        onBack()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [options, active, onPick, onBack])

  return (
    <div className="pick-list" ref={containerRef}>
      {options.map((option, index) => (
        <button
          key={option.id}
          className={`pick-item ${index === active ? 'active' : ''}`}
          disabled={option.disabled}
          onMouseEnter={() => !option.disabled && setActive(index)}
          onClick={() => onPick(option.id)}
        >
          <span className="pick-name">
            {option.icon && <span className="pick-icon">{option.icon}</span>}
            {option.name}
          </span>
          <span className="pick-sub">{option.sub}</span>
        </button>
      ))}
    </div>
  )
}
