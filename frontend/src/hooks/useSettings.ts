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
