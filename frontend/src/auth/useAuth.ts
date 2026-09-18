import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { CLOUD_ENABLED, supabase } from '../lib/supabase'

export interface AuthState {
  /** Nuvem configurada neste build. Quando false, tudo aqui e no-op. */
  enabled: boolean
  /** null = visitante. O jogo funciona completo como visitante. */
  session: Session | null
  displayName: string | null
  /** true enquanto a sessao salva esta sendo restaurada. */
  loading: boolean
  error: string | null
  signUp: (email: string, password: string, displayName: string) => Promise<boolean>
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void
}

/** Mensagens do Supabase vem em ingles; traduzimos as que o jogador ve. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme o e-mail antes de entrar.'
  if (m.includes('user already registered')) return 'Este e-mail já tem conta.'
  if (m.includes('password should be at least')) {
    return 'A senha precisa de pelo menos 6 caracteres.'
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'E-mail inválido.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas. Espere um instante.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Sem conexão com o servidor.'
  }
  return mensagem
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  // Sem nuvem nao ha nada a carregar: comeca resolvido.
  const [loading, setLoading] = useState(CLOUD_ENABLED)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vivo = true

    // Sessao salva no navegador: o jogador nao loga de novo a cada visita.
    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nova) => {
      if (!vivo) return
      setSession(nova)
      setLoading(false)
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // O nome vem de `profiles`, e nao do metadata do usuario: e a tabela que o
  // leaderboard le, entao e ela que manda.
  useEffect(() => {
    const id = session?.user?.id
    if (!supabase || !id) {
      setDisplayName(null)
      return
    }
    let vivo = true

    void supabase
      .from('profiles')
      .select('display_name')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo) setDisplayName(data?.display_name ?? null)
      })

    return () => {
      vivo = false
    }
  }, [session?.user?.id])

  const signUp = useCallback(
    async (email: string, password: string, nome: string) => {
      if (!supabase) return false
      setError(null)
      // O trigger handle_new_user le este metadata para criar o perfil.
      const { error: erro } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: nome.trim().slice(0, 24) } },
      })
      if (erro) {
        setError(traduzir(erro.message))
        return false
      }
      return true
    },
    [],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return false
    setError(null)
    const { error: erro } = await supabase.auth.signInWithPassword({ email, password })
    if (erro) {
      setError(traduzir(erro.message))
      return false
    }
    return true
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return useMemo(
    () => ({
      enabled: CLOUD_ENABLED,
      session,
      displayName,
      loading,
      error,
      signUp,
      signIn,
      signOut,
      clearError,
    }),
    [session, displayName, loading, error, signUp, signIn, signOut, clearError],
  )
}
