import { useEffect, useRef, useState } from 'react'

import { LANE_COUNT } from '../game/config'
import { RESERVED_TOP, laneAtPoint, laneZone } from '../game/touchLanes'

interface Props {
  /** Aciona um traste. */
  onLane: (lane: number, pressed: boolean) => void
  /** Solta tudo: usado quando a aba perde foco. */
  onReleaseAll: () => void
  onStarPower: () => void
  onPause: () => void
  noteColors: string[]
  leftyFlip: boolean
  starPowerReady: boolean
  starPowerActive: boolean
}

/**
 * Controles de toque da gameplay.
 *
 * Pontos que fazem a diferenca entre jogavel e injogavel no celular:
 *
 * - **multi-touch de verdade**: cada dedo tem `pointerId` proprio, entao
 *   acorde funciona. Um unico "dedo atual" quebraria qualquer nota dupla;
 * - **arrastar troca de traste**: descer o dedo e escorregar para o lado solta
 *   o anterior e aperta o novo, que e como se toca de fato;
 * - **`touch-action: none`** e `setPointerCapture`: sem isso o navegador
 *   interpreta o gesto como rolagem e cancela o toque no meio da musica.
 */
export function TouchControls({
  onLane,
  onReleaseAll,
  onStarPower,
  onPause,
  noteColors,
  leftyFlip,
  starPowerReady,
  starPowerActive,
}: Props) {
  const areaRef = useRef<HTMLDivElement | null>(null)
  /** pointerId -> lane que aquele dedo esta segurando. */
  const dedos = useRef(new Map<number, number>())
  const [acesas, setAcesas] = useState<number[]>([])

  const sincronizarLuzes = () => {
    setAcesas([...new Set(dedos.current.values())])
  }

  const laneDoEvento = (event: React.PointerEvent): number | null => {
    const area = areaRef.current
    if (!area) return null
    const caixa = area.getBoundingClientRect()
    return laneAtPoint(
      event.clientX - caixa.left,
      event.clientY - caixa.top,
      caixa.width,
      caixa.height,
      leftyFlip,
    )
  }

  const soltarDedo = (pointerId: number) => {
    const lane = dedos.current.get(pointerId)
    if (lane === undefined) return
    dedos.current.delete(pointerId)
    // Outro dedo pode estar na MESMA lane; so solta o traste se nao houver.
    if (![...dedos.current.values()].includes(lane)) onLane(lane, false)
    sincronizarLuzes()
  }

  const onPointerDown = (event: React.PointerEvent) => {
    const lane = laneDoEvento(event)
    if (lane === null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dedos.current.set(event.pointerId, lane)
    onLane(lane, true)
    sincronizarLuzes()
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dedos.current.has(event.pointerId)) return
    const lane = laneDoEvento(event)
    const anterior = dedos.current.get(event.pointerId)
    if (lane === null || lane === anterior) return

    dedos.current.delete(event.pointerId)
    if (anterior !== undefined && ![...dedos.current.values()].includes(anterior)) {
      onLane(anterior, false)
    }
    dedos.current.set(event.pointerId, lane)
    onLane(lane, true)
    sincronizarLuzes()
  }

  const onPointerUp = (event: React.PointerEvent) => soltarDedo(event.pointerId)

  // Sair da aba com o dedo apoiado deixaria o traste preso para sempre.
  useEffect(() => {
    const soltarTudo = () => {
      dedos.current.clear()
      setAcesas([])
      onReleaseAll()
    }
    window.addEventListener('blur', soltarTudo)
    document.addEventListener('visibilitychange', soltarTudo)
    return () => {
      window.removeEventListener('blur', soltarTudo)
      document.removeEventListener('visibilitychange', soltarTudo)
    }
  }, [onReleaseAll])

  return (
    <div className="tc-root">
      <div className="tc-bar" style={{ height: `${RESERVED_TOP * 100}%` }}>
        <button className="tc-btn" onPointerDown={(e) => { e.stopPropagation(); onPause() }}>
          II
        </button>
        <button
          className={`tc-btn tc-sp ${starPowerActive ? 'ativo' : starPowerReady ? 'pronto' : ''}`}
          disabled={!starPowerReady && !starPowerActive}
          onPointerDown={(e) => { e.stopPropagation(); onStarPower() }}
        >
          ★
        </button>
      </div>

      <div
        ref={areaRef}
        className="tc-area"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {Array.from({ length: LANE_COUNT }, (_, indice) => {
          // `indice` e a posicao na TELA; a lane que ela aciona depende do flip.
          const lane = leftyFlip ? LANE_COUNT - 1 - indice : indice
          const zona = laneZone(indice)
          const cor = noteColors[lane] ?? '#ffffff'
          return (
            <div
              key={indice}
              className={`tc-zone ${acesas.includes(lane) ? 'acesa' : ''}`}
              style={{
                left: `${zona.left * 100}%`,
                width: `${zona.width * 100}%`,
                ['--cor' as string]: cor,
              }}
            >
              <span className="tc-pad" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
