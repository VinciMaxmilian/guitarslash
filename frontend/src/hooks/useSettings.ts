import { useSyncExternalStore } from 'react'

import { settingsStore } from '../settings/SettingsStore'

/** As configuracoes vivem fora do React; aqui so lemos o valor atual. */
export function useSettings() {
  return useSyncExternalStore(
    (listener) => settingsStore.subscribe(listener),
    () => settingsStore.get(),
    () => settingsStore.get(),
  )
}

/**
 * Ha alteracao em rascunho ainda nao gravada?
 *
 * Usa a MESMA inscricao do `useSettings`: `dirty` so muda junto com as
 * configuracoes, com `save` ou com `discard`, e os tres notificam os
 * inscritos. Um booleano compara por valor, entao nao re-renderiza a toa.
 */
export function useSettingsDirty(): boolean {
  return useSyncExternalStore(
    (listener) => settingsStore.subscribe(listener),
    () => settingsStore.dirty,
    () => settingsStore.dirty,
  )
}
