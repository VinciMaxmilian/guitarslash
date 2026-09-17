# Guitar Slash

Jogo de ritmo de guitarra que roda no navegador. Identidade visual própria —
palco, neon e metal dos anos 2000 — sem nenhum asset proprietário.

**Estado atual:** MVP singleplayer completo e jogável.
Configurações e multiplayer LAN estão nas próximas fases (ver [plan.md](plan.md)).

---

## Stack

| Camada | Tecnologia | Onde roda |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite, Canvas 2D, Web Audio API | Netlify |
| Backend | Python + FastAPI, parser MIDI (`mido`) | Vercel |
| Modo host | O mesmo backend servindo também o frontend | máquina de um jogador |

Sem banco de dados. A arquitetura está preparada para PostgreSQL depois.

---

## Rodando localmente

Pré-requisitos: Python 3.11+ e Node 20+.

### 1. Backend

```bash
python -m venv .venv
.venv/Scripts/activate        # Windows
# source .venv/bin/activate   # Linux/macOS

pip install -r backend/requirements-dev.txt
uvicorn backend.app.main:app --reload --port 8000
```

API em <http://localhost:8000/api/songs>, docs em <http://localhost:8000/docs>.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Jogo em <http://localhost:5173>. O Vite faz proxy de `/api` para o backend.

### 3. Uma música para testar

```bash
python -m backend.app.tools.make_demo_song
```

Gera `songs/Guitar Slash - Neon Highway/` com chart e áudio sintetizados por
código. Para usar suas próprias músicas, veja [songs/README.md](songs/README.md).

---

## Modo host (uma única origem)

```bash
cd frontend && npm run build && cd ..
python -m backend.app.host --port 8000
```

Um único processo serve o SPA, a API e os arquivos das músicas. Ele imprime o
IP da máquina na rede local. É assim que o multiplayer LAN vai funcionar na
FASE 3, porque:

- Serverless Function na Vercel **não mantém WebSocket aberto**;
- uma página HTTPS **não pode abrir `ws://` para um IP da LAN** (mixed content).

Origem única elimina CORS, mixed content e certificado de uma vez só.

---

## Como jogar

| Tecla | Ação |
| --- | --- |
| `A` `S` `D` `F` `G` | Trastes (verde, vermelho, amarelo, azul, laranja) |
| `Espaço` | Palhetada |
| `Enter` | Star Power (a partir de 50% da barra) |
| `Esc` | Pausar |

Tudo remapeável em **Configurações → Controles**. O mapeamento usa a posição
física da tecla (`event.code`), então funciona igual em ABNT2 e US.

Nota simples permite ancorar trastes **abaixo** dela. Acorde exige match exato.

---

## Arquitetura

```
backend/app/
├── main.py              create_app() usado por dev, Vercel e modo host
├── host.py              modo host na LAN
├── api/                 rotas + entrega de arquivos com Range requests
├── parsers/             notes.mid e song.ini
├── services/library.py  detecção automática das músicas
├── storage/             local (disco) | remote (CDN) por trás da mesma interface
└── tools/               build_index, make_demo_song

frontend/src/game/
├── GameEngine.ts        orquestra tudo, roda fora do React
├── AudioEngine.ts       Web Audio API — FONTE DE TEMPO do jogo
├── VideoEngine.ts       vídeo de fundo, persegue o áudio
├── NoteEngine.ts        estado das notas e julgamento
├── ScoreEngine.ts       score, combo, multiplicador, star power
├── InputRouter.ts       um único listener para N jogadores
├── PlayerSession.ts     uma sessão por jogador (lista, mesmo no solo)
├── HighwayRenderer.ts   Canvas 2D com perspectiva
└── IntroSequence.ts     intro derivada do mesmo relógio
```

### Três decisões que sustentam o resto

**O áudio é o relógio.** A posição de cada nota vem sempre de
`note.time - audioTime`. Nada incrementa posição por frame, então queda de FPS
não dessincroniza a gameplay. Durante a contagem regressiva o tempo é
*negativo*, o que faz as primeiras notas entrarem na tela antes da música.

**O React não desenha notas.** A engine roda em `requestAnimationFrame` sobre
Canvas. O React recebe apenas snapshots do HUD a ~15 Hz.

**A engine já é multi-jogador.** `GameEngine` mantém uma *lista* de
`PlayerSession`, mesmo no singleplayer, onde ela tem tamanho 1. É o que permite
a FASE 3 (LAN) reaproveitar a engine em vez de reescrevê-la.

---

## Testes

```bash
.venv/Scripts/python -m pytest backend/tests -q   # 65 testes
cd frontend && npm test                           # 53 testes
```

Cobrem: tempo map com mudança de andamento, detecção de instrumentos e
dificuldades, conversão de chart (acordes, sustains, HOPO, star power),
`song.ini` malformado, detecção da biblioteca, path traversal, Range requests,
julgamento, combo, multiplicador, star power, intro e configurações.

---

## Deploy

### Frontend — Netlify

`netlify.toml` já está no repositório. Configure a variável:

```
VITE_API_URL = https://<seu-backend>.vercel.app
```

### Backend — Vercel

`vercel.json` e `api/index.py` já estão prontos. Configure:

```
GUITARSLASH_ALLOWED_ORIGINS = https://<seu-site>.netlify.app
GUITARSLASH_STORAGE         = remote
GUITARSLASH_ASSETS_BASE_URL = https://<seu-bucket-ou-cdn>
```

### Por que `songs/` não funciona em produção

O filesystem da Vercel é efêmero e somente leitura fora de `/tmp`. A pasta
`songs/` simplesmente não existe lá, e a biblioteca não pode ir dentro do
bundle da function.

Gere o pacote estático e publique num object storage:

```bash
python -m backend.app.tools.build_index --out dist-songs
```

Isso produz `index.json` e os charts já convertidos, para a function não fazer
parse de MIDI em cold start. Áudio, vídeo e capas vão para o bucket.

O bucket precisa de **CORS** para o domínio do frontend e de **Range requests**,
senão o seek de áudio e vídeo não funciona.

| | Local / modo host | Produção |
| --- | --- | --- |
| Biblioteca | `songs/` no disco | object storage / CDN |
| Charts | parse de MIDI sob demanda | JSON pré-gerado |
| Assets | servidos pelo backend | servidos pelo CDN |
| Internet | dispensável | necessária |

---

## Compatibilidade

- **Opus**: Chrome e Firefox decodificam bem. Safari é inconsistente — se o
  áudio falhar, a tela mostra o motivo. Converta para `.ogg` ou `.m4a`.
- **Vídeo**: MP4 (H.264) é o mais seguro; WebM funciona em Chrome/Firefox.
- **Autoplay**: navegadores exigem um clique antes de tocar áudio. Quando isso
  acontece, o jogo mostra um botão "Começar" em vez de falhar em silêncio.
- **Latência**: use **Configurações → Calibração**. Fones bluetooth costumam
  precisar de 100 a 200 ms.

---

## Conteúdo e direitos

O jogo trata músicas, charts, áudios e vídeos como **conteúdo fornecido pelo
usuário**. Não há download automático nem scraping. A pasta `songs/` está no
`.gitignore`. A música de demonstração é gerada por código.
