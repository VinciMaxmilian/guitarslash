import { useEffect, useState } from 'react'

import { useUISounds } from '../hooks/useUISounds'

interface Props {
  onStart: () => void
}

/**
 * Tela de abertura: qualquer tecla entra no jogo.
 *
 * Tambem serve um proposito tecnico: o navegador exige um gesto do usuario
 * antes de tocar audio. Passar por aqui garante esse gesto, entao a musica do
 * menu e os efeitos ja podem tocar sem o bloqueio de autoplay.
 */
export function TitleScreen({ onStart }: Props) {
  const [saindo, setSaindo] = useState(false)
  const uiSounds = useUISounds()

  useEffect(() => {
    if (saindo) return

    const entrar = () => {
      setSaindo(true)
      uiSounds.play('start1')
      // Deixa a animacao de saida rodar antes de trocar de tela.
      window.setTimeout(onStart, 260)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Teclas de sistema nao contam como "qualquer tecla".
      if (event.key === 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      entrar()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', entrar)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', entrar)
    }
  }, [saindo, onStart, uiSounds])

  return (
    <div className={`ts-screen ${saindo ? 'saindo' : ''}`}>
      <div className="ts-grain" />

      <div className="ts-art">
        <img src="/ui/intro-art.png" alt="" />
      </div>

      <div className="ts-side">
        <h1 className="ts-title">
          <span className="ts-title-1">GUITAR</span>
          <span className="ts-title-2">SLASH</span>
          <span className="ts-title-sub">CHAPTER THREE</span>
        </h1>

        <div className="ts-press">
          PRESS ANY
          <br />
          BUTTON TO ROCK...
        </div>
      </div>
    </div>
  )
}
