/**
 * Onde fica o servidor de partidas.
 *
 * Existem dois cenarios, e o mesmo build atende os dois:
 *
 *   LAN (modo host)  o processo roda na maquina de um jogador e serve tambem
 *                    esta pagina. O servidor injeta `window.__GUITARSLASH_HOST__`
 *                    no index.html, e o WebSocket vai para a propria origem.
 *
 *   Online           o processo roda num servidor dedicado e o endereco vem de
 *                    VITE_WS_URL, embutido no build.
 *
 * A Vercel nao serve para nenhum dos dois: Serverless Function nao mantem
 * conexao WebSocket aberta. Nao e configuracao, e o modelo de execucao.
 */

declare global {
  interface Window {
    __GUITARSLASH_HOST__?: boolean
  }
}

function marked(): boolean {
  return typeof window !== 'undefined' && window.__GUITARSLASH_HOST__ === true
}

/** Em dev o proxy do Vite encaminha /api e /ws para o backend local. */
const DEV = Boolean(import.meta.env?.DEV)

/** Servidor de partidas online, quando houver. Vazio = nao configurado. */
const WS_URL = (import.meta.env?.VITE_WS_URL ?? '').trim().replace(/\/$/, '')

/** A pagina esta sendo servida pelo processo do host, na rede local. */
export const IS_HOST_MODE = marked() || DEV

/** Ha servidor de partidas online configurado neste build. */
export const HAS_ONLINE_SERVER = WS_URL.length > 0

/**
 * Multiplayer disponivel nesta pagina.
 *
 * Em modo host e sempre LAN (a origem local ganha, mesmo que exista servidor
 * online configurado): assim o modo host continua funcionando offline.
 */
export const MULTIPLAYER_AVAILABLE = IS_HOST_MODE || HAS_ONLINE_SERVER

/** 'lan' | 'online' | null — para a interface explicar o que esta acontecendo. */
export const MULTIPLAYER_KIND: 'lan' | 'online' | null = IS_HOST_MODE
  ? 'lan'
  : HAS_ONLINE_SERVER
    ? 'online'
    : null

/** Converte http(s):// em ws(s)://, preservando caminho. */
export function toWebSocketScheme(url: string): string {
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`
  return url
}

/** URL do WebSocket da partida. */
export function matchSocketUrl(): string {
  if (!IS_HOST_MODE && WS_URL) {
    return `${toWebSocketScheme(WS_URL)}/ws`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}
