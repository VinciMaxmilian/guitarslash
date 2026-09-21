import { GAME_CONFIG, LANE_COUNT } from './config'
import { fretArrival } from './fretArrival'
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
/** Prata azulado das notas de frase de star power. */
const STAR_TINT = '#cfe9f2'
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
    if (starPower) this.drawStarPowerGlow(geo, songTime, options)
    // Por ULTIMO: o raio da frase passa por cima de tudo, inclusive dos
    // trastes. E a recompensa, e ela tem de ser impossivel de nao ver.
    this.drawStarPowerBursts(session, geo, options, songTime)

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
      // Quase preto e NEUTRO. A pista da referencia nao tem cor propria: ela
      // e o fundo escuro contra o qual as cinco cores das notas aparecem.
      // Um piso marrom tinge tudo e come o contraste das notas.
      floor.addColorStop(0, 'rgba(6, 6, 8, 0.62)')
      floor.addColorStop(0.55, 'rgba(12, 12, 15, 0.88)')
      floor.addColorStop(1, 'rgba(18, 18, 22, 0.96)')
    }
    ctx.fillStyle = floor
    ctx.fill(path)

    // Cada lane recebe um respingo da propria cor JUNTO DA HIT LINE, e nada
    // mais. Antes o degrade subia por metade da pista e pintava a lane
    // inteira: a nota chegava sobre um fundo da mesma cor dela e perdia a
    // leitura, que e exatamente o que a pista preta da referencia protege.
    ctx.save()
    ctx.clip(path)
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const display = options.leftyFlip ? LANE_COUNT - 1 - lane : lane
      const color = options.noteColors[lane] ?? '#ffffff'
      const glow = ctx.createLinearGradient(0, nearY, 0, geo.yAt(0.22))
      glow.addColorStop(0, hexToRgba(color, 0.12))
      glow.addColorStop(0.45, hexToRgba(color, 0.03))
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

    // Textura de metal escovado: riscos finos AO LONGO da pista, seguindo a
    // perspectiva. Sao eles que tiram o aspecto de plastico liso - metal
    // escovado nunca e uma cor chapada, e a olho nu o que se ve sao os
    // riscos, nao o tom.
    if (options.effects !== 'low') {
      const riscos = options.effects === 'high' ? 84 : 44
      const random = seeded(1337)
      ctx.lineWidth = 1
      for (let i = 0; i < riscos; i++) {
        // Posicao fixa por sorteio semeado: risco que muda de lugar a cada
        // frame vira chuvisco em vez de textura.
        const lane = random() * LANE_COUNT - 0.5
        const forca = 0.03 + random() * 0.06
        const inicio = random() * 0.5
        const fim = inicio + 0.3 + random() * 0.5
        const claro = random() > 0.5
        const risco = ctx.createLinearGradient(0, nearY, 0, farY)
        const tom = claro ? '255, 246, 228' : '0, 0, 0'
        risco.addColorStop(0, `rgba(${tom}, ${forca})`)
        risco.addColorStop(0.7, `rgba(${tom}, ${forca * 0.35})`)
        risco.addColorStop(1, `rgba(${tom}, 0)`)
        ctx.strokeStyle = risco
        ctx.beginPath()
        ctx.moveTo(geo.xAt(lane, inicio), geo.yAt(inicio))
        ctx.lineTo(geo.xAt(lane, Math.min(1, fim)), geo.yAt(Math.min(1, fim)))
        ctx.stroke()
      }

      // Faixa especular atravessada: o reflexo que prova que a superficie e
      // metalica, e nao pintada.
      const brilho = ctx.createLinearGradient(nearLeft, nearY, nearRight, geo.yAt(0.55))
      brilho.addColorStop(0, 'rgba(255, 255, 255, 0)')
      brilho.addColorStop(0.42, starPower ? 'rgba(200, 240, 255, 0.1)' : 'rgba(255, 238, 208, 0.07)')
      brilho.addColorStop(0.58, starPower ? 'rgba(200, 240, 255, 0.1)' : 'rgba(255, 238, 208, 0.07)')
      brilho.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = brilho
      ctx.fill(path)
    }

    // Neblina no fundo: esconde o ponto de fuga e da profundidade.
    const fog = ctx.createLinearGradient(0, farY, 0, farY + (nearY - farY) * 0.34)
    fog.addColorStop(0, starPower ? 'rgba(6, 18, 28, 0.95)' : 'rgba(5, 5, 7, 0.95)')
    fog.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = fog
    ctx.fill(path)
    ctx.restore()

    // Divisorias das lanes. Na referencia elas sao claras e bem visiveis ao
    // longo de toda a pista - sao elas que vendem a perspectiva.
    const divider = ctx.createLinearGradient(0, nearY, 0, farY)
    divider.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
    divider.addColorStop(0.45, 'rgba(235, 240, 248, 0.45)')
    divider.addColorStop(1, 'rgba(220, 230, 245, 0.05)')
    ctx.strokeStyle = divider
    ctx.lineWidth = Math.max(1.2, geo.viewport.width * 0.0016)
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      ctx.moveTo(geo.xAt(lane - 0.5, 0), nearY)
      ctx.lineTo(geo.xAt(lane - 0.5, 1), farY)
    }
    ctx.stroke()
    ctx.lineCap = 'butt' 

    // Trilhos laterais. Ficam mais quentes conforme o multiplicador sobe.
    const heat = Math.min(1, (session.score.multiplier - 1) / 3)
    // O trilho e BRANCO, como na referencia. O multiplicador nao muda a cor
    // dele - muda o halo em volta (`heatGlow`). Trilho dourado puxava a pista
    // inteira para o ambar e era metade do problema do tom quente.
    const railColor = starPower ? 'rgba(207, 233, 242, 0.98)' : 'rgba(248, 250, 255, 0.95)'
    const heatGlow = starPower
      ? 'rgba(150, 220, 255, 0.9)'
      : `rgba(255, ${Math.round(220 - heat * 90)}, ${Math.round(170 - heat * 130)}, ${0.5 + heat * 0.5})`

    const espessura = Math.max(2.5, geo.viewport.width * 0.0045)

    // Sombra do trilho, por baixo e deslocada: e ela que levanta o trilho da
    // pista em vez de deixa-lo parecendo um risco desenhado nela.
    this.alpha(0.75)
    ctx.lineWidth = espessura * 1.9
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    ctx.moveTo(nearLeft, nearY + espessura)
    ctx.lineTo(farLeft, farY)
    ctx.moveTo(nearRight, nearY + espessura)
    ctx.lineTo(farRight, farY)
    ctx.stroke()

    this.alpha(1)
    ctx.lineWidth = espessura
    ctx.strokeStyle = railColor
    if (options.effects !== 'low') {
      ctx.shadowBlur = 14 + heat * 20
      ctx.shadowColor = heatGlow
    }
    ctx.beginPath()
    ctx.moveTo(nearLeft, nearY)
    ctx.lineTo(farLeft, farY)
    ctx.moveTo(nearRight, nearY)
    ctx.lineTo(farRight, farY)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Fio claro no topo do trilho: o bisel do metal.
    this.alpha(0.55)
    ctx.lineWidth = Math.max(1, espessura * 0.38)
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.9)'
    ctx.beginPath()
    ctx.moveTo(nearLeft, nearY - espessura * 0.4)
    ctx.lineTo(farLeft, farY - espessura * 0.1)
    ctx.moveTo(nearRight, nearY - espessura * 0.4)
    ctx.lineTo(farRight, farY - espessura * 0.1)
    ctx.stroke()
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
      ctx.strokeStyle = `rgba(226, 234, 248, ${0.18 * (1 - t) + 0.02})`
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
    // Curta e discreta: e uma confirmacao de que o traste esta apertado, nao
    // um holofote. Subindo por 0.42 da pista com alpha 0.42, ela banhava de
    // cor justamente a faixa onde as notas precisam ser lidas.
    const topT = 0.26
    const topYLocal = geo.yAt(topT)

    for (const lane of session.heldLanes) {
      const display = options.leftyFlip ? LANE_COUNT - 1 - lane : lane
      const color = options.noteColors[lane] ?? '#ffffff'
      const gradient = ctx.createLinearGradient(0, nearY, 0, topYLocal)
      gradient.addColorStop(0, hexToRgba(color, 0.26))
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
      /** Nota de uma frase de star power ainda inteira. */
      star: boolean
    }
    const drawables: Drawable[] = []
    const activeSustains: Drawable[] = []

    for (let i = start; i < gates.length; i++) {
      const gate = gates[i]
      const t = (gate.time - songTime) / lookAhead
      if (t > 1.02) break

      // Frase perdida volta a ser nota comum: manter a estrela prometeria uma
      // energia que nao vem mais.
      const star = gate.starPower && !gate.starPowerLost

      for (const state of gate.notes) {
        if (state.missed) continue

        const lane = options.leftyFlip ? LANE_COUNT - 1 - state.note.lane : state.note.lane
        const color = options.noteColors[state.note.lane] ?? '#ffffff'
        const end = state.note.time + state.note.duration
        const sustainT = state.note.duration > 0 ? (end - songTime) / lookAhead : null

        if (state.hit) {
          // A cabeca some, o rabo do sustain continua enquanto segurado.
          if (state.sustainAlive && sustainT !== null && sustainT > 0) {
            activeSustains.push({
              t: 0,
              lane,
              color,
              type: state.note.type,
              sustainT,
              fade: 1,
              star,
            })
          }
          continue
        }

        // Nota que passou da hit line sem ser acertada some rapido.
        const past = -t * lookAhead
        if (past > PASS_FADE) continue
        const fade = past > 0 ? 1 - past / PASS_FADE : 1

        drawables.push({ t, lane, color, type: state.note.type, sustainT, fade, star })
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
          item.star ? STAR_TINT : item.color,
          false,
          item.fade,
          options,
        )
      }
    }
    for (const item of activeSustains) {
      this.drawSustain(
        geo,
        item.lane,
        0,
        Math.min(item.sustainT!, 1),
        item.star ? STAR_TINT : item.color,
        true,
        1,
        options,
      )
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
    const widthNear = geo.laneWidth * (active ? 0.26 : 0.2)
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
    item: {
      t: number
      lane: number
      color: string
      type: string
      fade: number
      star: boolean
    },
    options: RenderOptions,
    starPower: boolean,
  ): void {
    const ctx = this.ctx
    const { t, lane, color, type, fade, star } = item
    // A nota de frase e prateada como a do star power ativo, mas pela marca
    // da frase - e o unico jeito de ela se distinguir ANTES de ser acertada.
    const prateada = starPower || star
    const scale = geo.scaleAt(t)
    const x = geo.xAt(lane, t)
    const y = geo.yAt(t)
    // Gema mais alta que o retangulo achatado anterior: e o que da a leitura
    // de "botao" da referencia, em vez de um tijolo deitado.
    // Gema ARREDONDADA e cheia: ocupa a lane inteira e o raio fecha os lados
    // por completo. A versao baixa e de canto curto que veio antes lia como
    // tijolo deitado - a nota precisa ser um botao redondo, que e a forma que
    // o olho associa a "aperte isto".
    const width = geo.laneWidth * 1.02 * scale
    const height = width * 0.72
    const radius = height * 0.5

    // Sombra no piso: e o que "assenta" a nota na pista.
    this.alpha(0.42 * fade)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    ctx.ellipse(x, y + height * 0.5, width * 0.52, height * 0.24, 0, 0, Math.PI * 2)
    ctx.fill()

    this.alpha(fade)
    if (options.effects !== 'low') {
      const halo = (options.effects === 'high' ? 24 : 13) * scale
      // A estrela brilha mais que a nota comum: e ela que o jogador precisa
      // ver chegando de longe para se preparar para a frase.
      ctx.shadowBlur = star ? halo * 1.5 : halo
      ctx.shadowColor = prateada ? 'rgba(180, 240, 255, 0.9)' : color
    }

    // Aro externo escuro: separa a gema da pista, como no jogo de referencia.
    roundedRect(ctx, x - width / 2, y - height / 2, width, height, radius)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.94)'
    ctx.fill()
    ctx.shadowBlur = 0

    // Anel colorido.
    const ringWidth = Math.max(1.4, width * 0.1)
    roundedRect(
      ctx,
      x - width / 2 + ringWidth * 0.5,
      y - height / 2 + ringWidth * 0.5,
      width - ringWidth,
      height - ringWidth,
      radius,
    )
    ctx.lineWidth = ringWidth
    // Bisel: o aro nao e de uma cor so. Claro em cima, escuro embaixo - e a
    // diferenca entre ler como metal cromado e como adesivo colorido.
    const aro = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2)
    if (prateada) {
      aro.addColorStop(0, 'rgba(255, 255, 255, 1)')
      aro.addColorStop(0.45, 'rgba(206, 235, 247, 0.98)')
      aro.addColorStop(1, 'rgba(96, 148, 176, 0.95)')
    } else {
      aro.addColorStop(0, lighten(color, 0.8))
      aro.addColorStop(0.42, lighten(color, 0.35))
      aro.addColorStop(1, darken(color, 0.5))
    }
    ctx.strokeStyle = aro
    ctx.stroke()

    // Domo interno.
    const inset = ringWidth * 1.15
    roundedRect(
      ctx,
      x - width / 2 + inset,
      y - height / 2 + inset,
      width - inset * 2,
      height - inset * 2,
      Math.max(1, radius - inset),
    )
    const body = ctx.createRadialGradient(
      x,
      y - height * 0.26,
      height * 0.05,
      x,
      y + height * 0.1,
      width * 0.62,
    )
    if (type === 'tap') {
      // Tap nota e "vazada": miolo escuro com a cor so no anel.
      body.addColorStop(0, 'rgba(58, 48, 36, 0.98)')
      body.addColorStop(1, 'rgba(14, 10, 7, 0.98)')
    } else if (prateada) {
      body.addColorStop(0, '#ffffff')
      body.addColorStop(0.45, '#cfe9f2')
      body.addColorStop(1, '#5d93ad')
    } else {
      body.addColorStop(0, lighten(color, 0.7))
      body.addColorStop(0.42, color)
      body.addColorStop(1, darken(color, 0.42))
    }
    ctx.fillStyle = body
    ctx.fill()

    // Riscos horizontais no domo: a mesma textura escovada da pista, em
    // miniatura. O clip usa o caminho do domo, que ainda e o caminho atual.
    // Sem eles o domo le como vidro, e nao como metal.
    if (options.effects === 'high' && height > 10) {
      ctx.save()
      ctx.clip()
      this.alpha(0.16 * fade)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = Math.max(0.5, height * 0.03)
      ctx.beginPath()
      for (let linha = -2; linha <= 2; linha++) {
        const ly = y + linha * height * 0.15
        ctx.moveTo(x - width * 0.34, ly)
        ctx.lineTo(x + width * 0.34, ly)
      }
      ctx.stroke()
      ctx.restore()
    }

    // Luz refletida pela pista na barriga da nota: fecha o volume por baixo.
    this.alpha(0.45 * fade)
    ctx.beginPath()
    ctx.ellipse(x, y + height * 0.22, width * 0.26, height * 0.1, 0, 0, Math.PI * 2)
    const reflexo = ctx.createLinearGradient(0, y + height * 0.1, 0, y + height * 0.34)
    reflexo.addColorStop(0, 'rgba(255,255,255,0)')
    reflexo.addColorStop(1, prateada ? 'rgba(220,245,255,0.75)' : hexToRgba(color, 0.85))
    ctx.fillStyle = reflexo
    ctx.fill()

    // Brilho especular no alto: da volume ao domo.
    this.alpha(0.6 * fade)
    ctx.beginPath()
    ctx.ellipse(
      x,
      y - height * 0.24,
      width * 0.29,
      height * 0.16,
      0,
      0,
      Math.PI * 2,
    )
    const gloss = ctx.createLinearGradient(0, y - height * 0.42, 0, y - height * 0.02)
    gloss.addColorStop(0, 'rgba(255,255,255,0.9)')
    gloss.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gloss
    ctx.fill()

    // A estrela no miolo e a marca da frase. Ela vem DEPOIS do domo e ANTES
    // do miolo de HOPO/tap nao ser desenhado: dentro de uma frase, a leitura
    // que importa e "isto vale energia".
    if (star) {
      this.alpha(fade)
      if (options.effects !== 'low') {
        ctx.shadowBlur = 12 * scale
        ctx.shadowColor = 'rgba(210, 245, 255, 0.95)'
      }
      starPath(ctx, x, y, width * 0.26, height * 0.4)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.lineWidth = Math.max(1, width * 0.035)
      ctx.strokeStyle = 'rgba(120, 190, 220, 0.9)'
      ctx.stroke()
      return
    }

    // HOPO ganha um miolo claro; tap, um ponto da propria cor. Leitura rapida.
    if (type !== 'normal') {
      this.alpha(fade)
      const inner = width * 0.17
      ctx.beginPath()
      ctx.ellipse(x, y, inner, inner * 0.82, 0, 0, Math.PI * 2)
      ctx.fillStyle = type === 'tap' ? lighten(color, 0.3) : 'rgba(255,255,255,0.95)'
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
    // Prata, nao bronze: e a barra que diz QUANDO tocar, e ela precisa ser a
    // coisa mais clara da pista em qualquer fundo.
    bar.addColorStop(0, starPower ? 'rgba(180, 225, 240, 0.95)' : 'rgba(150, 156, 168, 0.95)')
    bar.addColorStop(0.45, starPower ? 'rgba(236, 249, 255, 1)' : 'rgba(250, 252, 255, 1)')
    bar.addColorStop(1, starPower ? 'rgba(90, 150, 180, 0.9)' : 'rgba(64, 68, 78, 0.95)')
    ctx.fillStyle = bar
    ctx.fillRect(left, y - thickness / 2, right - left, thickness)

    if (options.effects !== 'low') {
      this.alpha(0.8)
      ctx.strokeStyle = starPower ? 'rgba(236, 249, 255, 0.9)' : 'rgba(255, 255, 255, 0.9)'
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

    // Os trastes tem animacao de chegada com alpha proprio. O fade do reveal
    // multiplicaria por cima (base * valor) e eles chegariam invisiveis: no
    // inicio da sequencia isso dava alpha 0.04.
    const baseAnterior = this.base
    this.base = 1

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

      // Chegada na intro: cada traste sobe do fundo, passa do lugar e
      // assenta, em sequencia. Derivado do reveal, nao de contador proprio.
      const chegada = fretArrival(options.reveal, lane, LANE_COUNT)
      if (chegada.alpha <= 0) continue

      // 0.42 da lane: grande o bastante para ser o alvo obvio de cada lane,
      // sem os aneis encostarem um no outro e taparem a barra da hit line -
      // que e a referencia visual de QUANDO tocar, e era o que 0.46 escondia.
      const radiusX = geo.laneWidth * (0.42 + punch * 0.08) * chegada.scale
      const radiusY = radiusX * 0.5
      const press = held ? radiusY * 0.2 : 0
      const aceso = held || punch > 0
      // O deslocamento e em fracao do raio, entao o pulo acompanha a escala
      // da highway em qualquer resolucao.
      const salto = chegada.offsetY * geo.laneWidth * 0.9

      const cy = y + salto

      // Sombra no piso: fica no lugar do traste, nao acompanha o pulo. E ela
      // que mostra a altura.
      if (chegada.progress < 1) {
        this.alpha(0.3 * chegada.alpha)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
        ctx.beginPath()
        ctx.ellipse(x, y + radiusY * 0.6, radiusX * 0.9, radiusY * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // Poco escuro sob o traste: da relevo ao botao.
      this.alpha(chegada.alpha)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.beginPath()
      ctx.ellipse(x, cy + radiusY * 0.45, radiusX * 1.1, radiusY * 1.14, 0, 0, Math.PI * 2)
      ctx.fill()

      // Aro externo preto neutro.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.96)'
      ctx.beginPath()
      ctx.ellipse(x, cy + press, radiusX * 1.06, radiusY * 1.08, 0, 0, Math.PI * 2)
      ctx.fill()

      // Miolo.
      const fill = ctx.createRadialGradient(
        x,
        cy - radiusY * 0.5 + press,
        radiusY * 0.08,
        x,
        cy + press,
        radiusX,
      )
      if (aceso) {
        fill.addColorStop(0, '#ffffff')
        fill.addColorStop(0.35, lighten(color, 0.6))
        fill.addColorStop(1, darken(color, 0.3))
      } else {
        // Apagado e quase preto: o traste da referencia so ACENDE quando
        // apertado. Miolo permanentemente colorido competia com a nota que
        // chega e tirava o "clique" visual do acerto.
        fill.addColorStop(0, hexToRgba(color, 0.16))
        fill.addColorStop(0.65, hexToRgba(color, 0.05))
        fill.addColorStop(1, 'rgba(6, 6, 8, 0.95)')
      }
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.ellipse(x, cy + press, radiusX, radiusY, 0, 0, Math.PI * 2)
      ctx.fill()

      // Anel colorido, grosso.
      ctx.lineWidth = Math.max(2.2, radiusY * 0.34)
      ctx.strokeStyle = aceso ? lighten(color, 0.55) : color
      if (options.effects !== 'low' && aceso) {
        ctx.shadowBlur = 22 + punch * 26
        ctx.shadowColor = color
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      // Reflexo no alto do botao.
      this.alpha((aceso ? 0.7 : 0.35) * chegada.alpha)
      ctx.beginPath()
      ctx.ellipse(x, cy - radiusY * 0.34 + press, radiusX * 0.5, radiusY * 0.26, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fill()
    }

    this.base = baseAnterior
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

  /**
   * Raio que anuncia a frase de star power fechada.
   *
   * O desenho inteiro deriva de `songTime - burst.time`: nao ha contador por
   * frame, entao queda de FPS encurta o efeito em vez de atrasar o jogo, e o
   * loop do treino repete o raio no mesmo ponto da musica.
   *
   * A forma do raio tambem e deterministica (o gerador abaixo e semeado pelo
   * tempo da frase): um `Math.random()` por frame faria o mesmo raio tremer
   * como chuvisco em vez de ficar parado no ar enquanto some.
   */
  private drawStarPowerBursts(
    session: PlayerSession,
    geo: Geometry,
    options: RenderOptions,
    songTime: number,
  ): void {
    const ctx = this.ctx
    const duracao = GAME_CONFIG.starPower.phraseBurstSeconds
    const alive = session.starPowerBursts.filter((burst) => {
      const age = songTime - burst.time
      return age >= 0 && age <= duracao
    })

    for (const burst of alive) {
      const progress = (songTime - burst.time) / duracao
      const y = geo.yAt(0)

      // Clarao que lava a pista inteira. Abre rapido e some devagar.
      const flash = Math.max(0, 1 - progress * 3)
      if (flash > 0) {
        this.alpha(flash * 0.5)
        const lavagem = ctx.createLinearGradient(0, y, 0, geo.yAt(1))
        lavagem.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
        lavagem.addColorStop(0.5, 'rgba(170, 230, 255, 0.45)')
        lavagem.addColorStop(1, 'rgba(120, 200, 255, 0)')
        ctx.fillStyle = lavagem
        ctx.beginPath()
        ctx.moveTo(geo.xAt(-0.5, 0), y)
        ctx.lineTo(geo.xAt(LANE_COUNT - 0.5, 0), y)
        ctx.lineTo(geo.xAt(LANE_COUNT - 0.5, 1), geo.yAt(1))
        ctx.lineTo(geo.xAt(-0.5, 1), geo.yAt(1))
        ctx.closePath()
        ctx.fill()
      }

      // Um raio por lane da frase, subindo da hit line para o fundo.
      const lanes = burst.lanes.length > 0 ? burst.lanes : [2]
      lanes.forEach((laneOriginal, indice) => {
        const lane = options.leftyFlip ? LANE_COUNT - 1 - laneOriginal : laneOriginal
        // Cada raio comeca um pouco depois do anterior: o efeito percorre a
        // frase em vez de piscar tudo de uma vez.
        const atraso = indice * 0.06
        const local = (progress - atraso) / (1 - atraso)
        if (local <= 0 || local >= 1) return

        const alcance = Math.min(1, local * 2.2)
        const random = seeded(burst.time * 1000 + laneOriginal)
        this.boltPath(geo, lane, alcance, random)

        const brilho = 1 - local
        // Traco grosso e translucido por baixo: e ele que da o "plasma".
        this.alpha(brilho * 0.55)
        ctx.strokeStyle = 'rgba(150, 220, 255, 0.9)'
        ctx.lineWidth = Math.max(3, geo.laneWidth * 0.2)
        if (options.effects !== 'low') {
          ctx.shadowBlur = 26
          ctx.shadowColor = 'rgba(180, 240, 255, 0.95)'
        }
        ctx.stroke()

        // Nucleo branco fino por cima.
        this.alpha(brilho)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)'
        ctx.lineWidth = Math.max(1.4, geo.laneWidth * 0.06)
        ctx.stroke()
        ctx.shadowBlur = 0

        // Estrela estourando no traste, na base do raio.
        this.alpha(brilho)
        const tamanho = geo.laneWidth * (0.3 + local * 0.5)
        starPath(ctx, geo.xAt(lane, 0), y, tamanho, tamanho)
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.85 * brilho).toFixed(3)})`
        ctx.fill()
      })
    }

    session.starPowerBursts.length = 0
    session.starPowerBursts.push(...alive)
  }

  /**
   * Monta o caminho de UM raio na lane, sem pintar.
   *
   * Quem chama pinta duas vezes (halo grosso e nucleo fino) sobre o mesmo
   * caminho: e o que da a leitura de descarga eletrica em vez de risco.
   */
  private boltPath(
    geo: Geometry,
    lane: number,
    alcance: number,
    random: () => number,
  ): void {
    const ctx = this.ctx
    const passos = 9

    ctx.beginPath()
    ctx.moveTo(geo.xAt(lane, 0), geo.yAt(0))
    for (let i = 1; i <= passos; i++) {
      const t = (i / passos) * alcance
      // O desvio encolhe com a perspectiva, senao o raio abriria em leque ao
      // se afastar, justamente onde a pista e mais estreita.
      const desvio = (random() - 0.5) * 0.9 * geo.scaleAt(t)
      ctx.lineTo(geo.xAt(lane + desvio, t), geo.yAt(t))
    }
  }

  /**
   * A pista durante o star power: brilho pulsante e eletricidade.
   *
   * Os raios sao semeados por uma FATIA de tempo (12 por segundo), e nao pelo
   * frame: dentro da mesma fatia todo frame desenha o mesmo raio, entao ele
   * fica parado no ar e depois salta para outro lugar - que e como descarga
   * eletrica se comporta. Semear por frame daria chuvisco a 60 Hz.
   */
  private drawStarPowerGlow(geo: Geometry, songTime: number, options: RenderOptions): void {
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

    if (options.effects === 'low') return

    const fatia = Math.floor(songTime * 12)
    const random = seeded(fatia)

    // Eletricidade correndo pelos trilhos: e o que faz a moldura da pista
    // parecer energizada, e nao so pintada de azul.
    for (const borda of [-0.5, LANE_COUNT - 0.5]) {
      const inicio = random() * 0.45
      const fim = Math.min(1, inicio + 0.35 + random() * 0.45)
      ctx.beginPath()
      const passos = 10
      for (let i = 0; i <= passos; i++) {
        const t = inicio + ((fim - inicio) * i) / passos
        const desvio = (random() - 0.5) * 0.28 * geo.scaleAt(t)
        const px = geo.xAt(borda + desvio, t)
        const py = geo.yAt(t)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      this.alpha(0.5)
      ctx.strokeStyle = 'rgba(150, 220, 255, 0.9)'
      ctx.lineWidth = Math.max(2, geo.laneWidth * 0.1)
      ctx.shadowBlur = 20
      ctx.shadowColor = 'rgba(180, 240, 255, 0.95)'
      ctx.stroke()
      this.alpha(0.95)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.lineWidth = Math.max(1, geo.laneWidth * 0.035)
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // De vez em quando um arco atravessa a pista de lado a lado. Aparece em
    // cerca de um terco das fatias: constante viraria ruido de fundo e o olho
    // pararia de registrar.
    if (options.effects === 'high' && random() < 0.34) {
      const t = 0.1 + random() * 0.65
      ctx.beginPath()
      const passos = 9
      for (let i = 0; i <= passos; i++) {
        const lane = -0.5 + (LANE_COUNT * i) / passos
        const desvio = (random() - 0.5) * 0.09
        const px = geo.xAt(lane, t)
        const py = geo.yAt(Math.max(0, t + desvio))
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      this.alpha(0.42)
      ctx.strokeStyle = 'rgba(160, 225, 255, 0.85)'
      ctx.lineWidth = Math.max(2, geo.laneWidth * 0.09) * geo.scaleAt(t)
      ctx.shadowBlur = 18
      ctx.shadowColor = 'rgba(180, 240, 255, 0.9)'
      ctx.stroke()
      this.alpha(0.85)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.lineWidth = Math.max(1, geo.laneWidth * 0.03) * geo.scaleAt(t)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }
}

// ------------------------------------------------------------------ helpers

/**
 * Caminho de uma estrela de cinco pontas centrada em (x, y).
 *
 * Nao pinta: quem chama decide preenchimento e contorno.
 */
function starPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  raioX: number,
  raioY: number,
): void {
  const pontas = 5
  const interno = 0.42
  ctx.beginPath()
  for (let i = 0; i < pontas * 2; i++) {
    // -PI/2 poe a ponta para cima; sem isso a estrela nasce deitada.
    const angulo = -Math.PI / 2 + (i * Math.PI) / pontas
    const escala = i % 2 === 0 ? 1 : interno
    const px = x + Math.cos(angulo) * raioX * escala
    const py = y + Math.sin(angulo) * raioY * escala
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/**
 * Gerador pseudoaleatorio semeado (mulberry32).
 *
 * O raio precisa ser IRREGULAR mas ESTAVEL: semeado pelo tempo da frase, o
 * mesmo raio sai igual em todo frame em que aparece. Com `Math.random()` a
 * forma mudaria 60 vezes por segundo e viraria chuvisco.
 */
function seeded(seed: number): () => number {
  let estado = Math.floor(seed) >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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
