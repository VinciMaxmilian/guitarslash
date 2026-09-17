import type { ReactNode } from 'react'

/**
 * Fundo de palco + moldura ornamentada, usados por todas as telas fora da
 * gameplay. A moldura e construida em CSS: quando houver ilustracao propria,
 * basta trocar as camadas de fundo, sem mexer nas telas.
 */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="stage">
      <div className="stage-beam one" />
      <div className="stage-beam two" />
      <div className="frame">{children}</div>
    </div>
  )
}
