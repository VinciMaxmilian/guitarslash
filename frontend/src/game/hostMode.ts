/**
 * Deteccao de modo host.
 *
 * O multiplayer LAN sO existe quando a pagina esta sendo servida pelo processo
 * do host (`python main.py host`). No deploy publico (Netlify + Vercel) nao
 * existe WebSocket: Serverless Function nao mantem conexao aberta, e uma
 * pagina em HTTPS nao abre ws:// para um IP da rede local.
 *
 * Como sabemos: o backend em modo host injeta `window.__GUITARSLASH_HOST__` no
 * index.html que ele serve (ver `_mount_frontend` em backend/app/main.py).
 * Isso importa porque o MESMO `frontend/dist` roda nos dois lugares - se a
 * deteccao dependesse de variavel de build, um dist buildado para o Netlify
 * tentaria falar com a Vercel mesmo rodando na LAN.
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

/** Verdadeiro quando esta pagina tem um host de LAN na mesma origem. */
export const IS_HOST_MODE = marked() || DEV

/** URL do WebSocket da partida, sempre na origem da propria pagina. */
export function matchSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}
