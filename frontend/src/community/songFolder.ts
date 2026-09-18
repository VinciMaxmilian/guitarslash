/**
 * Validacao da pasta de musica que o jogador envia.
 *
 * O formato e o do Clone Hero / Enchor (enchor.us): uma pasta com song.ini,
 * notes.mid e os stems de audio. Validar ANTES de subir evita gastar a cota do
 * jogador com um envio que o jogo nao conseguiria tocar.
 */

/** Extensoes de audio que o navegador toca. */
const AUDIO_EXT = ['.opus', '.ogg', '.mp3', '.m4a', '.wav', '.flac']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp']
const VIDEO_EXT = ['.mp4', '.webm']

/** Teto por envio. Acima disto o upload no navegador fica sofrivel. */
export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024

export interface FolderFile {
  name: string
  size: number
  file: File
}

export interface InspectedFolder {
  ok: boolean
  /** Motivos que impedem o envio. */
  errors: string[]
  /** Coisas que faltam mas nao impedem. */
  warnings: string[]
  chart: FolderFile | null
  ini: FolderFile | null
  audio: FolderFile[]
  cover: FolderFile | null
  video: FolderFile | null
  totalBytes: number
}

function ext(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * Classifica os arquivos escolhidos e diz se dao uma musica jogavel.
 *
 * Aceita a lista achatada de um `<input webkitdirectory>`: subpastas viram
 * caminho no nome, e so o nome do arquivo importa.
 */
export function inspectFolder(files: readonly File[]): InspectedFolder {
  const resultado: InspectedFolder = {
    ok: false,
    errors: [],
    warnings: [],
    chart: null,
    ini: null,
    audio: [],
    cover: null,
    video: null,
    totalBytes: 0,
  }

  for (const file of files) {
    const nome = baseName(file.name || (file as File & { webkitRelativePath?: string }).webkitRelativePath || '')
    const baixo = nome.toLowerCase()
    const e = ext(nome)
    const item: FolderFile = { name: nome, size: file.size, file }

    if (baixo === 'notes.mid' || baixo === 'notes.midi') resultado.chart = item
    else if (baixo === 'song.ini') resultado.ini = item
    else if (AUDIO_EXT.includes(e)) resultado.audio.push(item)
    else if (IMAGE_EXT.includes(e) && !resultado.cover) resultado.cover = item
    else if (VIDEO_EXT.includes(e) && !resultado.video) resultado.video = item
    else continue

    resultado.totalBytes += file.size
  }

  if (!resultado.chart) resultado.errors.push('Falta o notes.mid (o chart da música).')
  if (!resultado.ini) resultado.errors.push('Falta o song.ini (o nome e o artista vêm dele).')
  if (resultado.audio.length === 0) resultado.errors.push('Falta o áudio da música.')

  if (resultado.totalBytes > MAX_UPLOAD_BYTES) {
    const mb = Math.round(resultado.totalBytes / 1048576)
    const teto = Math.round(MAX_UPLOAD_BYTES / 1048576)
    resultado.errors.push(`A pasta tem ${mb} MB; o limite por envio é ${teto} MB.`)
  }

  if (!resultado.cover) resultado.warnings.push('Sem capa: a lista mostra um espaço vazio.')
  if (resultado.video) {
    // O video e de longe o arquivo mais pesado, e o jogo roda sem ele.
    resultado.warnings.push('O vídeo de fundo não é enviado, para poupar espaço.')
  }

  resultado.ok = resultado.errors.length === 0
  return resultado
}

/** Metadados lidos do song.ini. O formato e `chave = valor`. */
export interface IniMetadata {
  title: string
  artist: string
  album: string
  charter: string
  year: string
  genre: string
  duration: number
  delay: number
  previewStart: number
}

const ALIASES: Record<string, string> = {
  name: 'name',
  artist: 'artist',
  album: 'album',
  charter: 'charter',
  frets: 'charter',
  year: 'year',
  genre: 'genre',
  song_length: 'song_length',
  delay: 'delay',
  offset: 'delay',
  preview_start_time: 'preview_start_time',
}

export function parseIni(text: string): IniMetadata {
  const dados: Record<string, string> = {}

  for (const linhaCrua of text.split(/\r?\n/)) {
    const linha = linhaCrua.trim()
    if (!linha || linha.startsWith('[') || linha.startsWith(';') || linha.startsWith('#')) continue
    const igual = linha.indexOf('=')
    if (igual < 0) continue
    const chave = ALIASES[linha.slice(0, igual).trim().toLowerCase()]
    if (chave) dados[chave] = linha.slice(igual + 1).trim()
  }

  /** Campos de tempo vem em MILISSEGUNDOS no song.ini. */
  const segundos = (valor: string | undefined): number => {
    const ms = Number(valor)
    return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0
  }

  return {
    title: dados.name || '',
    artist: dados.artist || '',
    album: dados.album || '',
    charter: dados.charter || '',
    year: dados.year || '',
    genre: dados.genre || '',
    duration: segundos(dados.song_length),
    // `delay` pode ser negativo, entao nao passa pelo filtro de positivo.
    delay: Number.isFinite(Number(dados.delay)) ? Number(dados.delay) / 1000 : 0,
    previewStart: segundos(dados.preview_start_time),
  }
}

/** "The Rolling Stones - Paint It Black" -> "the-rolling-stones-paint-it-black" */
export function slugify(artist: string, title: string): string {
  const cru = `${artist} ${title}`.trim() || 'musica'
  return (
    cru
      .normalize('NFD')
      // Remove acento: o slug entra num check do banco que so aceita a-z0-9-.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'musica'
  )
}
