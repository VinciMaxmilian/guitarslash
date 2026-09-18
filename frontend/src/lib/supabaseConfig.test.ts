import { describe, expect, it } from 'vitest'

import { isServerKey, readSupabaseConfig } from './supabaseConfig'

const URL_OK = 'https://dqaayntwbymzlqwuclqy.supabase.co'
/** JWT de tres partes, com role anon. Assinatura irrelevante para o teste. */
const ANON = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.assinatura'

describe('readSupabaseConfig', () => {
  it('le url e chave validas', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON })).toEqual(
      { url: URL_OK, anonKey: ANON },
    )
  })

  it('aceita chave publishable do formato novo', () => {
    const cfg = readSupabaseConfig({
      VITE_SUPABASE_URL: URL_OK,
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_JxzBqDpodS7mdD',
    })
    expect(cfg?.anonKey).toBe('sb_publishable_JxzBqDpodS7mdD')
  })

  it('sem configuracao devolve null, e isso NAO e erro', () => {
    // O jogo roda offline no modo host; nuvem e opcional.
    expect(readSupabaseConfig({})).toBeNull()
    expect(readSupabaseConfig(undefined)).toBeNull()
  })

  it('faltando um dos dois tambem desliga', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK })).toBeNull()
    expect(readSupabaseConfig({ VITE_SUPABASE_ANON_KEY: ANON })).toBeNull()
  })

  it('ignora string vazia e espaco', () => {
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: '   ', VITE_SUPABASE_ANON_KEY: ANON }),
    ).toBeNull()
  })

  it('remove a barra final da url', () => {
    const cfg = readSupabaseConfig({
      VITE_SUPABASE_URL: `${URL_OK}/`,
      VITE_SUPABASE_ANON_KEY: ANON,
    })
    expect(cfg?.url).toBe(URL_OK)
  })

  it('recusa url sem protocolo', () => {
    // Caminho relativo aqui da erro obscuro dentro do cliente, longe da causa.
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: 'dqaay.supabase.co', VITE_SUPABASE_ANON_KEY: ANON }),
    ).toBeNull()
  })

  it('recusa os valores de exemplo do .env.example', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'https://your-project.supabase.co',
        VITE_SUPABASE_ANON_KEY: ANON,
      }),
    ).toBeNull()
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: 'sua-chave-aqui' }),
    ).toBeNull()
  })

  it('recusa chave que nao tem formato de chave', () => {
    // Evita um 401 confuso so na primeira consulta.
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: 'abc123' }),
    ).toBeNull()
  })
})

describe('isServerKey', () => {
  it('detecta a secret key pelo prefixo', () => {
    expect(isServerKey('sb_secret_fIDObhHRf6cZP8dLAnOaSA')).toBe(true)
  })

  it('detecta service_role dentro do JWT', () => {
    // A service_role ignora TODA a RLS: no bundle, entrega o banco inteiro.
    const payload = btoa(JSON.stringify({ role: 'service_role' }))
    expect(isServerKey(`cabecalho.${payload}.assinatura`)).toBe(true)
  })

  it('a chave anon passa', () => {
    expect(isServerKey(ANON)).toBe(false)
  })

  it('a publishable passa', () => {
    expect(isServerKey('sb_publishable_JxzBqDpodS7mdD')).toBe(false)
  })

  it('nao quebra com lixo', () => {
    expect(isServerKey('')).toBe(false)
    expect(isServerKey('a.b.c')).toBe(false)
    expect(isServerKey('naoEhJwt')).toBe(false)
  })
})
