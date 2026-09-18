import { supabase } from './supabase'
import type { PlayerSnapshot } from '../game/types'

/**
 * Envio de placar e leitura do leaderboard.
 *
 * Nada aqui lanca excecao para cima: falhar ao enviar placar nao pode estragar
 * a tela de resultado. O jogador acabou de terminar a musica - o numero dele
 * esta na tela de qualquer forma.
 */

export interface LeaderboardRow {
  user_id: string
  display_name: string
  score: number
  accuracy: number
  max_combo: number
  stars: number
  created_at: string
}

export interface ScoreTarget {
  songId: string
  instrument: string
  difficulty: string
}

/** Constroi a linha de `scores` a partir do snapshot do fim da musica. */
export function scoreRow(
  userId: string,
  target: ScoreTarget,
  player: PlayerSnapshot,
): Record<string, unknown> {
  return {
    user_id: userId,
    song_id: target.songId,
    instrument: target.instrument,
    difficulty: target.difficulty,
    score: Math.max(0, Math.round(player.score)),
    // A coluna tem check 0..1; estourar aqui viraria erro do banco.
    accuracy: Math.min(1, Math.max(0, player.accuracy)),
    max_combo: Math.max(0, Math.round(player.maxCombo)),
    notes_hit: Math.max(0, Math.round(player.notesHit)),
    notes_missed: Math.max(0, Math.round(player.notesMissed)),
    stars: Math.min(5, Math.max(0, Math.round(player.stars))),
  }
}

/** @returns true se o placar foi gravado. */
export async function submitScore(
  userId: string,
  target: ScoreTarget,
  player: PlayerSnapshot,
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('scores').insert(scoreRow(userId, target, player))
  if (error) {
    console.warn('[guitarslash] nao foi possivel enviar o placar:', error.message)
    return false
  }
  return true
}

/** Melhores placares daquela combinacao, do maior para o menor. */
export async function fetchLeaderboard(
  target: ScoreTarget,
  limit = 10,
): Promise<LeaderboardRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('leaderboard')
    .select('user_id, display_name, score, accuracy, max_combo, stars, created_at')
    .eq('song_id', target.songId)
    .eq('instrument', target.instrument)
    .eq('difficulty', target.difficulty)
    .order('score', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[guitarslash] nao foi possivel ler o leaderboard:', error.message)
    return []
  }
  return (data ?? []) as LeaderboardRow[]
}
