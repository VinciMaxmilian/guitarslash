-- Guitar Slash - autor visivel na biblioteca da comunidade
--
-- Rode depois de 0002. Idempotente.
--
-- Problema: `community_songs.uploader_id` aponta para `auth.users`, que nunca
-- deve ser exposta ao cliente. O nome publico do jogador esta em `profiles`.
-- Sem um join, a lista mostraria um uuid - ou nada.
--
-- A view resolve isso e mantem a RLS: `security_invoker` faz a view rodar com
-- os poderes de QUEM CONSULTA, e nao do dono. Assim a politica da tabela base
-- (publicadas + as proprias escondidas) continua valendo.

drop view if exists public.community_library;
create view public.community_library
with (security_invoker = true)
as
select
  cs.id,
  cs.slug,
  cs.title,
  cs.artist,
  cs.album,
  cs.charter,
  cs.year,
  cs.genre,
  cs.duration,
  cs.delay,
  cs.preview_start,
  cs.storage_prefix,
  cs.files,
  cs.instruments,
  cs.total_bytes,
  cs.status,
  cs.created_at,
  cs.uploader_id,
  -- `left join`: conta apagada deixa `uploader_id` nulo (o `on delete set
  -- null` de 0002 preserva a musica). A lista mostra "anonimo" em vez de
  -- esconder a musica.
  p.display_name as uploader_name
from public.community_songs cs
left join public.profiles p on p.id = cs.uploader_id;

comment on view public.community_library is
  'community_songs com o nome de quem enviou ja resolvido. E o que a lista da
   comunidade consulta; a escrita continua indo para a tabela base.';
