-- Guitar Slash - musicas da comunidade
--
-- Rode depois de 0001. Tambem e idempotente.
--
-- Modelo: os ARQUIVOS vao para o Storage (bucket `community`), e esta tabela
-- guarda os metadados mais o mapa de arquivos. O jogo nunca lista o bucket -
-- ele le esta tabela, que e indexavel e tem RLS.

-- ================================================= tabela de musicas

create table if not exists public.community_songs (
  id uuid primary key default gen_random_uuid(),
  -- Quem enviou. `on delete set null` preserva a musica se a conta sair: a
  -- biblioteca da comunidade nao deve sumir com o cadastro.
  uploader_id uuid references auth.users (id) on delete set null,

  -- Slug estavel usado pelo jogo como songId (mesmo formato da pasta local).
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,120}$'),

  title text not null check (char_length(title) between 1 and 200),
  artist text not null default '' check (char_length(artist) <= 200),
  album text default '',
  charter text default '',
  year text default '',
  genre text default '',

  duration real not null default 0 check (duration >= 0),
  delay real not null default 0,
  preview_start real not null default 0,

  -- Prefixo no bucket: community/<storage_prefix>/...
  storage_prefix text not null unique,
  -- nome logico -> caminho no bucket. Ex: {"chart":"notes.mid","song":"song.opus"}
  files jsonb not null default '{}'::jsonb,
  -- instrumento -> { difficulties: [...], noteCount: n }, vindo do parser.
  instruments jsonb not null default '{}'::jsonb,

  total_bytes bigint not null default 0 check (total_bytes >= 0),

  -- Moderacao simples: entra publicada, mas da para esconder sem apagar.
  status text not null default 'published'
    check (status in ('published', 'hidden', 'flagged')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.community_songs is
  'Metadados das musicas enviadas pela comunidade. Os arquivos ficam no
   Storage; o jogo le esta tabela e nunca lista o bucket.';

create index if not exists community_songs_busca_idx
  on public.community_songs (status, created_at desc);

create index if not exists community_songs_uploader_idx
  on public.community_songs (uploader_id, created_at desc);

-- Busca por titulo/artista sem precisar de extensao.
create index if not exists community_songs_titulo_idx
  on public.community_songs (lower(title));
create index if not exists community_songs_artista_idx
  on public.community_songs (lower(artist));

alter table public.community_songs enable row level security;

-- Todos veem as publicadas. Quem enviou ve tambem as proprias escondidas,
-- senao ela desapareceria da vista do autor sem explicacao.
drop policy if exists "publicadas sao visiveis" on public.community_songs;
create policy "publicadas sao visiveis"
  on public.community_songs for select
  using (status = 'published' or uploader_id = auth.uid());

-- Enviar exige conta: sem isso nao ha a quem responsabilizar por conteudo.
drop policy if exists "envia em nome proprio" on public.community_songs;
create policy "envia em nome proprio"
  on public.community_songs for insert
  with check (auth.uid() is not null and uploader_id = auth.uid());

drop policy if exists "edita o proprio envio" on public.community_songs;
create policy "edita o proprio envio"
  on public.community_songs for update
  using (uploader_id = auth.uid())
  with check (uploader_id = auth.uid());

drop policy if exists "remove o proprio envio" on public.community_songs;
create policy "remove o proprio envio"
  on public.community_songs for delete
  using (uploader_id = auth.uid());

drop trigger if exists community_songs_touch on public.community_songs;
create trigger community_songs_touch
  before update on public.community_songs
  for each row execute function public.touch_updated_at();

-- ==================================================== bucket do Storage

-- Publico para leitura: o navegador baixa o audio direto do CDN, sem passar
-- token. Quem controla o que existe e a tabela acima.
insert into storage.buckets (id, name, public)
values ('community', 'community', true)
on conflict (id) do update set public = true;

-- Leitura publica.
drop policy if exists "community leitura publica" on storage.objects;
create policy "community leitura publica"
  on storage.objects for select
  using (bucket_id = 'community');

-- Escrita apenas dentro da PROPRIA pasta: o caminho comeca com o uid de quem
-- envia. Sem isso, qualquer usuario logado sobrescreveria o arquivo de outro.
drop policy if exists "community escreve na propria pasta" on storage.objects;
create policy "community escreve na propria pasta"
  on storage.objects for insert
  with check (
    bucket_id = 'community'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "community atualiza a propria pasta" on storage.objects;
create policy "community atualiza a propria pasta"
  on storage.objects for update
  using (
    bucket_id = 'community'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "community apaga a propria pasta" on storage.objects;
create policy "community apaga a propria pasta"
  on storage.objects for delete
  using (
    bucket_id = 'community'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ==================================== cota por usuario (anti-abuso)

-- 1 GB e o free tier inteiro do Storage. Sem teto por usuario, um envio grande
-- consome a cota de todos.
create or replace function public.community_quota_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  usado bigint;
  limite bigint := 300 * 1024 * 1024; -- 300 MB por usuario
begin
  select coalesce(sum(total_bytes), 0) into usado
  from public.community_songs
  where uploader_id = new.uploader_id;

  if usado + new.total_bytes > limite then
    raise exception 'cota de envio excedida: % MB de % MB',
      round((usado + new.total_bytes) / 1048576.0), round(limite / 1048576.0);
  end if;

  return new;
end;
$$;

drop trigger if exists community_songs_quota on public.community_songs;
create trigger community_songs_quota
  before insert on public.community_songs
  for each row execute function public.community_quota_check();
