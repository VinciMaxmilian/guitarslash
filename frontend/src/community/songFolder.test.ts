import { describe, expect, it } from 'vitest'

import { MAX_UPLOAD_BYTES, inspectFolder, parseIni, slugify } from './songFolder'

function arquivo(nome: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], nome)
}

const COMPLETA = [
  arquivo('notes.mid', 40_000),
  arquivo('song.ini', 500),
  arquivo('song.opus', 3_000_000),
  arquivo('album.jpg', 120_000),
]

describe('inspectFolder', () => {
  it('aceita uma pasta completa', () => {
    const r = inspectFolder(COMPLETA)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.chart?.name).toBe('notes.mid')
    expect(r.ini?.name).toBe('song.ini')
    expect(r.audio).toHaveLength(1)
    expect(r.cover?.name).toBe('album.jpg')
  })

  it('soma apenas os arquivos que interessam', () => {
    const r = inspectFolder([...COMPLETA, arquivo('leiame.txt', 9_000_000)])
    expect(r.totalBytes).toBe(40_000 + 500 + 3_000_000 + 120_000)
  })

  it('exige o chart', () => {
    const r = inspectFolder(COMPLETA.filter((f) => f.name !== 'notes.mid'))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('notes.mid')
  })

  it('exige o song.ini', () => {
    const r = inspectFolder(COMPLETA.filter((f) => f.name !== 'song.ini'))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('song.ini')
  })

  it('exige audio', () => {
    const r = inspectFolder(COMPLETA.filter((f) => !f.name.endsWith('.opus')))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('áudio')
  })

  it('aceita notes.midi tambem', () => {
    const r = inspectFolder([arquivo('notes.midi'), arquivo('song.ini'), arquivo('song.mp3')])
    expect(r.ok).toBe(true)
  })

  it('junta todos os stems de audio', () => {
    const r = inspectFolder([
      arquivo('notes.mid'), arquivo('song.ini'),
      arquivo('guitar.opus'), arquivo('bass.opus'), arquivo('drums_1.opus'),
    ])
    expect(r.audio.map((a) => a.name).sort()).toEqual(['bass.opus', 'drums_1.opus', 'guitar.opus'])
  })

  it('recusa pasta acima do teto', () => {
    const r = inspectFolder([
      arquivo('notes.mid'), arquivo('song.ini'), arquivo('song.opus', MAX_UPLOAD_BYTES + 1),
    ])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/limite por envio/)
  })

  it('avisa sobre capa ausente sem bloquear', () => {
    const r = inspectFolder([arquivo('notes.mid'), arquivo('song.ini'), arquivo('song.opus')])
    expect(r.ok).toBe(true)
    expect(r.warnings.join(' ')).toContain('capa')
  })

  it('avisa que o video nao sobe', () => {
    const r = inspectFolder([...COMPLETA, arquivo('background.mp4', 30_000_000)])
    expect(r.ok).toBe(true)
    expect(r.warnings.join(' ')).toContain('vídeo')
  })

  it('pasta vazia lista tudo que falta', () => {
    const r = inspectFolder([])
    expect(r.ok).toBe(false)
    expect(r.errors).toHaveLength(3)
  })

  it('ignora o caminho e olha so o nome do arquivo', () => {
    const r = inspectFolder([
      arquivo('Minha Banda - Musica/notes.mid'),
      arquivo('Minha Banda - Musica/song.ini'),
      arquivo('Minha Banda - Musica/song.opus'),
    ])
    expect(r.ok).toBe(true)
  })
})

describe('parseIni', () => {
  const INI = `[song]
name = Paint It Black
artist = The Rolling Stones
album = Aftermath
year = 1966
charter = FreeStyleGames
song_length = 231779
delay = 3778
preview_start_time = 30000
`

  it('le os metadados', () => {
    const m = parseIni(INI)
    expect(m.title).toBe('Paint It Black')
    expect(m.artist).toBe('The Rolling Stones')
    expect(m.year).toBe('1966')
  })

  it('converte tempo de ms para segundos', () => {
    // Errar esta unidade dessincroniza a musica inteira.
    const m = parseIni(INI)
    expect(m.duration).toBeCloseTo(231.779, 3)
    expect(m.delay).toBeCloseTo(3.778, 3)
    expect(m.previewStart).toBeCloseTo(30, 3)
  })

  it('aceita delay negativo', () => {
    expect(parseIni('delay = -500').delay).toBeCloseTo(-0.5, 3)
  })

  it('aceita o apelido `offset` para delay', () => {
    expect(parseIni('offset = 1500').delay).toBeCloseTo(1.5, 3)
  })

  it('aceita `frets` como charter', () => {
    expect(parseIni('frets = Alguem').charter).toBe('Alguem')
  })

  it('ignora comentario, secao e linha sem igual', () => {
    const m = parseIni('[song]\n; comentario\n# outro\nlixo\nname = X')
    expect(m.title).toBe('X')
  })

  it('ini vazio nao quebra', () => {
    const m = parseIni('')
    expect(m.title).toBe('')
    expect(m.duration).toBe(0)
    expect(m.delay).toBe(0)
  })

  it('valor nao numerico em tempo vira zero', () => {
    expect(parseIni('song_length = muito').duration).toBe(0)
  })

  it('e tolerante com espaco e maiuscula na chave', () => {
    expect(parseIni('  NAME   =   Y  ').title).toBe('Y')
  })
})

describe('slugify', () => {
  it('monta artista-titulo', () => {
    expect(slugify('The Rolling Stones', 'Paint It Black')).toBe(
      'the-rolling-stones-paint-it-black',
    )
  })

  it('remove acento, que o check do banco recusa', () => {
    expect(slugify('Legião Urbana', 'Será')).toBe('legiao-urbana-sera')
  })

  it('colapsa pontuacao', () => {
    expect(slugify('AC/DC', 'T.N.T.')).toBe('ac-dc-t-n-t')
  })

  it('nao comeca nem termina com hifen', () => {
    const s = slugify('!!!', '...?')
    expect(s.startsWith('-')).toBe(false)
    expect(s.endsWith('-')).toBe(false)
  })

  it('sem nada utilizavel, devolve um slug valido', () => {
    expect(slugify('', '')).toBe('musica')
    expect(slugify('!!!', '???')).toBe('musica')
  })

  it('respeita o limite de tamanho do check', () => {
    expect(slugify('a'.repeat(300), 'b'.repeat(300)).length).toBeLessThanOrEqual(120)
  })

  it('sempre casa com o check do banco', () => {
    const padrao = /^[a-z0-9][a-z0-9-]{0,120}$/
    for (const [a, t] of [['AC/DC', 'T.N.T.'], ['', ''], ['Legião', 'Será'], ['9mm', '---']]) {
      expect(slugify(a, t)).toMatch(padrao)
    }
  })
})
