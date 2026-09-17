import { useRef, useCallback, useEffect, useMemo } from 'react'

const AUDIO_URLS = {
  scroll: '/sounds/scroll.wav',
  select: '/sounds/select.wav',
  back: '/sounds/menu_select_11R.wav',
  start1: '/sounds/highway_riseR.wav',
  start2: '/sounds/notes_ripple_up_01.wav'
}

export function useUISounds() {
  const audios = useRef<Record<string, HTMLAudioElement>>({})

  useEffect(() => {
    // Preload audios
    Object.entries(AUDIO_URLS).forEach(([key, url]) => {
      const a = new Audio(url)
      a.volume = 0.5
      a.preload = 'auto'
      audios.current[key] = a
    })
  }, [])

  const play = useCallback((sound: keyof typeof AUDIO_URLS) => {
    const a = audios.current[sound]
    if (a) {
      // Clone it so we can play overlapping sounds
      const clone = a.cloneNode() as HTMLAudioElement
      clone.volume = a.volume
      clone.play().catch(() => {})
    }
  }, [])

  return useMemo(() => ({ play }), [play])
}
