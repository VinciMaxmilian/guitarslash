-- Guitar Slash - leaderboard mundial com totais e filtros
--
-- Rode depois de 0005. Idempotente.
--
-- A view `leaderboard` (migration 0001) responde "quem mandou melhor NESTA
-- musica, neste instrumento, nesta dificuldade". O menu principal precisa da
-- outra pergunta: "quem mandou melhor NO JOGO", somando as musicas, com os
-- mesmos tres filtros opcionais.
--
-- Isso e uma FUNCAO e nao uma view porque os filtros mudam a agregacao. Fazer
-- a soma no navegador exigiria baixar a tabela `scores` inteira - ela cresce
-- uma linha por partida terminada, de todo mundo.
--
-- REGRA DA SOMA: conta o MELHOR placar de cada jogador em cada MUSICA, e nao
-- em cada combinacao. Sem isso, quem repetisse a mesma musica no facil e no
-- expert somaria as duas e ficaria na frente de quem jogou duas musicas no
-- expert - o ranking premiaria repetir, e nao tocar.
--
-- `security invoker` (o padrao de funcao) mantem a RLS de quem consulta: a
-- funcao nao pode virar uma porta lateral para dados que a policy esconde.
-- Hoje `scores` e `profiles` sao de leitura publica, mas se um dia deixarem de
-- ser, isto acompanha sozinho.

create or replace function public.leaderboard_totals(
  p_song text default null,
  p_instrument text default null,
  p_difficulty text default null,
  p_limit int default 50
)
returns table (
  user_id uuid,
  display_name text,
  total_score bigint,
  songs int,
  accuracy real,
  stars int,
  last_played timestamptz
)
language sql
stable
set search_path = public
as $$
  with melhores as (
    -- Melhor LINHA (e nao so o melhor numero) de cada jogador em cada musica:
    -- assim accuracy e estrelas vem da mesma partida que fez o placar.
    select distinct on (s.user_id, s.song_id)
      s.user_id,
      s.song_id,
      s.score,
      s.accuracy,
      s.stars,
      s.created_at
    from public.scores s
    where (p_song is null or s.song_id = p_song)
      and (p_instrument is null or s.instrument = p_instrument)
      and (p_difficulty is null or s.difficulty = p_difficulty)
    order by s.user_id, s.song_id, s.score desc, s.created_at asc
  )
  select
    m.user_id,
    p.display_name,
    sum(m.score)::bigint as total_score,
    count(*)::int as songs,
    avg(m.accuracy)::real as accuracy,
    sum(m.stars)::int as stars,
    max(m.created_at) as last_played
  from melhores m
  join public.profiles p on p.id = m.user_id
  group by m.user_id, p.display_name
  order by total_score desc, songs desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.leaderboard_totals(text, text, text, int) is
  'Ranking geral: soma do melhor placar de cada jogador por musica, com
   filtros opcionais de musica, instrumento e dificuldade.';

grant execute on function public.leaderboard_totals(text, text, text, int)
  to anon, authenticated;

-- A funcao filtra por instrumento e dificuldade antes de agrupar; sem este
-- indice ela varreria `scores` inteira a cada abertura do menu.
create index if not exists scores_totais_idx
  on public.scores (user_id, song_id, score desc);
