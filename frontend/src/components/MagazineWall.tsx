import { useEffect, useState } from 'react'

interface Manifest {
  magazines: string[]
}

/**
 * Colagem de revistas nas laterais da tela.
 *
 * As imagens vêm de `magazines/` na raiz do projeto, copiadas para
 * `frontend/public/magazines/` por `python main.py assets`. São conteúdo do
 * usuário: se a pasta estiver vazia, a tela simplesmente não mostra nada.
 */
export function MagazineWall() {
  const [files, setFiles] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    fetch('/magazines/index.json')
      .then((response) => (response.ok ? (response.json() as Promise<Manifest>) : null))
      .then((data) => {
        if (!cancelled && data?.magazines?.length) setFiles(data.magazines)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  if (files.length === 0) return null

  const half = Math.ceil(files.length / 2)
  const left = files.slice(0, half)
  const right = files.slice(half)

  return (
    <>
      <MagazineColumn side="left" files={left} />
      <MagazineColumn side="right" files={right.length > 0 ? right : left} />
    </>
  )
}

function MagazineColumn({ side, files }: { side: 'left' | 'right'; files: string[] }) {
  return (
    <div className={`magazine-wall ${side}`} aria-hidden>
      {files.map((file, index) => (
        <div
          className="magazine"
          key={`${side}-${file}`}
          style={{
            // Rotações alternadas, para parecer colado à mão.
            ['--tilt' as string]: `${(index % 2 === 0 ? -1 : 1) * (3 + index)}deg`,
          }}
        >
          <img src={`/magazines/${file}`} alt="" loading="lazy" />
        </div>
      ))}
    </div>
  )
}
