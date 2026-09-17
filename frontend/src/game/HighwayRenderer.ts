import { GAME_CONFIG, LANE_COUNT } from './config'
import type { PlayerSession } from './PlayerSession'
import type { HitEvent } from './types'

export interface RenderOptions {
  sessions: PlayerSession[]
  songTime: number
  lookAhead: number
  reveal: number
  noteColors: string[]
  beats: number[]
  effects: 'low' | 'medium' | 'high'
  leftyFlip: boolean
}

interface Viewport {
  x: number
  y: number
  width: number
  height: number
}

const EFFECT_DURATION = 0.28

/**
 * Renderer da highway em Canvas 2D com perspectiva.
 *
 * A posicao de cada nota vem SEMPRE de `note.time - songTime`. Nada aqui
 * incrementa posicao por frame, entao queda de FPS nao desloca as notas.
 *
 * O desenho e feito por viewport: hoje sempre um, mas a assinatura ja
 * aceita varias sessoes para o dia em que houver mais de uma highway.
 */
export class HighwayRenderer {
  private ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private dpr = 1

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('Canvas 2D indisponivel neste navegador')
    this.ctx = context
    this.resize()
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
  }

  render(options: RenderOptions): void {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)

    const viewports = this.layout(options.sessions.length)
    options.sessions.forEach((session, index) => {
      this.renderSession(session, viewports[index], options)
    })
  }

  private layout(count: number): Viewport[] {
    // Singleplayer usa a tela inteira. A divisao existe para uso futuro.
    const columns = Math.max(1, count)
    const width = this.width / columns
    return Array.from({ length: columns }, (_, index) => ({
      x: index * width,
      y: 0,
      width,
      height: this.height,
    }))
  }

  // ------------------------------------------------------------------ geometria

  private geometry(viewport: Viewport) {
    const hitY = viewport.y + viewport.height * 0.8
    const topY = viewport.y + viewport.height * 0.08
    const centerX = viewport.x + viewport.width / 2
    const laneWidth = Math.min(viewport.width * 0.15, viewport.height * 0.14)
    const perspective = GAME_CONFIG.highway.perspective
    const scaleFar = 1 / (1 + perspective)

    const scaleAt = (t: number) => 1 / (1 + t * perspective)
    const yAt = (t: number) => hitY - (hitY - topY) * ((1 - scaleAt(t)) / (1 - scaleFar))
    const xAt = (lane: number, t: number) =>
      centerX + (lane - (LANE_COUNT - 1) / 2) * laneWidth * scaleAt(t)

    return { hitY, topY, centerX, laneWidth, scaleAt, yAt, xAt }
  }

  private renderSession(session: PlayerSession, viewport: Viewport, options: RenderOptions): void {
    const ctx = this.ctx
    const { songTime, lookAhead, reveal } = options
    const geo = this.geometry(viewport)

    ctx.save()
    // Reveal: a highway sobe e materializa no fim da intro.
    ctx.globalAlpha = Math.max(0, Math.min(1, reveal))
    ctx.translate(0, (1 - reveal) * viewport.height * 0.25)

    const starPower = session.score.starPowerActive

    this.drawSurface(geo, viewport, starPower, options)
    this.drawBeats(geo, options, songTime, lookAhead)
    this.drawNotes(session, geo, options, songTime, lookAhead)
    this.drawHitLine(geo, starPower, options)
    this.drawFrets(session, geo, options)
    this.drawEffects(session, geo, options, songTime)

    ctx.restore()
  }

  // ------------------------------------------------------------------ camadas

  private drawSurface(
    geo: ReturnType<HighwayRenderer['geometry']>,
    viewport: Viewport,
    starPower: boolean,
    options: RenderOptions,
  ): void {
    const ctx = this.ctx
    const nearLeft = geo.xAt(-0.5, 0)
    const nearRight = geo.xAt(LANE_COUNT - 0.5, 0)
    const farLeft = geo.xAt(-0.5, 1)
    const farRight = geo.xAt(LANE_COUNT - 0.5, 1)
    const nearY = geo.yAt(0)
    const farY = geo.yAt(1)

    ctx.beginPath()
    ctx.moveTo(nearLeft, nearY)
    ctx.lineTo(nearRight, nearY)
    ctx.lineTo(farRight, farY)
    ctx.lineTo(farLeft, farY)
    ctx.closePath()

    const gradient = ctx.createLinearGradient(0, farY, 0, nearY)
    if (starPower) {
      // Star power esfria a highway: e o unico momento em que o frio domina.
      gradient.addColorStop(0, 'rgba(12, 34, 48, 0.4)')
      gradient.addColorStop(1, 'rgba(36, 92, 118, 0.85)')
    } else {
      gradient.addColorStop(0, 'rgba(14, 8, 4, 0.38)')
      gradient.addColorStop(1, 'rgba(26, 15, 7, 0.88)')
    }
    ctx.fillStyle = gradient
    ctx.fill()

    // Bordas de neon da highway.
    ctx.lineWidth = Math.max(2, viewport.width * 0.004)
    ctx.strokeStyle = starPower ? 'rgba(207, 233, 242, 0.95)' : 'rgba(217, 154, 43, 0.8)'
    if (options.effects !== 'low') {
      ctx.shadowBlur = 18
      ctx.shadowColor = ctx.strokeStyle
    }
    ctx.beginPath()
    ctx.moveTo(nearLeft, nearY)
    ctx.lineTo(farLeft, farY)
    ctx.moveTo(nearRight, nearY)
    ctx.lineTo(farRight, farY)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Divisorias das lanes.
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(236, 228, 207, 0.14)'
    ctx.beginPath()
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      ctx.moveTo(geo.xAt(lane - 0.5, 0), nearY)
      ctx.lineTo(geo.xAt(lane - 0.5, 1), farY)
    }
    ctx.stroke()
  }

  private drawBeats(
    geo: ReturnType<HighwayRenderer['geometry']>,
    options: RenderOptions,
    songTime: number,
    lookAhead: number,
  ): void {
    const ctx = this.ctx
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'
    ctx.lineWidth = 1
    ctx.beginPath()

    for (const beat of options.beats) {
      const t = (beat - songTime) / lookAhead
      if (t < 0) continue
      if (t > 1) break
      const y = geo.yAt(t)
      ctx.moveTo(geo.xAt(-0.5, t), y)
      ctx.lineTo(geo.xAt(LANE_COUNT - 0.5, t), y)
    }
    ctx.stroke()
  }

  private drawNotes(
    session: PlayerSession,
    geo: ReturnType<HighwayRenderer['geometry']>,
    options: RenderOptions,
    songTime: number,
    lookAhead: number,
  ): void {
    const ctx = this.ctx
    const trail = GAME_CONFIG.highway.trailSeconds
    const gates = session.notes.gates
    const start = Math.max(0, session.notes.firstVisibleIndex(songTime - trail - 1) - 4)

    interface Drawable {
      t: number
      lane: number
      color: string
      type: string
      sustainT: number | null
    }
    const drawables: Drawable[] = []

    for (let i = start; i < gates.length; i++) {
      const gate = gates[i]
      const t = (gate.time - songTime) / lookAhead
      if (t > 1.02) break

      for (const state of gate.notes) {
        const lane = options.leftyFlip ? LANE_COUNT - 1 - state.note.lane : state.note.lane
        const color = options.noteColors[state.note.lane] ?? '#ffffff'
        const end = state.note.time + state.note.duration
        const sustainT = state.note.duration > 0 ? (end - songTime) / lookAhead : null

        if (state.missed) continue

        if (state.hit) {
          // A cabeca some, mas o rabo do sustain continua enquanto segurado.
          if (state.sustainAlive && sustainT !== null && sustainT > 0) {
            this.drawSustain(geo, lane, 0, Math.min(sustainT, 1), color, true)
          }
          continue
        }

        if (t < -trail / lookAhead) continue

        drawables.push({ t, lane, color, type: state.note.type, sustainT })
      }
    }

    // Longe primeiro, para as notas proximas ficarem por cima.
    drawables.sort((a, b) => b.t - a.t)

    for (const item of drawables) {
      if (item.sustainT !== null) {
        this.drawSustain(geo, item.lane, Math.max(item.t, 0), Math.min(item.sustainT, 1), item.color, false)
      }
    }
    for (const item of drawables) {
      this.drawNote(geo, item.lane, item.t, item.color, item.type, options)
    }

    ctx.shadowBlur = 0
  }

  private drawSustain(
    geo: ReturnType<HighwayRenderer['geometry']>,
    lane: number,
    fromT: number,
    toT: number,
    color: string,
    active: boolean,
  ): void {
    if (toT <= fromT) return
    const ctx = this.ctx
    const widthNear = geo.laneWidth * 0.26
    const yFrom = geo.yAt(fromT)
    const yTo = geo.yAt(toT)
    const xFrom = geo.xAt(lane, fromT)
    const xTo = geo.xAt(lane, toT)
    const halfFrom = (widthNear * geo.scaleAt(fromT)) / 2
    const halfTo = (widthNear * geo.scaleAt(toT)) / 2

    ctx.beginPath()
    ctx.moveTo(xFrom - halfFrom, yFrom)
    ctx.lineTo(xFrom + halfFrom, yFrom)
    ctx.lineTo(xTo + halfTo, yTo)
    ctx.lineTo(xTo - halfTo, yTo)
    ctx.closePath()

    ctx.fillStyle = color
    ctx.globalAlpha *= active ? 0.95 : 0.55
    ctx.fill()
    ctx.globalAlpha /= active ? 0.95 : 0.55
  }

  private drawNote(
    geo: ReturnType<HighwayRenderer['geometry']>,
    lane: number,
    t: number,
    color: string,
    type: string,
    options: RenderOptions,
  ): void {
    const ctx = this.ctx
    const scale = geo.scaleAt(t)
    const x = geo.xAt(lane, t)
    const y = geo.yAt(t)
    const width = geo.laneWidth * 0.78 * scale
    const height = width * 0.46

    if (options.effects === 'high') {
      ctx.shadowBlur = 16 * scale
      ctx.shadowColor = color
    }

    // Corpo da nota.
    roundedRect(ctx, x - width / 2, y - height / 2, width, height, height * 0.45)
    const gradient = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2)
    gradient.addColorStop(0, lighten(color, 0.35))
    gradient.addColorStop(1, color)
    ctx.fillStyle = type === 'tap' ? 'rgba(20, 16, 34, 0.9)' : gradient
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.lineWidth = Math.max(1, 2.4 * scale)
    ctx.strokeStyle = type === 'normal' ? 'rgba(255,255,255,0.85)' : color
    ctx.stroke()

    // HOPO e tap ganham um miolo diferente, para leitura rapida.
    if (type !== 'normal') {
      const inner = width * 0.26
      ctx.beginPath()
      ctx.ellipse(x, y, inner, inner * 0.55, 0, 0, Math.PI * 2)
      ctx.fillStyle = type === 'tap' ? color : 'rgba(255,255,255,0.9)'
      ctx.fill()
    }
  }

  private drawHitLine(
    geo: ReturnType<HighwayRenderer['geometry']>,
    starPower: boolean,
    options: RenderOptions,
  ): void {
    const ctx = this.ctx
    const y = geo.yAt(0)
    ctx.beginPath()
    ctx.moveTo(geo.xAt(-0.5, 0), y)
    ctx.lineTo(geo.xAt(LANE_COUNT - 0.5, 0), y)
    ctx.lineWidth = 4
    ctx.strokeStyle = starPower ? 'rgba(236, 249, 255, 0.98)' : 'rgba(236, 228, 207, 0.85)'
    if (options.effects !== 'low') {
      ctx.shadowBlur = 20
      ctx.shadowColor = ctx.strokeStyle
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  private drawFrets(
    session: PlayerSession,
    geo: ReturnType<HighwayRenderer['geometry']>,
    options: RenderOptions,
  ): void {
    const ctx = this.ctx
    const y = geo.yAt(0)

    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const display = options.leftyFlip ? LANE_COUNT - 1 - lane : lane
      const x = geo.xAt(display, 0)
      const held = session.heldLanes.has(lane)
      const color = options.noteColors[lane] ?? '#ffffff'
      const radiusX = geo.laneWidth * 0.4
      const radiusY = radiusX * 0.42

      ctx.beginPath()
      ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2)
      ctx.fillStyle = held ? color : 'rgba(255,255,255,0.06)'
      ctx.globalAlpha *= held ? 0.85 : 1
      ctx.fill()
      ctx.globalAlpha /= held ? 0.85 : 1

      ctx.lineWidth = 3
      ctx.strokeStyle = color
      if (held && options.effects !== 'low') {
        ctx.shadowBlur = 24
        ctx.shadowColor = color
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }

  private drawEffects(
    session: PlayerSession,
    geo: ReturnType<HighwayRenderer['geometry']>,
    options: RenderOptions,
    songTime: number,
  ): void {
    const ctx = this.ctx
    const y = geo.yAt(0)
    const alive: HitEvent[] = []

    for (const effect of session.effects) {
      const age = songTime - effect.time
      if (age < 0 || age > EFFECT_DURATION) continue
      alive.push(effect)

      const progress = age / EFFECT_DURATION
      const lane = options.leftyFlip ? LANE_COUNT - 1 - effect.lane : effect.lane
      const x = geo.xAt(lane, 0)
      const radius = geo.laneWidth * (0.35 + progress * 0.7)

      ctx.beginPath()
      ctx.ellipse(x, y, radius, radius * 0.45, 0, 0, Math.PI * 2)
      ctx.lineWidth = 3 * (1 - progress)
      ctx.strokeStyle = options.noteColors[effect.lane] ?? '#ffffff'
      ctx.globalAlpha *= 1 - progress
      ctx.stroke()
      ctx.globalAlpha /= Math.max(0.001, 1 - progress)
    }

    session.effects.length = 0
    session.effects.push(...alive)
  }
}

// ------------------------------------------------------------------ helpers

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function lighten(hex: string, amount: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return hex
  const value = parseInt(match[1], 16)
  const r = Math.min(255, ((value >> 16) & 255) + Math.round(255 * amount))
  const g = Math.min(255, ((value >> 8) & 255) + Math.round(255 * amount))
  const b = Math.min(255, (value & 255) + Math.round(255 * amount))
  return `rgb(${r}, ${g}, ${b})`
}
