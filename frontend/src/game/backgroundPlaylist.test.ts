import { describe, expect, it } from 'vitest'

import { backgroundStem, buildPlaylist } from './backgroundPlaylist'
import type { SongSummary } from '../api/types'

function song(id: string, audio: Record<string, string>): SongSummary {
  return {
    id,
    title: id,
    artist: 'Banda',
    album: '',
    year: '',
    genre: '',
    charter: '',
    duration: 200,
    previewStart: 0,
    delay: 0,
    instruments: {},
    assets: { cover: null, backgroundVideo: null, chart: null, audio },
    missing: [],
  } as unknown as SongSummary
}

describe('backgroundStem', () => {
  it('prefere o preview, que e curto e feito para isto', () => {
    expect(backgroundStem({ preview: 'p.opus', song: 's.opus', guitar: 'g.opus' })).toBe('p.opus')
  })

  it('sem preview, usa a base da musica', () => {
    expect(backgroundStem({ song: 's.opus', guitar: 'g.opus' })).toBe('s.opus')
  })

  it('sem preview e sem song, usa qualquer stem', () => {
    // Caso real: ha musicas so com bass/drums/guitar/vocals separados, e elas
    // ficavam silenciosas no menu.
    const escolhido = backgroundStem({
      vocals: 'v.opus',
      bass: 'b.opus',
      drums_1: 'd.opus',
      guitar: 'g.opus',
    })
    expect(escolhido).toBeTruthy()
    expect(['v.opus', 'b.opus', 'd.opus', 'g.opus']).toContain(escolhido)
  })

  it('a escolha do fallback e estavel entre execucoes', () => {
    const audio = { vocals: 'v.opus', bass: 'b.opus', guitar: 'g.opus' }
    expect(backgroundStem(audio)).toBe(backgroundStem({ ...audio }))
  })

  it('sem audio nenhum devolve null', () => {
    expect(backgroundStem({})).toBeNull()
    expect(backgroundStem(undefined)).toBeNull()
  })

  it('ignora stem com caminho vazio', () => {
    expect(backgroundStem({ preview: '', song: 's.opus' })).toBe('s.opus')
  })
})

describe('buildPlaylist', () => {
  it('inclui so musicas com audio', () => {
    const fila = buildPlaylist([
      song('com-audio', { song: 's.opus' }),
      song('sem-audio', {}),
    ])
    expect(fila.map((t) => t.songId)).toEqual(['com-audio'])
  })

  it('inclui musica que so tem stems separados', () => {
    const fila = buildPlaylist([song('so-stems', { guitar: 'g.opus', vocals: 'v.opus' })])
    expect(fila).toHaveLength(1)
    expect(fila[0].path).toBeTruthy()
  })

  it('devolve uma fila, para haver proxima quando uma falhar', () => {
    const fila = buildPlaylist(
      [song('a', { song: 'a.opus' }), song('b', { song: 'b.opus' }), song('c', { song: 'c.opus' })],
      () => 0,
    )
    expect(fila).toHaveLength(3)
  })

  it('embaralha de acordo com o sorteio', () => {
    const entrada = [
      song('a', { song: 'a.opus' }),
      song('b', { song: 'b.opus' }),
      song('c', { song: 'c.opus' }),
    ]
    const sempreZero = buildPlaylist(entrada, () => 0).map((t) => t.songId)
    const sempreUm = buildPlaylist(entrada, () => 0.999999).map((t) => t.songId)
    expect(sempreZero).not.toEqual(sempreUm)
  })

  it('nao perde nem duplica musica ao embaralhar', () => {
    const entrada = Array.from({ length: 12 }, (_, i) =>
      song(`s${i}`, { song: `s${i}.opus` }),
    )
    for (const r of [() => 0, () => 0.5, () => 0.999999, Math.random]) {
      const fila = buildPlaylist(entrada, r)
      expect(fila).toHaveLength(12)
      expect(new Set(fila.map((t) => t.songId)).size).toBe(12)
    }
  })

  it('lista vazia devolve fila vazia', () => {
    expect(buildPlaylist([])).toEqual([])
  })

  it('leva o titulo junto, para a interface poder mostrar', () => {
    const fila = buildPlaylist([song('x', { song: 'x.opus' })])
    expect(fila[0].title).toBe('x')
  })
})
