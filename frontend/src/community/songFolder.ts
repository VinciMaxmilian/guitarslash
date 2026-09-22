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

/**
 * Nomes de capa, em ordem de preferencia. Iguais aos do backend
 * (`COVER_NAMES` em services/library.py), para a mesma pasta dar a mesma capa
 * na biblioteca local e na comunidade.
 *
 * A ordem importa: pasta do Clone Hero costuma trazer varias imagens (capa,
 * arte de fundo, foto do charter). Pegar "a primeira que aparecer" fazia a
 * capa depender da ordem em que o navegador entregou os arquivos.
 */
const COVER_NAMES = ['album', 'cover', 'artwork', 'background-art']

/**
 * Tipo MIME por extensao.
 *
 * NAO da para confiar no `File.type` do navegador: ele vem do registro do
 * sistema e muda de maquina para maquina. No Windows um `notes.mid` e
 * anunciado como `audio/mid`, que nao e um tipo valido e nao esta na lista do
 * bucket - o envio morria com "mime type audio/mid is not supported". Pior,
 * quando o sistema nao conhece a extensao o tipo vem VAZIO e o arquivo subia
 * como texto, o que quebra o seek do audio depois.
 */
const MIME_POR_EXT: Record<string, string> = {
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.chart': 'text/plain',
  '.ini': 'text/plain',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

/** Tipo com que o arquivo deve ser gravado, decidido pela EXTENSAO. */
export function contentTypeFor(name: string): string {
  return MIME_POR_EXT[ext(baseName(name))] ?? 'application/octet-stream'
}

/**
 * O corpo a enviar, com o tipo CORRIGIDO.
 *
 * A opcao `contentType` do `storage.upload()` nao vale quando o corpo e um
 * File: a biblioteca monta um FormData e so usa aquele campo no ramo em que o
 * corpo NAO e Blob. O servidor acaba lendo o tipo da parte do multipart, que
 * carrega o `File.type` do navegador - o mesmo `audio/mid` que o bucket
 * recusa. Passar o tipo pela opcao falhava em silencio.
 *
 * `slice` devolve um Blob com o tipo pedido e NAO copia os bytes: o video de
 * fundo pode ter dezenas de MB, e `new Blob([arquivo])` os traria todos para
 * a memoria.
 */
export function uploadBody(file: File, nomeFinal: string): Blob {
  return file.slice(0, file.size, contentTypeFor(nomeFinal))
}

/**
 * O arquivo comeca com o cabecalho "MThd" de MIDI?
 *
 * Serve para DESCOBRIR o formato, e nao para recusar: existe pasta por ai com
 * um `notes.chart` (formato texto do Clone Hero) apenas renomeado para
 * `notes.mid`. O nome engana, o conteudo nao - e o backend le os dois
 * formatos, entao basta saber qual e.
 */
export async function isMidi(file: File): Promise<boolean> {
  try {
    const cabecalho = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    // 0x4d 0x54 0x68 0x64 = "MThd"
    return (
      cabecalho[0] === 0x4d &&
      cabecalho[1] === 0x54 &&
      cabecalho[2] === 0x68 &&
      cabecalho[3] === 0x64
    )
  } catch {
    // Nao deu para ler: assume MIDI e deixa o backend decidir.
    return true
  }
}

/** Teto por envio. Acima disto o upload no navegador fica sofrivel. */
export const MAX_UPLOAD_BYTES = 140 * 1024 * 1024

/**
 * Teto do video de fundo.
 *
 * Bate com o `file_size_limit` do bucket (migration 0005). Barrar aqui da uma
 * mensagem util; barrar so no Storage daria um 413 no meio do envio, depois do
 * chart e do audio ja terem subido.
 */
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024

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

  /** Todas as imagens da pasta; a capa sai daqui no fim. */
  const imagens: FolderFile[] = []

  for (const file of files) {
    const nome = baseName(file.name || (file as File & { webkitRelativePath?: string }).webkitRelativePath || '')
    const baixo = nome.toLowerCase()
    const e = ext(nome)
    const item: FolderFile = { name: nome, size: file.size, file }

    // O MIDI ganha do .chart quando a pasta traz os dois: e o formato que os
    // editores exportam por ultimo.
    if (baixo === 'notes.mid' || baixo === 'notes.midi') resultado.chart = item
    else if (baixo === 'notes.chart' && !resultado.chart) resultado.chart = item
    else if (baixo === 'song.ini') resultado.ini = item
    else if (AUDIO_EXT.includes(e)) resultado.audio.push(item)
    else if (IMAGE_EXT.includes(e)) imagens.push(item)
    else if (VIDEO_EXT.includes(e) && !resultado.video) resultado.video = item
    else continue

    // A capa e escolhida depois, entre todas as imagens: contar o tamanho
    // aqui somaria as imagens descartadas ao total do envio.
    if (!IMAGE_EXT.includes(e)) resultado.totalBytes += file.size
  }

  resultado.cover = escolherCapa(imagens)
  if (resultado.cover) resultado.totalBytes += resultado.cover.size

  if (!resultado.chart) {
    resultado.errors.push('Falta o notes.mid ou o notes.chart (o chart da música).')
  }
  if (!resultado.ini) resultado.errors.push('Falta o song.ini (o nome e o artista vêm dele).')
  if (resultado.audio.length === 0) resultado.errors.push('Falta o áudio da música.')

  if (resultado.totalBytes > MAX_UPLOAD_BYTES) {
    const mb = Math.round(resultado.totalBytes / 1048576)
    const teto = Math.round(MAX_UPLOAD_BYTES / 1048576)
    resultado.errors.push(`A pasta tem ${mb} MB; o limite por envio é ${teto} MB.`)
  }

  if (!resultado.cover) resultado.warnings.push('Sem capa: a lista mostra um espaço vazio.')
  if (resultado.video && resultado.video.size > MAX_VIDEO_BYTES) {
    // O video e de longe o arquivo mais pesado. Acima do teto do bucket ele
    // seria recusado no meio do envio, entao fica de fora e a musica sobe.
    const mb = Math.round(resultado.video.size / 1048576)
    const teto = Math.round(MAX_VIDEO_BYTES / 1048576)
    resultado.warnings.push(
      `O vídeo tem ${mb} MB e o limite é ${teto} MB: a música sobe sem ele.`,
    )
    resultado.totalBytes -= resultado.video.size
    resultado.video = null
  }

  resultado.ok = resultado.errors.length === 0
  return resultado
}

/**
 * Qual das imagens da pasta e a capa.
 *
 * Preferencia por NOME (album, cover, artwork...). Sem nenhum nome conhecido,
 * cai na primeira imagem - melhor uma capa errada do que nenhuma.
 */
function escolherCapa(imagens: FolderFile[]): FolderFile | null {
  for (const nome of COVER_NAMES) {
    const achada = imagens.find((img) => baseName(img.name).toLowerCase().startsWith(`${nome}.`))
    if (achada) return achada
  }
  return imagens[0] ?? null
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
