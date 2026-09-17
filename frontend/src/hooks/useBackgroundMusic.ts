import { useEffect, useRef } from 'react'
import { api, resolveAssetUrl } from '../api/client'

export function useBackgroundMusic(screen: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  useEffect(() => {
    // Should play background music in menus except songlist, game, result
    const shouldPlay = !['songs', 'game', 'result'].includes(screen)

    if (!shouldPlay) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      return
    }

    if (audioRef.current) return // Already playing

    let active = true

    const playRandom = async () => {
      try {
        const lib = await api.library()
        if (!active || !lib.songs.length) return
        
        const playable = lib.songs.filter(s => Object.keys(s.assets.audio).length > 0)
        if (!playable.length) return

        const song = playable[Math.floor(Math.random() * playable.length)]
        const url = resolveAssetUrl(song.assets.audio.preview ?? song.assets.audio.song)
        if (!url) return

        const audio = new Audio(url)
        audio.volume = 0.2 // baixo
        audioRef.current = audio

        const onReady = () => {
          if (!active) return
          // Tocar num momento aleatório
          const maxStart = Math.max(0, song.duration - 30)
          audio.currentTime = Math.random() * maxStart
          audio.play().catch(() => {
            // Browsers may block autoplay
          })
        }
        
        audio.addEventListener('loadedmetadata', onReady, { once: true })
      } catch (err) {
        // ignore
      }
    }

    playRandom()

    return () => {
      active = false
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [screen])
}
