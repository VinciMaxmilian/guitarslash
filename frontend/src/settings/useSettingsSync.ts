import { useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import {
  localTouchedAt,
  markLocalTouched,
  settingsStore,
} from './SettingsStore'
import { decideSync, fromCloudPayload, toCloudPayload } from './cloudSync'

/** Espera depois da ultima alteracao antes de gravar na nuvem. */
const DEBOUNCE_MS = 1500

/**
 * Mantem as configuracoes do jogador em sincronia com a conta.
 *
 * Sem conta (ou sem nuvem configurada) nao faz absolutamente nada, e as
 * configuracoes seguem apenas no localStorage.
 */
export function useSettingsSync(session: Session | null): void {
  const userId = session?.user?.id ?? null
  /** Evita gravar a alteracao que acabou de VIR da nuvem. */
  const aplicandoDaNuvem = useRef(false)

  // -------------------------------------------------- decide e resolve
  useEffect(() => {
    if (!supabase || !userId) return
    let vivo = true

    const resolver = async () => {
      const { data, error } = await supabase!
        .from('player_settings')
        .select('settings, updated_at')
        .eq('user_id', userId)
        .maybeSingle()

      if (!vivo || error) return

      const decisao = decideSync(data?.updated_at ?? null, localTouchedAt())

      if (decisao === 'pull' && data?.settings) {
        const patch = fromCloudPayload(data.settings)
        if (patch) {
          aplicandoDaNuvem.current = true
          settingsStore.update(patch as never)
          // Alinha o carimbo com a nuvem: sem isto o `persist` teria marcado
          // "agora", o local pareceria mais novo e viria um push em seguida.
          markLocalTouched(Date.parse(data.updated_at))
          aplicandoDaNuvem.current = false
        }
        return
      }

      if (decisao === 'push') {
        await supabase!.from('player_settings').upsert(
          { user_id: userId, settings: toCloudPayload(settingsStore.get()) },
          { onConflict: 'user_id' },
        )
      }
    }

    void resolver()
    return () => {
      vivo = false
    }
  }, [userId])

  // ------------------------------------------- alteracao local -> nuvem
  useEffect(() => {
    if (!supabase || !userId) return

    let timer: number | undefined
    const cancelar = settingsStore.subscribe(() => {
      if (aplicandoDaNuvem.current) return

      // Cancelar vem ANTES de qualquer desistencia. Deixar um envio agendado
      // de pe enquanto ha rascunho era o pior dos mundos: o envio disparava
      // 1,5 s depois, lia `settingsStore.get()` - que a essa altura e o
      // RASCUNHO - e gravava na conta uma configuracao que o jogador podia
      // nem ter salvado. Ao recarregar, a nuvem estava mais nova que o disco
      // e vencia: o rascunho abandonado voltava como se fosse o definitivo, e
      // um "restaurar padrao" que ninguem confirmou zerava tudo a cada visita.
      window.clearTimeout(timer)

      // Rascunho nao vai para a nuvem: sair da tela sem salvar nao pode
      // deixar na conta uma configuracao que nem no proprio navegador existe.
      if (settingsStore.dirty) return

      // Debounce: mexer num slider dispara dezenas de alteracoes, e cada uma
      // seria uma escrita no banco.
      timer = window.setTimeout(() => {
        // Checado DE NOVO na hora de enviar, e nao so ao agendar: o estado
        // pode ter virado rascunho durante a espera.
        if (settingsStore.dirty) return
        void supabase!.from('player_settings').upsert(
          { user_id: userId, settings: toCloudPayload(settingsStore.get()) },
          { onConflict: 'user_id' },
        )
      }, DEBOUNCE_MS)
    })

    return () => {
      window.clearTimeout(timer)
      cancelar()
    }
  }, [userId])
}
