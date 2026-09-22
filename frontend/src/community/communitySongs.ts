import { supabase } from '../lib/supabase'
import type { InstrumentInfo, SongSummary } from '../api/types'
import {
  contentTypeFor,
  inspectFolder,
  isMidi,
  uploadBody,
  parseIni,
  slugify,
  type InspectedFolder,
} from './songFolder'

/**
 * Musicas da comunidade: envio e listagem.
 *
 * Decisao que amarra o resto: a musica da comunidade e convertida para o MESMO
 * `SongSummary` da biblioteca local. Assim a lista, a selecao de instrumento, a
 * gameplay e o resultado funcionam sem saber de onde a musica veio - o unico
 * ponto que diferencia e de onde vem o chart.
 */

export const BUCKET = 'community'

export interface CommunityRow {
  id: string
  slug: string
  title: string
  artist: string
  album: string | null
  charter: string | null
  year: string | null
  genre: string | null
  duration: number
  delay: number
  preview_start: number
  storage_prefix: string
  files: Record<string, string>
  /** Vem do `instrument_summary` do parser no backend, gravado no envio. */
  instruments: Record<string, InstrumentInfo>
  total_bytes: number
  uploader_id: string | null
  /** Resolvido pela view `community_library` (migration 0003). */
  uploader_name: string | null
  created_at: string
}

function publicUrl(path: string): string | null {
  if (!supabase || !path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Linha do banco -> `SongSummary`.
 *
 * `chartPath` e o unico campo a mais: e o caminho do notes.mid no bucket, que
 * o backend usa para parsear o chart (o parser e o mesmo da biblioteca local,
 * de proposito - dois parsers divergiriam e dessincronizariam a partida).
 */
export function toSongSummary(row: CommunityRow): SongSummary {
  const audio: Record<string, string> = {}
  for (const [stem, caminho] of Object.entries(row.files ?? {})) {
    if (stem === 'chart' || stem === 'cover' || stem === 'ini' || stem === 'video') continue
    const url = publicUrl(`${row.storage_prefix}/${caminho}`)
    if (url) audio[stem] = url
  }

  const capa = row.files?.cover ? publicUrl(`${row.storage_prefix}/${row.files.cover}`) : null
  const video = row.files?.video ? publicUrl(`${row.storage_prefix}/${row.files.video}`) : null

  return {
    id: row.slug,
    title: row.title,
    artist: row.artist || 'Artista desconhecido',
    album: row.album ?? null,
    year: row.year ?? null,
    genre: row.genre ?? null,
    charter: row.charter ?? null,
    duration: row.duration,
    previewStart: row.preview_start,
    delay: row.delay,
    instruments: row.instruments ?? {},
    assets: {
      cover: capa,
      backgroundVideo: video,
      chart: null,
      audio,
    },
    missing: [],
    hasCover: capa !== null,
    hasBackgroundVideo: video !== null,
    source: 'community',
    chartPath: row.files?.chart ? `${row.storage_prefix}/${row.files.chart}` : undefined,
    uploaderId: row.uploader_id ?? undefined,
    uploaderName: row.uploader_name,
    createdAt: row.created_at,
  }
}

export async function fetchCommunitySongs(limit = 200): Promise<SongSummary[]> {
  if (!supabase) return []
  // A VIEW, e nao a tabela: ela ja traz o nome de quem enviou (a tabela tem
  // so o uuid, e `auth.users` nunca deve ser exposta ao cliente).
  const { data, error } = await supabase
    .from('community_library')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[guitarslash] nao foi possivel listar a comunidade:', error.message)
    return []
  }
  return (data ?? []).map((row) => toSongSummary(row as CommunityRow))
}

/**
 * Uma musica da comunidade pelo slug, ou null se nao existir.
 *
 * Existe para o multiplayer: a sala trafega so o ID da musica, e o ID de uma
 * musica da comunidade e o slug - que a biblioteca LOCAL do backend nao
 * conhece. Sem este caminho, quem recebesse o BEGIN_LOAD de uma musica da
 * comunidade tentaria resolve-la em /api/songs/<slug>, levaria 404 e ficaria
 * parado no "baixando a musica do host".
 */
export async function fetchCommunitySong(slug: string): Promise<SongSummary | null> {
  if (!supabase || !slug) return null

  const { data, error } = await supabase
    .from('community_library')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return null
  return toSongSummary(data as CommunityRow)
}

export interface UploadProgress {
  /** Passo atual, legivel para a interface. */
  step: string
  done: number
  total: number
}

export interface UploadResult {
  ok: boolean
  error?: string
  slug?: string
}

export interface DuplicateCheck {
  /** Ja existe na comunidade. */
  exists: boolean
  /** Quem enviou, quando existe. */
  uploaderName?: string | null
  /** Data do envio existente. */
  createdAt?: string
  /** Enviada por voce mesmo: reenviar substitui. */
  mine?: boolean
}

/**
 * A musica ja esta na comunidade?
 *
 * Chamado ANTES de subir arquivo. A restricao `unique` do slug pegaria isso de
 * qualquer forma, mas so DEPOIS de gastar a cota e a banda do jogador - e os
 * arquivos ficariam orfaos no bucket, porque o upload e a insercao sao passos
 * separados.
 */
export async function checkDuplicate(
  slug: string,
  userId: string | null,
): Promise<DuplicateCheck> {
  if (!supabase || !slug) return { exists: false }

  const { data, error } = await supabase
    .from('community_library')
    .select('uploader_id, uploader_name, created_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return { exists: false }
  return {
    exists: true,
    uploaderName: data.uploader_name,
    createdAt: data.created_at,
    mine: Boolean(userId) && data.uploader_id === userId,
  }
}

/**
 * Envia a pasta e registra a musica.
 *
 * Ordem importa: os ARQUIVOS vao primeiro, a LINHA depois. Se invertessemos, um
 * upload falho deixaria uma musica listada e injogavel.
 */
export async function uploadSong(
  userId: string,
  arquivos: readonly File[],
  onProgress: (p: UploadProgress) => void,
  inspectChart: (path: string) => Promise<{ instruments: Record<string, unknown>; length: number }>,
): Promise<UploadResult> {
  if (!supabase) return { ok: false, error: 'Nuvem não configurada.' }

  const pasta: InspectedFolder = inspectFolder(arquivos)
  if (!pasta.ok) return { ok: false, error: pasta.errors.join(' ') }

  // Pasta com `notes.chart` renomeado para `notes.mid` e comum. O backend le
  // os dois formatos, mas escolhe o parser pela EXTENSAO do objeto no bucket:
  // subir o texto com nome de .mid faria o parser errado ser chamado. O nome
  // e corrigido aqui, olhando o cabecalho e nao o nome.
  const chartEhMidi = await isMidi(pasta.chart!.file)
  const nomeDoChart = chartEhMidi ? 'notes.mid' : 'notes.chart'

  const iniTexto = await pasta.ini!.file.text()
  const meta = parseIni(iniTexto)
  const titulo = meta.title.trim() || pasta.chart!.name
  const slug = slugify(meta.artist, titulo)

  // Checa ANTES de subir: a restricao unique pegaria depois, mas ai a cota e a
  // banda ja teriam sido gastas e os arquivos ficariam orfaos no bucket.
  const duplicada = await checkDuplicate(slug, userId)
  if (duplicada.exists && !duplicada.mine) {
    const autor = duplicada.uploaderName ?? 'outro jogador'
    return { ok: false, error: `Esta música já foi enviada por ${autor}.` }
  }

  // O caminho comeca com o uid: e o que a policy do Storage exige.
  const prefix = `${userId}/${slug}`

  const aEnviar: { logico: string; arquivo: File; nome?: string }[] = [
    { logico: 'chart', arquivo: pasta.chart!.file, nome: nomeDoChart },
    { logico: 'ini', arquivo: pasta.ini!.file },
    ...pasta.audio.map((a) => ({ logico: stemName(a.name), arquivo: a.file })),
  ]
  if (pasta.cover) aEnviar.push({ logico: 'cover', arquivo: pasta.cover.file })
  // O video e opcional e pesado, mas sem ele a musica joga contra um fundo
  // preto - quem monta a pasta com background.mp4 espera ve-lo.
  if (pasta.video) aEnviar.push({ logico: 'video', arquivo: pasta.video.file })

  const files: Record<string, string> = {}
  let enviados = 0

  for (const { logico, arquivo, nome: forcado } of aEnviar) {
    const nome = forcado ?? baseName(arquivo.name)
    onProgress({ step: `Enviando ${nome}`, done: enviados, total: aEnviar.length + 1 })

    const { error } = await supabase.storage
      .from(BUCKET)
      // O tipo vai no CORPO, e nao na opcao `contentType`: com um File a
      // biblioteca monta FormData e ignora a opcao, e o servidor le o tipo
      // que o navegador pos no arquivo. Ver `uploadBody`.
      .upload(`${prefix}/${nome}`, uploadBody(arquivo, nome), {
        upsert: true,
        contentType: contentTypeFor(nome),
      })

    if (error) return { ok: false, error: `Falha ao enviar ${nome}: ${error.message}` }
    files[logico] = nome
    enviados += 1
  }

  // Instrumentos vem do parser do backend, uma vez so: a lista nao pode
  // parsear MIDI a cada abertura.
  onProgress({ step: 'Lendo o chart', done: enviados, total: aEnviar.length + 1 })
  let instruments: Record<string, unknown> = {}
  let length = meta.duration
  try {
    const inspecao = await inspectChart(`${prefix}/${files.chart}`)
    instruments = inspecao.instruments
    if (!length) length = inspecao.length
  } catch (erro) {
    return {
      ok: false,
      error: `O chart não pôde ser lido: ${erro instanceof Error ? erro.message : erro}`,
    }
  }

  if (!Object.values(instruments).some((i) => (i as { supported?: boolean })?.supported)) {
    return { ok: false, error: 'O chart não tem nenhum instrumento que o jogo saiba tocar.' }
  }

  // `upsert` por slug: reenviar a PROPRIA musica atualiza, em vez de falhar na
  // restricao unique. Reenvio de outro jogador ja foi barrado acima.
  const { error: erroLinha } = await supabase.from('community_songs').upsert({
    uploader_id: userId,
    slug,
    title: titulo.slice(0, 200),
    artist: meta.artist.slice(0, 200),
    album: meta.album,
    charter: meta.charter,
    year: meta.year,
    genre: meta.genre,
    duration: length,
    delay: meta.delay,
    preview_start: meta.previewStart,
    storage_prefix: prefix,
    files,
    instruments,
    total_bytes: pasta.totalBytes,
  }, { onConflict: 'slug' })

  if (erroLinha) {
    // Duplicata e cota tem mensagem propria: "erro 23505" nao ajuda ninguem.
    if (erroLinha.message.includes('duplicate key')) {
      return { ok: false, error: 'Esta música já está na biblioteca da comunidade.' }
    }
    if (erroLinha.message.includes('cota de envio')) {
      return { ok: false, error: 'Você atingiu sua cota de envio.' }
    }
    return { ok: false, error: erroLinha.message }
  }

  onProgress({ step: 'Pronto', done: aEnviar.length + 1, total: aEnviar.length + 1 })
  return { ok: true, slug }
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** "guitar.opus" -> "guitar". E a chave que o AudioEngine usa como stem. */
function stemName(nome: string): string {
  const base = baseName(nome)
  const ponto = base.lastIndexOf('.')
  return (ponto < 0 ? base : base.slice(0, ponto)).toLowerCase()
}
