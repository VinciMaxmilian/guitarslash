-- Guitar Slash - video de fundo nas musicas da comunidade
--
-- Rode depois de 0004. Idempotente.
--
-- A pasta no formato Clone Hero costuma trazer um `background.mp4`. Ate aqui o
-- envio descartava esse arquivo, e a musica da comunidade jogava contra fundo
-- preto enquanto a mesma pasta na biblioteca local mostrava o video.
--
-- Duas coisas impediam o envio no lado do banco:
--
--   1. `allowed_mime_types` do bucket nao listava video, entao o Storage
--      recusava o upload;
--   2. `file_size_limit` era 25 MB, e video de musica inteira passa disso.
--
-- O teto por arquivo sobe para 64 MB SO porque a cota de 300 MB por usuario
-- (community_quota_check, migration 0004) continua sendo o limite real: subir
-- o teto por arquivo nao aumenta o que cada pessoa pode ocupar, apenas permite
-- que um dos arquivos seja grande. O cliente tambem barra video acima de 64 MB
-- antes do envio (MAX_VIDEO_BYTES em frontend/src/community/songFolder.ts),
-- para nao gastar banda com um upload que o Storage recusaria no meio.

update storage.buckets
set
  file_size_limit = 64 * 1024 * 1024,
  allowed_mime_types = array[
    'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp4', 'audio/wav',
    'audio/x-wav', 'audio/flac', 'audio/midi', 'audio/x-midi',
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm',
    'application/octet-stream',  -- notes.mid costuma vir sem tipo
    'text/plain'                 -- song.ini
  ]
where id = 'community';
