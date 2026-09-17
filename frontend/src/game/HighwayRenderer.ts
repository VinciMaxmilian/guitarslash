import { GAME_CONFIG, LANE_COUNT } from './config'
import type { PlayerSession } from './PlayerSession'

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

type Geometry = ReturnType<HighwayRenderer['geometry']>

const HIT_EFFECT = 0.34
const MISS_EFFECT = 0.4
/** Tempo que a nota leva para sumir depois de passar da hit line. */
const PASS_FADE = 0.09

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

  /** Alpha da sessao atual (usado pelo reveal da intro). */
  private base = 1

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

  /** Alpha relativo ao reveal da intro. */
  private alpha(value: number): void {
    this.ctx.globalAlpha = Math.max(0, Math.min(1, this.base * value))
  }

  // ------------------------------------------------------------------ geometria

  private geometry(viewport: Viewport) {
    const hitY = viewport.y + viewport.height * 0.78
    const topY = viewport.y + viewport.height * 0.06
    const centerX = viewport.x + viewport.width / 2
    const laneWidth = Math.min(viewport.width * 0.145, viewport.height * 0.15)
    const perspective = GAME_CONFIG.highway.perspective
    const scaleFar = 1 / (1 + perspective)

    const scaleAt = (t: number) => 1 / (1 + t * perspective)
    const yAt = (t: number) => hitY - (hitY - topY) * ((1 - scaleAt(t)) / (1 - scaleFar))
    const xAt = (lane: number, t: number) =>
      centerX + (lane - (LANE_COUNT - 1) / 2) * laneWidth * scaleAt(t)

    return { hitY, topY, centerX, laneWidth, scaleAt, yAt, xAt, viewport }
  }

  private renderSession(session: PlayerSession, viewport: Viewport, options: RenderOptions): void {
    const ctx = this.ctx
    const { songTime, lookAhead, reveal } = options
    const geo = this.geometry(viewport)

    ctx.save()
    this.base = Math.max(0, Math.min(1, reveal))
    // Reveal: a highway sobe e materializa no fim da intro.
    ctx.translate(0, (1 - reveal) * viewport.height * 0.3)

    const starPower = session.score.starPowerActive

    this.drawSurface(geo, session, options)
    this.drawBeats(geo, options, songTime, lookAhead)
    this.drawHeldLanes(geo, session, options)
    this.drawNotes(session, geo, options, songTime, lookAhead)
    this.drawHitEffects(session, geo, options, songTime)
    this.drawHitLine(geo, session, options)
    this.drawFrets(session, geo, options, songTime)
    this.drawMissEffects(session, geo, songTime)
    if (starPower) this.drawStarPowerGlow(geo, songTime)

    ctx.globalAlpha = 1
    ctx.restore()
  }

  // ------------------------------------------------------------------ superficie

  private drawSurface(geo: Geometry, session: PlayerSession, options: RenderOptions): void {
    const ctx = this.ctx
    const starPower = session.score.starPowerActive
    const nearLeft = geo.xAt(-0.5, 0)
    const nearRight = geo.xAt(LANE_COUNT - 0.5, 0)
    const farLeft = geo.xAt(-0.5, 1)
    const farRight = geo.xAt(LANE_COUNT - 0.5, 1)
    const nearY = geo.yAt(0)
    const farY = geo.yAt(1)

    const path = new Path2D()
    path.moveTo(nearLeft, nearY)
    path.lineTo(nearRight, nearY)
    path.lineTo(farRight, farY)
    path.lineTo(farLeft, farY)
    path.closePath()

    // Piso da highway.
    this.alpha(1)
    const floor = ctx.createLinearGradient(0, farY, 0, nearY)
    if (starPower) {
      floor.addColorStop(0, 'rgba(10, 28, 42, 0.55)')
      floor.addColorStop(0.55, 'rgba(18, 52, 74, 0.8)')
      floor.addColorStop(1, 'rgba(40, 104, 132, 0.92)')
    } else {
      floor.addColorStop(0, 'rgba(10, 6, 3, 0.55)')
      floor.addColorStop(0.55, 'rgba(20, 12, 6, 0.82)')
      floor.addColorStop(1, 'rgba(34, 19, 9, 0.94)')
    }
    ctx.fillStyle = floor
    ctx.fill(path)

    // Cada lane recebe um leve brilho da propria cor, para a pista nao ficar
    // morta antes das notas chegarem.
    ctx.save()
    ctx.clip(path)
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const display = options.leftyFlip ? LANE_COUNT - 1 - lane : lane
      const color = options.noteColors[lane] ?? '#ffffff'
      const glow = ctx.createLinearGradient(0, nearY, 0, farY)
      glow.addColorStop(0, hexToRgba(color, 0.22))
      glow.addColorStop(0.35, hexToRgba(color, 0.06))
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.moveTo(geo.xAt(display - 0.5, 0), nearY)
      ctx.lineTo(geo.xAt(display + 0.5, 0), nearY)
      ctx.lineTo(geo.xAt(display + 0.5, 1), farY)
      ctx.lineTo(geo.xAt(display - 0.5, 1), farY)
      ctx.closePath()
      ctx.fill()
    }

    // Neblina no fundo: esconde o ponto de fuga e da profundidade.
    const fog = ctx.createLinearGradient(0, farY, 0, farY + (nearY - farY) * 0.34)
    fog.addColorStop(0, starPower ? 'rgba(6, 18, 28, 0.95)' : 'rgba(8, 4, 2, 0.95)')
    fog.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = fog
    ctx.fill(path)
    ctx.restore()

    // Divisorias das lanes, mais fortes perto do jogador.
    const divider = ctx.createLinearGradient(0, nearY, 0, farY)
    divider.addColorStop(0, 'rgba(236, 228, 207, 0.35)')
    divider.addColorStop(1, 'rgba(236, 228, 207, 0.03)')
    ctx.strokeStyle = divider
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      ctx.moveTo(geo.xAt(lane - 0.5, 0), nearY)
      ctx.lineTo(geo.xAt(lane - 0.5, 1), farY)
    }
    ctx.stroke()

    // Trilhos laterais. Ficam mais quentes conforme o multiplicador sobe.
    const heat = Math.min(1, (session.score.multiplier - 1) / 3)
    const railColor = starPower
      ? 'rgba(207, 233, 242, 0.95)'
      : `rgba(${Math.round(217 + heat * 30)}, ${Math.round(154 - heat * 40)}, ${Math.round(43 + heat * 10)}, ${0.7 + heat * 0.3})`

    ctx.lineWidth = Math.max(2.5, geo.viewport.width * 0.0045)
    ctx.strokeStyle = railColor
    if (options.effects !== 'low') {
      ctx.shadowBlur = 16 + heat * 14
      ctx.shadowColor = railColor
    }
    ctx.beginPath()
    ctx.moveTo(nearLeft, nearY)
    ctx.lineTo(farLeft, farY)
    ctx.moveTo(nearRight, nearY)
    ctx.lineTo(farRight, farY)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  private drawBeats(
    geo: Geometry,
    options: RenderOptions,
    songTime: number,
    lookAhead: number,
  ): void {
    const ctx = this.ctx
    this.alpha(1)
    ctx.lineWidth = 1

    for (const beat of options.beats) {
      const t = (beat - songTime) / lookAhead
      if (t < 0) continue
      if (t > 1) break
      const y = geo.yAt(t)
      // Linhas somem ao longe, junto com a neblina.
      ctx.strokeStyle = `rgba(236, 228, 207, ${0.16 * (1 - t) + 0.02})`
      ctx.beginPath()
      ctx.moveTo(geo.xAt(-0.5, t), y)
      ctx.lineTo(geo.xAt(LANE_COUNT - 0.5, t), y)
      ctx.stroke()
    }
  }

  /** Coluna de luz na lane enquanto o traste estiver segurado. */
  private drawHeldLanes(geo: Geometry, session: PlayerSession, options: RenderOptions): void {
    if (session.heldLanes.size === 0) return
    const ctx = this.ctx
    const nearY = geo.yAt(0)
    const topT = 0.42
    const topYLocal = geo.yAt(topT)

    for (const lane of session.heldLanes) {
      const display = options.leftyFlip ? LANE_COUNT - 1 - lane : lane
      const color = options.noteColors[lane] ?? '#ffffff'
      const gradient = ctx.createLinearGradient(0, nearY, 0, topYLocal)
      gradient.addColorStop(0, hexToRgba(color, 0.42))
      gradient.addColorStop(1, 'rgba(0,0,0,0)')

      this.alpha(1)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(geo.xAt(display - 0.46, 0), nearY)
      ctx.lineTo(geo.xAt(display + 0.46, 0), nearY)
      ctx.lineTo(geo.xAt(display + 0.46, topT), topYLocal)
      ctx.lineTo(geo.xAt(display - 0.46, topT), topYLocal)
      ctx.closePath()
      ctx.fill()
    }
  }

  // ------------------------------------------------------------------ notas

  private drawNotes(
    session: PlayerSession,
    geo: Geometry,
    options: RenderOptions,
    songTime: number,
    lookAhead: number,
  ): void {
    const ctx = this.ctx
    const gates = session.notes.gates
    const start = Math.max(0, session.notes.firstVisibleIndex(songTime - 1) - 4)
    const starPower = session.score.starPowerActive

    interface Drawable {
      t: number
      lane: number
      color: string
      type: string
      sustainT: number | null
      fade: number
    }
    const drawables: Drawable[] = []
    const activeSustains: Drawable[] = []

    for (let i = start; i < gates.length; i++) {
      const gate = gates[i]
      const t = (gate.time - songTime) / lookAhead
      if (t > 1.02) break

      for (const state of gate.notes) {
        if (state.missed) continue

        const lane = options.leftyFlip ? LANE_COUNT - 1 - state.note.lane : state.note.lane
        const color = options.noteColors[state.note.lane] ?? '#ffffff'
        const end = state.note.time + state.note.duration
        const sustainT = state.note.duration > 0 ? (end - songTime) / lookAhead : null

        if (state.hit) {
          // A cabeca some, o rabo do sustain continua enquanto segurado.
          if (state.sustainAlive && sustainT !== null && sustainT > 0) {
            activeSustains.push({ t: 0, lane, color, type: state.note.type, sustainT, fade: 1 })
          }
          continue
        }

        // Nota que passou da hit line sem ser acertada some rapido.
        const past = -t * lookAhead
        if (past > PASS_FADE) continue
        const fade = past > 0 ? 1 - past / PASS_FADE : 1

        drawables.push({ t, lane, color, type: state.note.type, sustainT, fade })
      }
    }

    // Longe primeiro, para as notas proximas ficarem por cima.
    drawables.sort((a, b) => b.t - a.t)

    for (const item of drawables) {
      if (item.sustainT !== null) {
        this.drawSustain(
          geo,
          item.lane,
          Math.max(item.t, 0),
          Math.min(item.sustainT, 1),
          item.color,
          false,
          item.fade,
          options,
        )
      }
    }
    for (const item of activeSustains) {
      this.drawSustain(geo, item.lane, 0, Math.min(item.sustainT!, 1), item.color, true, 1, options)
    }
    for (const item of drawables) {
      this.drawNote(geo, item, options, starPower)
    }

    ctx.shadowBlur = 0
  }

  private drawSustain(
    geo: Geometry,
    lane: number,
    fromT: number,
    toT: number,
    color: string,
    active: boolean,
    fade: number,
    options: RenderOptions,
  ): void {
    if (toT <= fromT) return
    const ctx = this.ctx
    const widthNear = geo.laneWidth * (active ? 0.34 : 0.28)
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

    this.alpha((active ? 0.95 : 0.6) * fade)
    if (active && options.effects !== 'low') {
      ctx.shadowBlur = 20
      ctx.shadowColor = color
    }
    const body = ctx.createLinearGradient(0, yFrom, 0, yTo)
    body.addColorStop(0, active ? lighten(color, 0.45) : color)
    body.addColorStop(1, hexToRgba(color, 0.65))
    ctx.fillStyle = body
    ctx.fill()
    ctx.shadowBlur = 0

    // Fio brilhante no centro do sustain.
    this.alpha((active ? 0.9 : 0.4) * fade)
    ctx.strokeStyle = active ? 'rgba(255,255,255,0.85)' : hexToRgba(color, 0.7)
    ctx.lineWidth = Math.max(1, halfFrom * 0.35)
    ctx.beginPath()
    ctx.moveTo(xFrom, yFrom)
    ctx.lineTo(xTo, yTo)
    ctx.stroke()
  }

  private drawNote(
    geo: Geometry,
    item: { t: number; lane: number; color: string; type: string; fade: number },
    options: RenderOptions,
    starPower: boolean,
  ): void {
    const ctx = this.ctx
    const { t, lane, color, type, fade } = item
    const scale = geo.scaleAt(t)
    const x = geo.xAt(lane, t)
    const y = geo.yAt(t)
    const width = geo.laneWidth * 0.92 * scale
    const height = width * 0.5
    const radius = height * 0.48

    // Sombra no piso: e o que "assenta" a nota na pista.
    this.alpha(0.4 * fade)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.beginPath()
    ctx.ellipse(x, y + height * 0.42, width * 0.5, height * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()

    this.alpha(fade)
    if (options.effects !== 'low') {
      ctx.shadowBlur = (options.effects === 'high' ? 22 : 12) * scale
      ctx.shadowColor = color
    }

    // Corpo.
    roundedRect(ctx, x - width / 2, y - height / 2, width, height, radius)
    const body = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2)
    if (type === 'tap') {
      body.addColorStop(0, 'rgba(46, 38, 28, 0.95)')
      body.addColorStop(1, 'rgba(18, 14, 10, 0.95)')
    } else {
      body.addColorStop(0, lighten(color, 0.55))
      body.addColorStop(0.45, color)
      body.addColorStop(1, darken(color, 0.35))
    }
    ctx.fillStyle = body
    ctx.fill()
    ctx.shadowBlur = 0

    // Aro.
    ctx.lineWidth = Math.max(1.2, 2.6 * scale)
    ctx.strokeStyle = starPower ? 'rgba(236, 249, 255, 0.95)' : lighten(color, 0.7)
    ctx.stroke()

    // Brilho superior: da volume a nota.
    this.alpha(0.55 * fade)
    roundedRect(
      ctx,
      x - width * 0.42,
      y - height * 0.4,
      width * 0.84,
      height * 0.34,
      height * 0.2,
    )
    const gloss = ctx.createLinearGradient(0, y - height * 0.4, 0, y - height * 0.06)
    gloss.addColorStop(0, 'rgba(255,255,255,0.75)')
    gloss.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gloss
    ctx.fill()

    // HOPO e tap ganham um miolo diferente, para leitura rapida.
    if (type !== 'normal') {
      this.alpha(fade)
      const inner = width * 0.22
      ctx.beginPath()
      ctx.ellipse(x, y, inner, inner * 0.6, 0, 0, Math.PI * 2)
      ctx.fillStyle = type === 'tap' ? color : 'rgba(255,255,255,0.92)'
      ctx.fill()
    }
  }

  // ------------------------------------------------------------------ hit line e trastes

  private drawHitLine(geo: Geometry, session: PlayerSession, options: RenderOptions): void {
    const ctx = this.ctx
    const y = geo.yAt(0)
    const left = geo.xAt(-0.5, 0)
    const right = geo.xAt(LANE_COUNT - 0.5, 0)
    const starPower = session.score.starPowerActive
    const thickness = Math.max(6, geo.laneWidth * 0.12)

    // Barra metalica sob os trastes.
    this.alpha(1)
    const bar = ctx.createLinearGradient(0, y - thickness / 2, 0, y + thickness / 2)
    bar.addColorStop(0, starPower ? 'rgba(180, 225, 240, 0.95)' : 'rgba(120, 92, 54, 0.95)')
    bar.addColorStop(0.45, starPower ? 'rgba(236, 249, 255, 1)' : 'rgba(236, 228, 207, 0.95)')
    bar.addColorStop(1, starPower ? 'rgba(90, 150, 180, 0.9)' : 'rgba(58, 36, 19, 0.95)')
    ctx.fillStyle = bar
    ctx.fillRect(left, y - thickness / 2, right - left, thickness)

    if (options.effects !== 'low') {
      this.alpha(0.8)
      ctx.strokeStyle = starPower ? 'rgba(236, 249, 255, 0.9)' : 'rgba(255, 210, 120, 0.85)'
      ctx.lineWidth = 2
      ctx.shadowBlur = 22
      ctx.shadowColor = ctx.strokeStyle
      ctx.beginPath()
      ctx.moveTo(left, y - thickness / 2)
      ctx.lineTo(right, y - thickness / 2)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }

  private drawFrets(
    session: PlayerSession,
    geo: Geometry,
    options: RenderOptions,
    songTime: number,
  ): void {
    const ctx = this.ctx
    const y = geo.yAt(0)

    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const display = options.leftyFlip ? LANE_COUNT - 1 - lane : lane
      const x = geo.xAt(display, 0)
      const held = session.heldLanes.has(lane)
      const color = options.noteColors[lane] ?? '#ffffff'

      // Pulso curto quando a nota e acertada nesta lane.
      const recent = session.effects.find(
        (effect) => effect.lane === lane && songTime - effect.time < HIT_EFFECT,
      )
      const punch = recent ? 1 - (songTime - recent.time) / HIT_EFFECT : 0

      const radiusX = geo.laneWidth * (0.44 + punch * 0.12)
      const radiusY = radiusX * 0.4
      const press = held ? radiusY * 0.18 : 0

      // Base escura (o "poco" do traste).
      this.alpha(1)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      ctx.beginPath()
      ctx.ellipse(x, y + radiusY * 0.35, radiusX * 1.05, radiusY * 1.05, 0, 0, Math.PI * 2)
      ctx.fill()

      // Miolo.
      const fill = ctx.createRadialGradient(x, y - radiusY * 0.4 + press, 0, x, y + press, radiusX)
      if (held || punch > 0) {
        fill.addColorStop(0, lighten(color, 0.75))
        fill.addColorStop(0.55, color)
        fill.addColorStop(1, darken(color, 0.4))
      } else {
        fill.addColorStop(0, hexToRgba(color, 0.22))
        fill.addColorStop(1, 'rgba(12, 8, 4, 0.85)')
      }
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.ellipse(x, y + press, radiusX, radiusY, 0, 0, Math.PI * 2)
      ctx.fill()

      // Aro.
      ctx.lineWidth = Math.max(2.5, radiusY * 0.34)
      ctx.strokeStyle = held || punch > 0 ? lighten(color, 0.6) : color
      if (options.effects !== 'low' && (held || punch > 0)) {
        ctx.shadowBlur = 20 + punch * 24
        ctx.shadowColor = color
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }

  // ------------------------------------------------------------------ efeitos

  private drawHitEffects(
    session: PlayerSession,
    geo: Geometry,
    options: RenderOptions,
    songTime: number,
  ): void {
    const ctx = this.ctx
    const y = geo.yAt(0)
    const alive = session.effects.filter((effect) => {
      const age = songTime - effect.time
      return age >= 0 && age <= HIT_EFFECT
    })

    for (const effect of alive) {
      const progress = (songTime - effect.time) / HIT_EFFECT
      const lane = options.leftyFlip ? LANE_COUNT - 1 - effect.lane : effect.lane
      const x = geo.xAt(lane, 0)
      const color = options.noteColors[effect.lane] ?? '#ffffff'
      const fade = 1 - progress

      // Coluna de luz subindo pela lane.
      const topT = 0.3 * (0.4 + progress)
      const topYLocal = geo.yAt(topT)
      this.alpha(fade * 0.55)
      const column = ctx.createLinearGradient(0, y, 0, topYLocal)
      column.addColorStop(0, hexToRgba(color, 0.9))
      column.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = column
      ctx.beginPath()
      ctx.moveTo(geo.xAt(lane - 0.44, 0), y)
      ctx.lineTo(geo.xAt(lane + 0.44, 0), y)
      ctx.lineTo(geo.xAt(lane + 0.3, topT), topYLocal)
      ctx.lineTo(geo.xAt(lane - 0.3, topT), topYLocal)
      ctx.closePath()
      ctx.fill()

      // Clarao no traste.
      this.alpha(fade * 0.9)
      const flash = ctx.createRadialGradient(x, y, 0, x, y, geo.laneWidth * (0.5 + progress * 0.7))
      flash.addColorStop(0, 'rgba(255,255,255,0.95)')
      flash.addColorStop(0.35, hexToRgba(color, 0.75))
      flash.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = flash
      ctx.beginPath()
      ctx.ellipse(
        x,
        y,
        geo.laneWidth * (0.5 + progress * 0.7),
        geo.laneWidth * (0.24 + progress * 0.34),
        0,
        0,
        Math.PI * 2,
      )
      ctx.fill()

      // Anel que abre.
      this.alpha(fade)
      ctx.strokeStyle = lighten(color, 0.5)
      ctx.lineWidth = Math.max(1.5, 4 * fade)
      ctx.beginPath()
      ctx.ellipse(
        x,
        y,
        geo.laneWidth * (0.32 + progress * 0.85),
        geo.laneWidth * (0.14 + progress * 0.38),
        0,
        0,
        Math.PI * 2,
      )
      ctx.stroke()

      // Faiscas.
      if (options.effects === 'high') {
        this.alpha(fade * 0.85)
        ctx.strokeStyle = lighten(color, 0.75)
        ctx.lineWidth = Math.max(1, 2.4 * fade)
        const rays = 8
        const inner = geo.laneWidth * 0.3
        const outer = geo.laneWidth * (0.42 + progress * 0.95)
        ctx.beginPath()
        for (let index = 0; index < rays; index++) {
          const angle = (index / rays) * Math.PI * 2 + progress * 0.7
          const squash = 0.45
          ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner * squash)
          ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer * squash)
        }
        ctx.stroke()
      }
    }

    session.effects.length = 0
    session.effects.push(...alive)
  }

  private drawMissEffects(session: PlayerSession, geo: Geometry, songTime: number): void {
    const ctx = this.ctx
    const y = geo.yAt(0)
    const alive = session.misses.filter((miss) => {
      const age = songTime - miss.time
      return age >= 0 && age <= MISS_EFFECT
    })

    for (const miss of alive) {
      const fade = 1 - (songTime - miss.time) / MISS_EFFECT
      const x = geo.xAt(miss.lane, 0)
      const size = geo.laneWidth * 0.34

      this.alpha(fade * 0.9)
      ctx.strokeStyle = '#ff4d3d'
      ctx.lineWidth = Math.max(2, 5 * fade)
      ctx.beginPath()
      ctx.moveTo(x - size, y - size * 0.5)
      ctx.lineTo(x + size, y + size * 0.5)
      ctx.moveTo(x + size, y - size * 0.5)
      ctx.lineTo(x - size, y + size * 0.5)
      ctx.stroke()
    }

    session.misses.length = 0
    session.misses.push(...alive)
  }

  /** Brilho pulsante que toma a pista durante o star power. */
  private drawStarPowerGlow(geo: Geometry, songTime: number): void {
    const ctx = this.ctx
    const nearY = geo.yAt(0)
    const farY = geo.yAt(1)
    const pulse = 0.12 + 0.08 * Math.sin(songTime * 8)

    this.alpha(pulse)
    const glow = ctx.createLinearGradient(0, nearY, 0, farY)
    glow.addColorStop(0, 'rgba(236, 249, 255, 0.9)')
    glow.addColorStop(1, 'rgba(120, 200, 255, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.moveTo(geo.xAt(-0.5, 0), nearY)
    ctx.lineTo(geo.xAt(LANE_COUNT - 0.5, 0), nearY)
    ctx.lineTo(geo.xAt(LANE_COUNT - 0.5, 1), farY)
    ctx.lineTo(geo.xAt(-0.5, 1), farY)
    ctx.closePath()
    ctx.fill()
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

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function lighten(hex: string, amount: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map((channel) => Math.min(255, channel + Math.round(255 * amount)))
  return `rgb(${r}, ${g}, ${b})`
}

export function darken(hex: string, amount: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map((channel) => Math.max(0, Math.round(channel * (1 - amount))))
  return `rgb(${r}, ${g}, ${b})`
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}
