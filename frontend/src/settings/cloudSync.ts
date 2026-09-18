import type { Settings } from './types'

/**
 * Regras de sincronizacao das configuracoes com a nuvem.
 *
 * Separado do efeito React porque a decisao "quem ganha" nao e obvia e erra
 * feio: perder a calibracao de audio do jogador o obriga a refazer no ouvido.
 */

export type SyncDecision = 'pull' | 'push' | 'nada'

/**
 * Quem manda quando ha configuracao nos dois lados.
 *
 * Regra: **o mais recente ganha**, comparando `updated_at` da nuvem com a hora
 * da ultima alteracao local. Sem carimbo local (primeiro login neste
 * navegador), a nuvem ganha - e o que o jogador espera ao entrar na conta em
 * outro aparelho.
 *
 * @param cloudUpdatedAt ISO da coluna `updated_at`, ou null se nao ha registro
 * @param localUpdatedAt ms epoch da ultima alteracao local, ou null
 */
export function decideSync(
  cloudUpdatedAt: string | null,
  localUpdatedAt: number | null,
): SyncDecision {
  if (!cloudUpdatedAt) return 'push'

  const nuvem = Date.parse(cloudUpdatedAt)
  if (!Number.isFinite(nuvem)) return 'push'
  if (localUpdatedAt === null) return 'pull'

  // Empate vai para 'nada': repetir escrita a cada login nao serve a ninguem.
  if (nuvem > localUpdatedAt) return 'pull'
  if (localUpdatedAt > nuvem) return 'push'
  return 'nada'
}

/**
 * Campos que NAO vao para a nuvem.
 *
 * `keyBindings` e por aparelho: o mapeamento do teclado do desktop nao faz
 * sentido no celular, e sobrescrever um com o outro deixaria o jogador sem
 * controle. `version` a nuvem tambem nao precisa ditar - a migracao local
 * cuida disso.
 */
const LOCAL_ONLY = ['keyBindings'] as const

/** Recorta o que vai ser gravado na nuvem. */
export function toCloudPayload(settings: Settings): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...settings }
  for (const campo of LOCAL_ONLY) delete copia[campo]
  return copia
}

/**
 * Aplica o que veio da nuvem sobre o local, preservando o que e do aparelho.
 *
 * Devolve um patch para `settingsStore.update`, e nao um Settings inteiro: o
 * store valida e migra o patch, entao dado antigo ou torto na nuvem nao
 * corrompe as configuracoes locais.
 */
export function fromCloudPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const patch: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  for (const campo of LOCAL_ONLY) delete patch[campo]
  delete patch.version
  return Object.keys(patch).length > 0 ? patch : null
}
