/**
 * Leitura e validacao da configuracao do Supabase.
 *
 * Separado do cliente para ser testavel, e porque a regra mais importante aqui
 * nao e obvia: **sem configuracao, o jogo tem de funcionar igual**. Modo host
 * na LAN roda offline, e a biblioteca local nao depende de nuvem nenhuma.
 * Por isso a ausencia de configuracao NAO e erro - so desliga conta,
 * leaderboard e musicas da comunidade.
 */

export interface SupabaseConfig {
  url: string
  anonKey: string
}

/** Valores de exemplo que nao devem ser tratados como configuracao real. */
const PLACEHOLDERS = [
  'your-project',
  'seu-projeto',
  'sua-chave',
  'xxxx',
  'changeme',
  'exemplo',
]

function looksLikePlaceholder(value: string): boolean {
  const baixo = value.toLowerCase()
  return PLACEHOLDERS.some((p) => baixo.includes(p))
}

/**
 * Le a configuracao do ambiente do Vite.
 *
 * @returns null quando nao ha configuracao utilizavel. O chamador trata isso
 *          como "recursos de nuvem desligados", e nao como falha.
 */
export function readSupabaseConfig(
  env: Record<string, unknown> | undefined,
): SupabaseConfig | null {
  const url = String(env?.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const anonKey = String(env?.VITE_SUPABASE_ANON_KEY ?? '').trim()

  if (!url || !anonKey) return null
  if (looksLikePlaceholder(url) || looksLikePlaceholder(anonKey)) return null

  // Precisa ser URL absoluta: caminho relativo aqui gera erro obscuro dentro
  // do cliente, muito longe da causa.
  if (!/^https?:\/\//i.test(url)) return null

  // A chave do Supabase e um JWT (tres partes) ou uma chave `sb_publishable_`.
  // Recusar cedo evita um 401 confuso na primeira consulta.
  const pareceJwt = anonKey.split('.').length === 3
  const parecePublishable = anonKey.startsWith('sb_publishable_')
  if (!pareceJwt && !parecePublishable) return null

  return { url, anonKey }
}

/**
 * A chave publicada no frontend nao pode ser uma chave de servidor.
 *
 * A `service_role` ignora TODA a RLS. Embutida no bundle, ela entrega o banco
 * inteiro a quem abrir o DevTools. Vale gritar em vez de falhar silencioso.
 */
export function isServerKey(anonKey: string): boolean {
  if (anonKey.startsWith('sb_secret_')) return true
  try {
    const [, payload] = anonKey.split('.')
    if (!payload) return false
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return json?.role === 'service_role'
  } catch {
    return false
  }
}
