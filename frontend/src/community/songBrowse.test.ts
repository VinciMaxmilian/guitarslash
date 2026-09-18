import { describe, expect, it } from 'vitest'

import {
  browseSongs,
  difficultyScore,
  filterSongs,
  normalize,
  sortSongs,
} from './songBrowse'
import type { SongSummary } from '../api/types'

function song(over: Partial<SongSummary> = {}): SongSummary {
  return {
    id: 'x',
    title: 'Titulo',
    artist: 'Artista',
    album: null,
    year: null,
    genre: null,
    charter: null,
    duration: 200,
    previewStart: 0,
    delay: 0,
    instruments: {},
    hasCover: false,
    hasBackgroundVideo: false,
    assets: { cover: null, backgroundVideo: null, chart: null, audio: {} },
    missing: [],
    ...over,
  } as SongSummary
}

function comNotas(duracao: number, notas: number, over: Partial<SongSummary> = {}) {
  return song({
    duration: duracao,
    instruments: {
      guitar: {
        available: true,
        supported: true,
        difficulties: ['expert'],
        noteCounts: { expert: notas },
      },
    },
    ...over,
  })
}

describe('normalize', () => {
  it('remove acento e caixa', () => {
    expect(normalize('Legião URBANA')).toBe('legiao urbana')
    expect(normalize('  Será?  ')).toBe('sera?')
  })
})

describe('filterSongs', () => {
  const lista = [
    song({ id: 'a', title: 'Paint It Black', artist: 'The Rolling Stones' }),
    song({ id: 'b', title: 'Será', artist: 'Legião Urbana' }),
    song({
      id: 'c',
      title: 'Bulls on Parade',
      artist: 'Rage Against the Machine',
      charter: 'Harmonix',
    }),
  ]

  it('busca vazia devolve tudo', () => {
    expect(filterSongs(lista, '')).toHaveLength(3)
    expect(filterSongs(lista, '   ')).toHaveLength(3)
  })

  it('acha por titulo', () => {
    expect(filterSongs(lista, 'paint').map((s) => s.id)).toEqual(['a'])
  })

  it('acha por artista', () => {
    expect(filterSongs(lista, 'rage').map((s) => s.id)).toEqual(['c'])
  })

  it('acha por charter', () => {
    expect(filterSongs(lista, 'harmonix').map((s) => s.id)).toEqual(['c'])
  })

  it('ignora acento na busca e no dado', () => {
    // Quem digita "sera" tem de achar "Será".
    expect(filterSongs(lista, 'sera').map((s) => s.id)).toEqual(['b'])
    expect(filterSongs(lista, 'legiao').map((s) => s.id)).toEqual(['b'])
  })

  it('ignora maiuscula', () => {
    expect(filterSongs(lista, 'PAINT').map((s) => s.id)).toEqual(['a'])
  })

  it('termos em qualquer ordem, todos precisam casar', () => {
    // Obrigar a ordem faria o jogador adivinhar como o titulo foi escrito.
    expect(filterSongs(lista, 'stones black').map((s) => s.id)).toEqual(['a'])
    expect(filterSongs(lista, 'black stones').map((s) => s.id)).toEqual(['a'])
    expect(filterSongs(lista, 'black rage')).toHaveLength(0)
  })

  it('sem resultado devolve lista vazia', () => {
    expect(filterSongs(lista, 'inexistente')).toEqual([])
  })

  it('nao muta a lista recebida', () => {
    const copia = [...lista]
    filterSongs(lista, 'paint')
    expect(lista).toEqual(copia)
  })
})

describe('difficultyScore', () => {
  it('e notas por segundo', () => {
    expect(difficultyScore(comNotas(100, 500))).toBeCloseTo(5, 5)
  })

  it('usa a dificuldade mais alta disponivel', () => {
    const s = song({
      duration: 100,
      instruments: {
        guitar: {
          available: true,
          supported: true,
          difficulties: ['easy', 'expert'],
          noteCounts: { easy: 100, expert: 800 },
        },
      },
    })
    expect(difficultyScore(s)).toBeCloseTo(8, 5)
  })

  it('ignora instrumento nao suportado', () => {
    const s = song({
      duration: 100,
      instruments: {
        vocals: {
          available: true,
          supported: false,
          difficulties: [],
          noteCounts: { expert: 9999 },
        },
        guitar: {
          available: true,
          supported: true,
          difficulties: ['expert'],
          noteCounts: { expert: 200 },
        },
      },
    })
    expect(difficultyScore(s)).toBeCloseTo(2, 5)
  })

  it('aceita note_counts em snake_case, do pacote do CDN', () => {
    const s = song({
      duration: 100,
      instruments: {
        guitar: {
          available: true,
          supported: true,
          difficulties: ['expert'],
          note_counts: { expert: 300 },
        },
      },
    } as unknown as Partial<SongSummary>)
    expect(difficultyScore(s)).toBeCloseTo(3, 5)
  })

  it('sem dado devolve 0', () => {
    expect(difficultyScore(song())).toBe(0)
    expect(difficultyScore(comNotas(0, 500))).toBe(0)
    expect(difficultyScore(comNotas(100, 0))).toBe(0)
  })
})

describe('sortSongs', () => {
  it('alfabetica ordena por titulo', () => {
    const lista = [song({ title: 'Zebra' }), song({ title: 'Abacate' }), song({ title: 'Melao' })]
    expect(sortSongs(lista, 'alfabetica').map((s) => s.title)).toEqual([
      'Abacate',
      'Melao',
      'Zebra',
    ])
  })

  it('alfabetica trata acento como a letra base', () => {
    const lista = [song({ title: 'Zulu' }), song({ title: 'Ária' }), song({ title: 'Bar' })]
    expect(sortSongs(lista, 'alfabetica').map((s) => s.title)).toEqual(['Ária', 'Bar', 'Zulu'])
  })

  it('titulo igual desempata por artista', () => {
    const lista = [
      song({ title: 'Igual', artist: 'Zeca' }),
      song({ title: 'Igual', artist: 'Ana' }),
    ]
    expect(sortSongs(lista, 'alfabetica').map((s) => s.artist)).toEqual(['Ana', 'Zeca'])
  })

  it('dificuldade vai da mais dificil para a mais facil', () => {
    const lista = [
      comNotas(100, 200, { title: 'Facil' }),
      comNotas(100, 900, { title: 'Dificil' }),
      comNotas(100, 500, { title: 'Media' }),
    ]
    expect(sortSongs(lista, 'dificuldade').map((s) => s.title)).toEqual([
      'Dificil',
      'Media',
      'Facil',
    ])
  })

  it('musica sem dado de dificuldade vai para o fim', () => {
    const lista = [song({ title: 'SemDado' }), comNotas(100, 300, { title: 'ComDado' })]
    expect(sortSongs(lista, 'dificuldade').map((s) => s.title)).toEqual(['ComDado', 'SemDado'])
  })

  it('empate de dificuldade cai no alfabetico', () => {
    // Ordem arbitraria faria a lista "dancar" a cada abertura.
    const lista = [
      comNotas(100, 300, { title: 'Zebra' }),
      comNotas(100, 300, { title: 'Abacate' }),
    ]
    expect(sortSongs(lista, 'dificuldade').map((s) => s.title)).toEqual(['Abacate', 'Zebra'])
  })

  it('recentes ordena por data de envio', () => {
    const lista = [
      song({ title: 'Velha', createdAt: '2026-01-01T00:00:00Z' }),
      song({ title: 'Nova', createdAt: '2026-09-01T00:00:00Z' }),
    ]
    expect(sortSongs(lista, 'recentes').map((s) => s.title)).toEqual(['Nova', 'Velha'])
  })

  it('sem data (biblioteca local) nao reordena', () => {
    const lista = [song({ title: 'A' }), song({ title: 'B' })]
    expect(sortSongs(lista, 'recentes').map((s) => s.title)).toEqual(['A', 'B'])
  })

  it('data invalida vai para o fim', () => {
    const lista = [
      song({ title: 'Ruim', createdAt: 'nao-e-data' }),
      song({ title: 'Boa', createdAt: '2026-01-01T00:00:00Z' }),
    ]
    expect(sortSongs(lista, 'recentes').map((s) => s.title)).toEqual(['Boa', 'Ruim'])
  })

  it('nao muta a lista recebida', () => {
    const lista = [song({ title: 'Z' }), song({ title: 'A' })]
    const copia = [...lista]
    sortSongs(lista, 'alfabetica')
    expect(lista).toEqual(copia)
  })
})

describe('browseSongs', () => {
  it('filtra e ordena numa passada', () => {
    const lista = [
      comNotas(100, 200, { title: 'Rock Facil', artist: 'Banda' }),
      comNotas(100, 900, { title: 'Rock Dificil', artist: 'Banda' }),
      comNotas(100, 500, { title: 'Samba', artist: 'Outra' }),
    ]
    expect(browseSongs(lista, 'rock', 'dificuldade').map((s) => s.title)).toEqual([
      'Rock Dificil',
      'Rock Facil',
    ])
  })

  it('lista vazia nao quebra', () => {
    expect(browseSongs([], 'qualquer', 'alfabetica')).toEqual([])
  })
})
