# Supabase

Conta, configurações na nuvem, leaderboard e músicas da comunidade.

**Tudo isto é opcional.** Sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, o
jogo roda completo: biblioteca local, singleplayer e multiplayer LAN em modo
host (que precisa funcionar offline). Os itens de nuvem simplesmente não
aparecem.

## 1. Rodar as migrations

No dashboard: **SQL Editor** → cole e execute, nesta ordem:

1. `migrations/0001_auth_and_scores.sql` — perfis, configurações, placares
2. `migrations/0002_community_songs.sql` — músicas da comunidade + bucket
3. `migrations/0003_community_library_view.sql` — view com o nome de quem enviou
4. `migrations/0004_community_hardening.sql` — prefixo preso ao dono, cota real
5. `migrations/0005_community_background_video.sql` — libera o `background.mp4`
6. `migrations/0006_leaderboard_totals.sql` — ranking geral com filtros

Todas são idempotentes: pode rodar de novo sem estragar nada.

A **0006 é obrigatória para o ranking mundial** do menu principal: sem ela a
tela abre vazia, porque a função `leaderboard_totals` não existe.

A **0005 é obrigatória para o vídeo de fundo**. Sem ela o bucket recusa o
arquivo (o mime de vídeo não está na lista e o teto por arquivo é menor que um
vídeo de música inteira), e a música sobe sem fundo — que era o comportamento
antigo.

## 2. Variáveis

**Frontend** (`frontend/.env`, e no Netlify em *Environment variables*):

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable>
```

**Backend** (Vercel e servidor de partidas), para o parse do chart da
comunidade:

```
GUITARSLASH_COMMUNITY_BASE_URL=https://SEU-PROJETO.supabase.co/storage/v1/object/public/community
```

Sem essa variável o endpoint `/api/community/*` responde **503** dizendo
exatamente o que falta, em vez de dar erro obscuro.

> **Use a chave anon/publishable no frontend.** Ela vai embutida no bundle e é
> pública por design — o que protege os dados é a RLS. A `service_role` e a
> `sb_secret_` ignoram **toda** a RLS; no bundle, entregariam o banco a quem
> abrir o DevTools. O código recusa essas chaves e desliga a nuvem, mas não
> conte com isso.

## 3. Segurança: o que as políticas garantem

| Tabela | Leitura | Escrita |
|---|---|---|
| `profiles` | pública (o leaderboard precisa do nome) | só o próprio |
| `player_settings` | **só o próprio** | só o próprio |
| `scores` | pública | insert do próprio; **sem update nem delete** |
| `community_songs` | publicadas + as próprias escondidas | insert/update/delete do próprio |
| bucket `community` | pública | só dentro da pasta `<uid>/` |

Dois pontos que valem destaque:

- **`scores` não tem política de update nem delete.** Placar enviado não se
  reescreve — fecha a porta para "corrigir" um recorde depois.
- **O caminho no Storage começa com o uid de quem envia.** Sem isso, qualquer
  usuário logado sobrescreveria o arquivo de outro.

Há um trigger de **cota de 300 MB por usuário**: o free tier do Storage é 1 GB
inteiro, e sem teto por pessoa um envio grande consome a cota de todos.

## 4. Como o chart da comunidade é lido

O `notes.mid` é parseado **no backend**, não no navegador, buscando do Storage.
O motivo é um só: `backend/app/parsers/midi_parser.py` tem mapa de tempo,
detecção de HOPO, star power e sustain, e está coberto por testes. Uma segunda
implementação em TypeScript divergiria da primeira — e chart lido diferente
entre jogadores é dessincronia na partida.

Há um teste que trava isso: `test_chart_e_igual_ao_da_biblioteca_local` compara
nota por nota o chart vindo da comunidade com o da biblioteca local.

O endpoint recebe um **caminho** dentro do bucket, nunca uma URL. Aceitar URL
arbitrária e buscar do servidor seria SSRF — daria para usar a function como
proxy para a rede interna do provedor.

## 5. Confirmação de e-mail

Se **Authentication → Providers → Email → Confirm email** estiver ligado, o
cadastro não entra direto; a tela avisa para verificar o e-mail. Para testar
mais rápido, desligue durante o desenvolvimento.
