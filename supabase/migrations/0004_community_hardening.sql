-- Guitar Slash - endurecimento da comunidade
--
-- Rode depois de 0003. Idempotente.
--
-- Corrige dois furos em que o servidor confiava em dado que o CLIENTE escolhe.
-- Em RLS isso importa: a anon key e publica, entao qualquer pessoa pode montar
-- o insert que quiser com as ferramentas do proprio navegador. Tudo que
-- protege recurso precisa ser calculado no banco.

-- ======================================== 1. prefixo preso ao dono
--
-- FURO: `storage_prefix` vinha do cliente, e a policy so checava
-- `uploader_id = auth.uid()`. Dava para registrar uma musica apontando para a
-- pasta de OUTRO usuario e assinar como sua.
--
-- Agora o prefixo tem de comecar com o uid de quem envia - a mesma regra que a
-- policy do Storage ja aplicava na escrita dos arquivos.

alter table public.community_songs
  drop constraint if exists prefixo_pertence_ao_dono;

alter table public.community_songs
  add constraint prefixo_pertence_ao_dono
  check (
    uploader_id is null
    or storage_prefix like uploader_id::text || '/%'
  );

-- ======================================== 2. cota medida de verdade
--
-- FURO: o trigger somava `total_bytes`, que vinha do cliente. Dava para subir
-- 500 MB de arquivo e declarar 1 byte, furando a cota inteira.
--
-- Agora o tamanho e lido de `storage.objects`, que so o Storage escreve.

create or replace function public.community_bytes_used(dono uuid)
returns bigint
language sql
security definer
set search_path = public, storage
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'community'
    and (storage.foldername(o.name))[1] = dono::text
$$;

comment on function public.community_bytes_used(uuid) is
  'Bytes que o usuario realmente ocupa no bucket. Lido de storage.objects, que
   o cliente nao escreve - diferente de community_songs.total_bytes, que vem do
   navegador e serve apenas para exibicao.';

create or replace function public.community_quota_check()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  usado bigint;
  limite bigint := 300 * 1024 * 1024; -- 300 MB por usuario
begin
  if new.uploader_id is null then
    return new;
  end if;

  -- Tamanho REAL no bucket, e nao o que o cliente declarou.
  usado := public.community_bytes_used(new.uploader_id);

  if usado > limite then
    raise exception
      'cota de envio excedida: % MB de % MB ocupados no armazenamento',
      round(usado / 1048576.0), round(limite / 1048576.0);
  end if;

  -- Corrige o valor exibido, para a interface nao mostrar o numero do cliente.
  new.total_bytes := usado;
  return new;
end;
$$;

-- Vale tambem no update: reenviar a propria musica passa por aqui.
drop trigger if exists community_songs_quota on public.community_songs;
create trigger community_songs_quota
  before insert or update on public.community_songs
  for each row execute function public.community_quota_check();

-- ======================================== 3. teto por arquivo
--
-- A cota acima bloqueia o REGISTRO, mas os arquivos ja subiram. Um teto por
-- arquivo no bucket limita o estrago antes de chegar la.
update storage.buckets
set
  file_size_limit = 25 * 1024 * 1024,  -- 25 MB por arquivo
  allowed_mime_types = array[
    'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp4', 'audio/wav',
    'audio/x-wav', 'audio/flac', 'audio/midi', 'audio/x-midi',
    'image/jpeg', 'image/png', 'image/webp',
    'application/octet-stream',  -- notes.mid costuma vir sem tipo
    'text/plain'                 -- song.ini
  ]
where id = 'community';
