import { useEffect, useRef } from 'react'

import { DEFAULT_NOTE_COLORS, LANE_COUNT } from '../game/config'
import { MiniHighwayState, MINI_LOOK_AHEAD } from '../game/MiniHighway'
import type { MPScoreboardRow } from '../game/multiplayerProtocol'
import type { Chart } from '../game/types'
import { formatNumber } from '../utils/format'

interface Props {
  /** Linhas do placar SEM o jogador local. */
  rivals: MPScoreboardRow[]
  /** Instrumento/dificuldade de cada oponente, para achar o chart certo. */
  charts: Map<string, Chart>
  /** Lido a cada frame: e o relogio da propria engine, nao um estado do React. */
  getSongTime: () => number
  noteColors: string[]
}

const ALTURA = 104

/**
 * Faixa de cada oponente, em miniatura, em tempo real.
 *
 * UM requestAnimationFrame desenha todas as miniaturas. Um loop por oponente
 * multiplicaria o custo a toa, e o tempo da musica vem direto da engine - nao
 * passa por estado do React, senao voltariamos a re-renderizar por frame.
 */
export function OpponentHighways({ rivals, charts, getSongTime, noteColors }: Props) {
  const canvases = useRef(new Map<string, HTMLCanvasElement>())
  const estados = useRef(new Map<string, MiniHighwayState>())
  const cores = useRef(noteColors)
  cores.current = noteColors

  // Aplica os acertos que chegaram no placar agregado.
  useEffect(() => {
    for (const rival of rivals) {
      let estado = estados.current.get(rival.id)
      if (!estado) {
        estado = new MiniHighwayState()
        estados.current.set(rival.id, estado)
      }
      const chart = charts.get(rival.id)
      if (chart && estado.noteCount === 0) estado.setChart(chart)
      estado.applyHits(rival.hits)
    }
    // Quem saiu da sala nao precisa mais de estado.
    for (const id of [...estados.current.keys()]) {
      if (!rivals.some((r) => r.id === id)) estados.current.delete(id)
    }
  }, [rivals, charts])

  useEffect(() => {
    let frame = 0

    const desenhar = () => {
      const songTime = getSongTime()
      for (const [id, canvas] of canvases.current) {
        const estado = estados.current.get(id)
        if (estado) pintar(canvas, estado, songTime, cores.current)
      }
      frame = requestAnimationFrame(desenhar)
    }

    frame = requestAnimationFrame(desenhar)
    return () => cancelAnimationFrame(frame)
  }, [getSongTime])

  if (rivals.length === 0) return null

  return (
    <div className="mini-highways">
      {rivals.map((rival) => (
        <div key={rival.id} className={`mini-card ${rival.connected ? '' : 'off'}`}>
          <div className="mini-head">
            <span className="mini-name">
              {rival.name}
              {!rival.connected && ' (CAIU)'}
            </span>
            <span className="mini-score">{formatNumber(rival.score)}</span>
          </div>
          <canvas
            className="mini-canvas"
            height={ALTURA}
            ref={(el) => {
              if (el) canvases.current.set(rival.id, el)
              else canvases.current.delete(rival.id)
            }}
          />
          <div className="mini-foot">
            <span className={rival.starPowerActive ? 'mini-sp on' : 'mini-sp'}>
              {rival.starPowerActive ? '★ STAR POWER' : `x${rival.multiplier}`}
            </span>
            <span>{rival.combo > 0 ? `${rival.combo} combo` : ' '}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

const CORES_JULGAMENTO: Record<string, string> = {
  perfect: '#ffffff',
  great: '#ffe9a8',
  good: '#ffc46b',
  miss: '#7a2a18',
}

function pintar(
  canvas: HTMLCanvasElement,
  estado: MiniHighwayState,
  songTime: number,
  noteColors: string[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // O canvas mede a largura pelo CSS; acompanhar evita imagem esticada.
  const largura = canvas.clientWidth
  if (largura > 0 && canvas.width !== largura) canvas.width = largura

  const w = canvas.width
  const h = canvas.height
  const hitY = h - 13
  ctx.clearRect(0, 0, w, h)

  // A miniatura tambem tem perspectiva, so que bem mais suave que a faixa
  // principal: com 172 px de largura, curvar demais deixaria ilegivel.
  const PERSP = 0.55
  const escalaEm = (t: number) => 1 / (1 + t * PERSP)
  const yEm = (t: number) => hitY - (hitY - 6) * ((1 - escalaEm(t)) / (1 - escalaEm(1)))
  const xEm = (lane: number, t: number) => {
    const meio = w / 2
    const passo = (w / LANE_COUNT) * escalaEm(t)
    return meio + (lane - (LANE_COUNT - 1) / 2) * passo
  }

  // Piso.
  const piso = ctx.createLinearGradient(0, yEm(1), 0, hitY)
  piso.addColorStop(0, 'rgba(8, 5, 3, 0.35)')
  piso.addColorStop(0.5, 'rgba(20, 12, 6, 0.75)')
  piso.addColorStop(1, 'rgba(34, 19, 9, 0.9)')
  ctx.fillStyle = piso
  ctx.beginPath()
  ctx.moveTo(xEm(-0.5, 0), hitY)
  ctx.lineTo(xEm(LANE_COUNT - 0.5, 0), hitY)
  ctx.lineTo(xEm(LANE_COUNT - 0.5, 1), yEm(1))
  ctx.lineTo(xEm(-0.5, 1), yEm(1))
  ctx.closePath()
  ctx.fill()

  // Divisorias convergindo, como na faixa principal.
  const div = ctx.createLinearGradient(0, hitY, 0, yEm(1))
  div.addColorStop(0, 'rgba(246, 240, 224, 0.55)')
  div.addColorStop(1, 'rgba(246, 240, 224, 0.05)')
  ctx.strokeStyle = div
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    ctx.moveTo(xEm(lane - 0.5, 0), hitY)
    ctx.lineTo(xEm(lane - 0.5, 1), yEm(1))
  }
  ctx.stroke()

  // Trilhos laterais.
  ctx.strokeStyle = 'rgba(217, 154, 43, 0.7)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(xEm(-0.5, 0), hitY)
  ctx.lineTo(xEm(-0.5, 1), yEm(1))
  ctx.moveTo(xEm(LANE_COUNT - 0.5, 0), hitY)
  ctx.lineTo(xEm(LANE_COUNT - 0.5, 1), yEm(1))
  ctx.stroke()

  if (estado.noteCount === 0) {
    ctx.fillStyle = 'rgba(239, 230, 214, .45)'
    ctx.font = "9px 'Space Mono', monospace"
    ctx.textAlign = 'center'
    ctx.fillText('carregando faixa...', w / 2, h / 2)
    return
  }

  // Trastes: aneis pequenos na hit line.
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const cor = noteColors[lane] ?? DEFAULT_NOTE_COLORS[lane]
    const cx = xEm(lane, 0)
    const rx = (w / LANE_COUNT) * 0.3
    ctx.beginPath()
    ctx.ellipse(cx, hitY, rx, rx * 0.5, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(10, 7, 4, 0.9)'
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.strokeStyle = cor
    ctx.stroke()
  }

  // Notas, com o mesmo desenho de gema da faixa principal, em escala.
  for (const nota of estado.visibleNotes(songTime, MINI_LOOK_AHEAD)) {
    const brilho = estado.flashFor(nota, songTime)
    if (nota.judgement && brilho <= 0) continue

    const t = nota.progress
    const escala = escalaEm(t)
    const cx = xEm(nota.lane, t)
    const cy = yEm(t)
    const rx = (w / LANE_COUNT) * 0.3 * escala
    const ry = rx * 0.62

    if (nota.judgement) {
      // Flash no lugar da nota acertada, expandindo e apagando.
      ctx.globalAlpha = brilho
      ctx.beginPath()
      ctx.ellipse(
        xEm(nota.lane, 0),
        hitY,
        rx * (1.1 + (1 - brilho) * 1.5),
        ry * (1.1 + (1 - brilho) * 1.5),
        0,
        0,
        Math.PI * 2,
      )
      ctx.fillStyle = CORES_JULGAMENTO[nota.judgement] ?? '#ffffff'
      ctx.fill()
      ctx.globalAlpha = 1
      continue
    }

    const cor = noteColors[nota.lane] ?? DEFAULT_NOTE_COLORS[nota.lane]
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(8, 5, 3, 0.9)'
    ctx.fill()

    ctx.beginPath()
    ctx.ellipse(cx, cy, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2)
    const domo = ctx.createRadialGradient(cx, cy - ry * 0.4, 0, cx, cy, rx)
    domo.addColorStop(0, '#ffffff')
    domo.addColorStop(0.45, cor)
    domo.addColorStop(1, cor)
    ctx.fillStyle = domo
    ctx.fill()

    ctx.lineWidth = Math.max(1, rx * 0.22)
    ctx.strokeStyle = cor
    ctx.stroke()
  }
}
