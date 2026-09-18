import { useEffect, useRef } from 'react'

import { api, resolveAssetUrl } from '../api/client'
import { buildPlaylist, type BackgroundTrack } from '../game/backgroundPlaylist'

/**
 * Musica aleatoria de fundo nos menus, em volume baixo.
 *
 * Toca do INICIO do arquivo, de proposito. A versao anterior pulava para um
 * instante aleatorio (`currentTime = ...`), e um seek faz o navegador pedir o
 * arquivo por Range (HTTP 206). Em Ogg/Opus isso exige busca por bytes, e
 * quando o servidor ou o arquivo nao colaboram o seek nunca conclui: a musica
 * simplesmente nao sai. Tocar direto do zero nao precisa de Range nenhum.
 */

/** Telas sem musica de menu. */
const SILENT_SCREENS = [
  // Aqui o navegador ainda bloqueia audio: o gesto que libera o autoplay e
  // justamente sair desta tela.
  'title',
  // A lista de musicas tem preview propria; duas fontes de audio brigariam.
  'songs',
  'game',
  'result',
]

const VOLUME = 0.2

export function useBackgroundMusic(screen: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const shouldPlay = !SILENT_SCREENS.includes(screen)

  // A dependencia e o BOOLEANO, e nao a tela: navegar entre menus nao deve
  // reiniciar a musica. Antes o efeito re-rodava a cada troca de tela e
  // sorteava outra musica, cortando a que estava tocando.
  useEffect(() => {
    if (!shouldPlay) {
      stop(audioRef)
      return
    }
    if (audioRef.current) return

    let active = true

    const tocar = (fila: BackgroundTrack[], indice: number) => {
      if (!active || indice >= fila.length) return

      const url = resolveAssetUrl(fila[indice].path)
      if (!url) {
        tocar(fila, indice + 1)
        return
      }

      const audio = new Audio()
      audio.volume = VOLUME
      audio.preload = 'auto'
      // Sem loop a tela fica em silencio quando a faixa acaba - e o preview
      // costuma ter poucos segundos.
      audio.loop = true
      audioRef.current = audio

      // Uma faixa pode falhar por codec, 404 ou rede. Nesse caso passa para a
      // proxima da fila, em vez de deixar o menu muto.
      audio.addEventListener(
        'error',
        () => {
          if (!active || audioRef.current !== audio) return
          audioRef.current = null
          tocar(fila, indice + 1)
        },
        { once: true },
      )

      audio.src = url
      audio.play().catch(() => {
        // Autoplay bloqueado: nao e erro do arquivo, nao tenta a proxima.
      })
    }

    const iniciar = async () => {
      try {
        const lib = await api.library()
        if (!active) return
        tocar(buildPlaylist(lib.songs), 0)
      } catch {
        // Sem biblioteca nao ha musica de menu; o resto do jogo segue.
      }
    }

    void iniciar()

    return () => {
      active = false
    }
  }, [shouldPlay])

  // Desmontagem: solta o audio. Separado do efeito acima justamente para que
  // trocar de tela nao passe por aqui.
  useEffect(() => () => stop(audioRef), [])
}

function stop(ref: React.MutableRefObject<HTMLAudioElement | null>): void {
  const audio = ref.current
  if (!audio) return
  ref.current = null
  audio.pause()
  // Limpar o src aborta o download em andamento.
  audio.removeAttribute('src')
  audio.load()
}
