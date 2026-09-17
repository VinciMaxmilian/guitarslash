# Deploy do Guitar Slash

Três alvos, com responsabilidades diferentes:

| Alvo | O que roda lá | Precisa de internet |
|---|---|---|
| **Netlify** | frontend (SPA do Vite) | sim |
| **Vercel** | backend (FastAPI como Serverless Function) | sim |
| **Modo host** | backend + frontend na mesma origem, na LAN | **não** |

O **multiplayer LAN só funciona no modo host**. Netlify e Vercel servem o
singleplayer e a biblioteca pública. Isso não é limitação da implementação, é
consequência da plataforma: Serverless Function não mantém conexão WebSocket
aberta, e uma página servida por HTTPS não pode abrir `ws://` para um IP da
rede local (mixed content bloqueado pelo navegador).

Faça na ordem: **Vercel primeiro** (o Netlify precisa da URL dela).

---

## Antes de começar

```bash
git status                  # trabalho commitado
python main.py test         # 97 testes do backend
cd frontend && npm test     # 91 testes do frontend
cd frontend && npm run build   # o build tem que passar localmente
```

Se `npm run build` falha na sua máquina, vai falhar no Netlify pelo mesmo
motivo: o script roda `tsc --noEmit` antes do Vite.

---

## Parte 1 — Backend na Vercel

### 1.1 O que já está no repositório

| Arquivo | Para quê |
|---|---|
| `api/index.py` | entrypoint; exporta o app ASGI que a Vercel detecta |
| `vercel.json` | `maxDuration`, memória e rewrite de tudo para a function |
| `requirements.txt` | dependências de runtime |
| `.python-version` | fixa o Python em 3.12 |
| `.vercelignore` | **impede que `songs/` (143 MB) entre no bundle** |

O `.vercelignore` não é detalhe: o limite de uma Serverless Function é de
250 MB descomprimidos. Sem ele o deploy sobe a biblioteca inteira de áudio e
vídeo e quebra — ou fica com cold start absurdo.

### 1.2 Criar o projeto

**Pela interface**

1. <https://vercel.com/new> → importe o repositório.
2. **Framework Preset**: `Other`.
3. **Root Directory**: deixe a raiz (`./`).
4. **Build Command** e **Output Directory**: deixe vazios — não há build; a
   Vercel só empacota a function Python.
5. Não faça deploy ainda: configure as variáveis primeiro (passo 1.3).

**Pela CLI**

```bash
npm i -g vercel
vercel login
vercel link          # associa a pasta ao projeto
```

### 1.3 Variáveis de ambiente

Em **Settings → Environment Variables**, ambiente *Production*:

| Variável | Valor | Obrigatória |
|---|---|---|
| `GUITARSLASH_STORAGE` | `remote` | **sim** |
| `GUITARSLASH_ASSETS_BASE_URL` | URL pública do seu bucket/CDN | **sim** |
| `GUITARSLASH_ALLOWED_ORIGINS` | `https://SEU-SITE.netlify.app` | **sim** |
| `GUITARSLASH_CACHE_DIR` | deixe **vazio** | não |

Detalhes que costumam morder:

- `GUITARSLASH_STORAGE=local` **não funciona em produção**. O filesystem da
  function é efêmero e `songs/` foi excluída pelo `.vercelignore`. Com
  `local` a biblioteca aparece vazia.
- `GUITARSLASH_ALLOWED_ORIGINS` é lista separada por vírgula, **sem barra no
  final**: `https://meu-site.netlify.app`, não `https://meu-site.netlify.app/`.
  Errar aqui dá erro de CORS no navegador e biblioteca vazia na tela.
- `GUITARSLASH_CACHE_DIR` vazio cai no temp do sistema (`/tmp`), o único
  lugar gravável na Vercel. Apontar para outro caminho derruba a function.
- Você só terá a URL do Netlify depois da Parte 2. Coloque um valor
  provisório agora e **volte para corrigir** — a variável só passa a valer no
  deploy seguinte.

### 1.4 Publicar a biblioteca no bucket

A function não faz parse de MIDI em produção: ela lê JSON pronto. Gere o
pacote e suba para o bucket.

```bash
python main.py build-index --out dist-songs --copy-assets
```

Isso produz:

```
dist-songs/index.json
dist-songs/charts/<song_id>/<instrumento>/<dificuldade>.json
dist-songs/songs/<song_id>/<arquivos de áudio, vídeo e capa>
```

Suba **o conteúdo** de `dist-songs/` para a raiz do bucket (S3, Cloudflare R2,
Supabase Storage, Vercel Blob — qualquer um serve). `GUITARSLASH_ASSETS_BASE_URL`
aponta para essa raiz, de forma que `index.json` fique em
`<BASE_URL>/index.json`.

Exemplo com R2/S3:

```bash
aws s3 sync dist-songs/ s3://meu-bucket/ --delete
```

O bucket precisa de duas coisas, senão o jogo não funciona:

1. **CORS** liberado para o domínio do Netlify. Sem isso o navegador recusa
   baixar o áudio.
2. **Range requests** (`Accept-Ranges: bytes`). Sem isso não há seek de áudio
   nem de vídeo, e o `VideoEngine` não consegue corrigir sincronia.

Sempre que adicionar música, rode `build-index` de novo e re-sincronize. O
deploy da Vercel não precisa ser refeito.

### 1.5 Deploy e verificação

```bash
vercel --prod
```

Confira, trocando pela sua URL:

```bash
curl https://SEU-PROJETO.vercel.app/api/health
# {"status":"ok","storage":"remote","songsDir":null}

curl https://SEU-PROJETO.vercel.app/api/songs | head -c 300
# count > 0 e "errors": []
```

Leitura do resultado:

- `"storage":"local"` → `GUITARSLASH_STORAGE` não chegou. Confira o ambiente
  (Production x Preview) e redeploye.
- `"count":0` com erro em `errors` → o `index.json` não está acessível na
  `ASSETS_BASE_URL`. Abra `<BASE_URL>/index.json` no navegador.
- `"songsDir"` com caminho → ainda está em modo local.

Guarde a URL: ela é o `VITE_API_URL` da Parte 2.

---

## Parte 2 — Frontend no Netlify

### 2.1 Criar o site

1. <https://app.netlify.com/start> → importe o repositório.
2. O `netlify.toml` já define `base`, `command` e `publish`. **Não
   sobrescreva** esses campos na interface.

Para referência, é o que o arquivo declara:

| Campo | Valor |
|---|---|
| Base directory | `frontend` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` (relativo ao base, ou seja `frontend/dist`) |

### 2.2 Variável de ambiente

**Site configuration → Environment variables**:

| Variável | Valor |
|---|---|
| `VITE_API_URL` | `https://SEU-PROJETO.vercel.app` |

Três coisas importantes:

- Sem barra no final.
- É lida em **build time**, não em runtime. Mudar o valor exige **novo
  deploy** — "Clear cache and deploy site".
- Se ficar vazia, o frontend chama a própria origem do Netlify, onde não
  existe backend: a biblioteca aparece vazia.

### 2.3 Deploy e verificação

Empurre para a branch principal, ou:

```bash
npm i -g netlify-cli
netlify deploy --prod
```

Abra o site e confirme:

1. A lista de músicas carrega.
2. Uma música toca do começo ao fim.
3. **MULTIPLAYER está desabilitado no menu** — é o comportamento correto: não
   há host de LAN nesse endereço.
4. O console do navegador não tem erro de CORS.

### 2.4 Fechar o ciclo do CORS

Agora que você tem a URL definitiva do Netlify, volte à Vercel e ajuste
`GUITARSLASH_ALLOWED_ORIGINS` para ela. **Redeploye a Vercel** — a variável só
vale a partir do próximo deploy.

Se usa deploy previews do Netlify e quer que funcionem, inclua o padrão do
site também:

```
https://meu-site.netlify.app,https://deploy-preview-1--meu-site.netlify.app
```

O `CORSMiddleware` compara a origem exata: não aceita curinga em subdomínio.

---

## Parte 3 — Modo host (multiplayer LAN)

Não é um terceiro deploy: é o mesmo backend rodando na máquina de um jogador,
servindo também o frontend já buildado. Não passa por Netlify nem por Vercel,
não precisa de internet e não precisa de storage remoto — usa `songs/` do
disco do host.

### 3.1 Na máquina do host

```bash
# uma vez
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..

# a cada partida
python main.py host --port 8000
```

O banner mostra o endereço da LAN:

```
  GUITAR SLASH - MODO HOST
  --------------------------------------------
  Nesta maquina:   http://localhost:8000
  Na rede local:   http://192.168.0.42:8000
  Biblioteca:      C:\...\guitarslash\songs
```

### 3.2 Nas outras máquinas

Abrir `http://192.168.0.42:8000` no navegador. Nada para instalar.

O `frontend/dist` **não precisa ser rebuildado** para o modo host, mesmo que
tenha sido buildado para o Netlify com `VITE_API_URL` apontando para a Vercel.
O backend em modo host injeta `window.__GUITARSLASH_HOST__` no `index.html`
que serve, e o frontend passa a ignorar `VITE_API_URL` e usar a própria
origem. Um build serve os dois cenários.

### 3.3 Checklist da partida

- O firewall do Windows pede autorização na primeira execução — **libere na
  rede privada**. É a causa nº 1 de "os outros não conseguem abrir".
- Todos na **mesma rede**. Wi-Fi de visitante costuma isolar clientes entre si.
- **Só o host escolhe a música e o modo.** O host é o primeiro que entrou; se
  ele sair, o próximo assume automaticamente.
- Máximo de 4 jogadores. O quinto recebe `ROOM_FULL` com mensagem clara.
- Quem entra com a partida rolando entra como **espectador** e joga na música
  seguinte.
- **Jogando na mesma sala física: usem fones**, ou deixem o volume alto só no
  host. Duas máquinas tocando a mesma música com alguns ms de diferença viram
  eco audível. O lobby avisa isso na tela.

### 3.4 Por que o multiplayer não passa pela Vercel

Está documentado no código (`frontend/src/game/hostMode.ts`), mas vale repetir:

1. Serverless Function não mantém conexão WebSocket aberta, e uma partida
   precisa de estado vivo e broadcast.
2. Página em HTTPS não abre `ws://` para IP da LAN — o navegador bloqueia como
   mixed content.

Por isso o botão MULTIPLAYER fica desabilitado no site público, com tooltip
explicando. Não é bug.

---

## Ambiente de desenvolvimento

Dois processos:

```bash
# terminal 1 — backend
python main.py runserver

# terminal 2 — frontend
cd frontend && npm run dev        # http://localhost:5173
```

O `vite.config.ts` já faz proxy de `/api` e `/ws` para `localhost:8000`, então
o multiplayer funciona em dev sem modo host. Abra duas abas para testar com
dois jogadores.

Variáveis locais: copie `.env.example` para `.env` (backend) e
`frontend/.env.example` para `frontend/.env` (frontend). Em dev deixe
`VITE_API_URL` vazio para usar o proxy.

---

## Diagnóstico rápido

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Biblioteca vazia no Netlify | `VITE_API_URL` vazia ou errada | corrigir e **rebuildar** (build time) |
| Erro de CORS no console | `GUITARSLASH_ALLOWED_ORIGINS` sem o domínio exato | ajustar (sem barra final) e redeployar a Vercel |
| `/api/health` diz `"storage":"local"` | variável não chegou ao ambiente Production | conferir em Settings e redeployar |
| `"count":0` e `errors` preenchido | `index.json` inacessível | abrir `<BASE_URL>/index.json` no navegador |
| Deploy da Vercel estoura o tamanho | `.vercelignore` ausente ou alterado | confirmar que `songs/` está listada |
| Áudio não dá seek | bucket sem Range requests | habilitar no storage |
| Vídeo não carrega | bucket sem CORS | liberar o domínio do frontend |
| MULTIPLAYER desabilitado no site | **correto** | usar o modo host |
| Outras máquinas não abrem o host | firewall ou rede diferente | liberar na rede privada |
| Partida não começa | alguém não está pronto, ou download travado | o lobby mostra o progresso de cada um; há timeout de 90 s |
| Build do Netlify falha em `tsc` | erro de tipo | `npm run typecheck` local mostra o mesmo |
