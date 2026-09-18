import { DEFAULT_BINDINGS, DEFAULT_NOTE_COLORS } from '../game/config'
import type { Settings } from './types'

const STORAGE_KEY = 'guitarslash.settings'
/** Hora da ultima alteracao local, usada para decidir o sync com a nuvem. */
const TOUCHED_KEY = 'guitarslash.settings.touchedAt'
export const SETTINGS_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  profileName: 'Player 1',
  noteColors: [...DEFAULT_NOTE_COLORS],
  keyBindings: { ...DEFAULT_BINDINGS },
  volumes: {
    master: 0.9,
    music: 1,
    effects: 0.7,
    video: 0,
    preview: 0.6,
  },
  calibration: {
    audioOffsetMs: 0,
    videoOffsetMs: 0,
  },
  gameplay: {
    noteSpeed: 5,
    // Padrao: sem palhetada. Basta apertar o traste certo.
    requireStrum: false,
    muteOnMiss: true,
    hitSounds: false,
    showFps: false,
    leftyFlip: false,
  },
  visual: {
    effects: 'high',
    videoOpacity: 0.55,
    videoBrightness: 0.6,
  },
}

type Listener = (settings: Settings) => void

/**
 * Fonte unica das configuracoes.
 *
 * A engine NUNCA le localStorage: ela recebe um objeto ja validado. Isso
 * mantem o jogo testavel e evita estado espalhado.
 */
export class SettingsStore {
  private settings: Settings
  private listeners = new Set<Listener>()

  constructor() {
    this.settings = load()
  }

  get(): Settings {
    return this.settings
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Aplica uma alteracao parcial (merge raso por secao) e persiste. */
  update(patch: DeepPartial<Settings>): Settings {
    this.settings = validate(merge(this.settings, patch))
    persist(this.settings)
    for (const listener of this.listeners) listener(this.settings)
    return this.settings
  }

  setBinding(action: keyof Settings['keyBindings'], code: string): Settings {
    return this.update({ keyBindings: { [action]: code } as Partial<Settings['keyBindings']> })
  }

  setNoteColor(lane: number, color: string): Settings {
    const noteColors = [...this.settings.noteColors]
    noteColors[lane] = color
    return this.update({ noteColors })
  }

  reset(): Settings {
    this.settings = structuredCloneSafe(DEFAULT_SETTINGS)
    persist(this.settings)
    for (const listener of this.listeners) listener(this.settings)
    return this.settings
  }
}

export const settingsStore = new SettingsStore()

/** ms epoch da ultima alteracao local, ou null se nunca houve. */
export function localTouchedAt(): number | null {
  try {
    const raw = localStorage.getItem(TOUCHED_KEY)
    const valor = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(valor) ? valor : null
  } catch {
    return null
  }
}

export function markLocalTouched(at: number = Date.now()): void {
  try {
    localStorage.setItem(TOUCHED_KEY, String(at))
  } catch {
    // Sem localStorage o sync cai no caso "sem carimbo": a nuvem ganha.
  }
}

// ------------------------------------------------------------------ helpers

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K]
}

function merge(base: Settings, patch: DeepPartial<Settings>): Settings {
  const result = structuredCloneSafe(base) as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = result[key]
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object'
    ) {
      result[key] = { ...(current as object), ...(value as object) }
    } else {
      result[key] = value
    }
  }
  return result as unknown as Settings
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, parsed))
}

/** Garante que nada vindo do localStorage quebre a engine. */
export function validate(input: Settings): Settings {
  const colors = Array.isArray(input.noteColors) ? input.noteColors : []
  const noteColors = DEFAULT_NOTE_COLORS.map((fallback, index) =>
    typeof colors[index] === 'string' && /^#[0-9a-f]{6}$/i.test(colors[index])
      ? colors[index]
      : fallback,
  )

  const keyBindings = { ...DEFAULT_BINDINGS }
  for (const action of Object.keys(DEFAULT_BINDINGS) as (keyof typeof DEFAULT_BINDINGS)[]) {
    const code = input.keyBindings?.[action]
    if (typeof code === 'string' && code.length > 0) {
      keyBindings[action] = code
    }
  }

  return {
    version: SETTINGS_VERSION,
    profileName: (input.profileName || DEFAULT_SETTINGS.profileName).toString().slice(0, 24),
    noteColors,
    keyBindings,
    volumes: {
      master: clamp(input.volumes?.master, 0, 1, DEFAULT_SETTINGS.volumes.master),
      music: clamp(input.volumes?.music, 0, 1, DEFAULT_SETTINGS.volumes.music),
      effects: clamp(input.volumes?.effects, 0, 1, DEFAULT_SETTINGS.volumes.effects),
      video: clamp(input.volumes?.video, 0, 1, DEFAULT_SETTINGS.volumes.video),
      preview: clamp(input.volumes?.preview, 0, 1, DEFAULT_SETTINGS.volumes.preview),
    },
    calibration: {
      audioOffsetMs: clamp(input.calibration?.audioOffsetMs, -500, 500, 0),
      videoOffsetMs: clamp(input.calibration?.videoOffsetMs, -500, 500, 0),
    },
    gameplay: {
      noteSpeed: Math.round(clamp(input.gameplay?.noteSpeed, 1, 10, 5)),
      requireStrum: Boolean(input.gameplay?.requireStrum),
      muteOnMiss: input.gameplay?.muteOnMiss ?? DEFAULT_SETTINGS.gameplay.muteOnMiss,
      hitSounds: Boolean(input.gameplay?.hitSounds),
      showFps: Boolean(input.gameplay?.showFps),
      leftyFlip: Boolean(input.gameplay?.leftyFlip),
    },
    visual: {
      effects: (['low', 'medium', 'high'] as const).includes(input.visual?.effects as never)
        ? input.visual.effects
        : 'high',
      videoOpacity: clamp(input.visual?.videoOpacity, 0, 1, DEFAULT_SETTINGS.visual.videoOpacity),
      videoBrightness: clamp(
        input.visual?.videoBrightness,
        0.1,
        1.5,
        DEFAULT_SETTINGS.visual.videoBrightness,
      ),
    },
  }
}

/** Migracao entre versoes do schema. Hoje so ha a versao 1. */
export function migrate(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return structuredCloneSafe(DEFAULT_SETTINGS)
  const data = raw as Partial<Settings>
  const merged = merge(DEFAULT_SETTINGS, data as DeepPartial<Settings>)
  return validate(merged)
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredCloneSafe(DEFAULT_SETTINGS)
    return migrate(JSON.parse(raw))
  } catch {
    return structuredCloneSafe(DEFAULT_SETTINGS)
  }
}

function persist(settings: Settings): void {
  // Carimba a alteracao. Depois de um PULL da nuvem, o hook de sync sobrescreve
  // este valor com o `updated_at` da nuvem - senao o local pareceria mais novo
  // e disparariamos um push logo em seguida, em loop.
  markLocalTouched()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Modo privado / storage bloqueado: o jogo continua com o valor em memoria.
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
