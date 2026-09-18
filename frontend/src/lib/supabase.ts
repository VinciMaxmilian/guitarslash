import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { isServerKey, readSupabaseConfig } from './supabaseConfig'

/**
 * Cliente Supabase, ou `null` quando a nuvem nao esta configurada.
 *
 * Todo consumidor precisa tratar o `null`. Nao e caso de erro: o jogo roda
 * completo sem conta, sem leaderboard e sem musicas da comunidade - e e assim
 * que o modo host funciona offline na LAN.
 */

const config = readSupabaseConfig(import.meta.env as unknown as Record<string, unknown>)

if (config && isServerKey(config.anonKey)) {
  // Nao e aviso decorativo: a service_role ignora toda a RLS, e embutida no
  // bundle ela entrega o banco a quem abrir o DevTools. Melhor desligar.
  console.error(
    '[guitarslash] VITE_SUPABASE_ANON_KEY parece ser uma chave de SERVIDOR. ' +
      'Use a chave anon/publishable. Recursos de nuvem desligados.',
  )
}

const usable = config && !isServerKey(config.anonKey) ? config : null

export const supabase: SupabaseClient | null = usable
  ? createClient(usable.url, usable.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

/** Recursos de nuvem (conta, leaderboard, comunidade) estao disponiveis? */
export const CLOUD_ENABLED = supabase !== null
