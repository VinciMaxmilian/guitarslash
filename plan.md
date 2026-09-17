# ==================================================

PROJETO

Nome: Guitar Slash

Identidade visual e de marca 100% próprias.
Guitar Slash NÃO é Guitar Hero e não deve usar nada proprietário.

Pilares do produto:

- Singleplayer;
- Multiplayer LAN (co-op e versus, até 4 jogadores, rede local);
- Configurações completas (teclas, cores das notas, nome, volume, calibração, etc);
- Visual com a MESMA SENSAÇÃO de Guitar Hero 3, com arte 100% própria.

Deploy:

- Backend (Python/FastAPI) na Vercel;
- Frontend (Vite/React) no Netlify.

# ==================================================

BRIEFING ORIGINAL

Quero criar do zero uma aplicação web de jogo musical/rhythm game inspirada na experiência visual e de gameplay de Guitar Hero 3.

IMPORTANTE:
Quero inspiração na estética e na experiência de Guitar Hero 3, mas NÃO quero copiar assets proprietários.

Não utilizar:

- logo Guitar Hero;
- personagens de Guitar Hero;
- screenshots do jogo;
- texturas extraídas;
- fontes proprietárias;
- assets extraídos;
- vídeos oficiais de Guitar Hero;
- elementos gráficos proprietários.

Criar uma identidade visual própria, mas com estética de jogo de guitarra/rock dos anos 2000:

- rock;
- metal;
- palco;
- neon;
- iluminação dramática;
- highway inclinada;
- HUD arcade;
- notas coloridas;
- multiplicador;
- Star Power;
- menus agressivos;
- sensação de jogo musical de console.



# ==================================================

OBJETIVO

Criar um "Guitar Hero Web" que rode diretamente no navegador.

O jogador poderá:

- selecionar uma música;
- visualizar capa;
- visualizar artista;
- visualizar duração;
- visualizar instrumentos disponíveis;
- escolher instrumento;
- escolher dificuldade;
- visualizar preview da música;
- iniciar a música;
- jogar utilizando teclado;
- acertar notas sincronizadas com o áudio;
- criar combos;
- ganhar pontuação;
- ativar Star Power;
- visualizar accuracy;
- pausar;
- reiniciar;
- terminar a música;
- visualizar resultado final.

A aplicação deverá ser preparada futuramente para:

- guitarra USB;
- gamepad;
- touch;
- editor de charts;
- contas;
- rankings;
- multiplayer online;
- biblioteca online;
- diferentes formatos de charts.



# ============a======================================

STACK

Frontend:

- React
- TypeScript
- Vite
- Canvas ou WebGL
- Three.js se for adequado para a highway 3D
- Web Audio API
- CSS moderno

Backend:

- Python
- FastAPI
- parser MIDI
- parser song.ini
- API REST

Deploy:

- Backend (FastAPI/Python) na Vercel
- Frontend (Vite/React) no Netlify

Detalhes na seção DEPLOY.

Banco:

Não utilizar banco de dados no MVP.

Deixar arquitetura preparada para PostgreSQL futuramente.

# ==================================================

ESTRUTURA

Organizar aproximadamente assim:

/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── game/
│   │   │   ├── GameEngine.ts
│   │   │   ├── NoteEngine.ts
│   │   │   ├── AudioEngine.ts
│   │   │   ├── VideoEngine.ts
│   │   │   ├── InputManager.ts
│   │   │   ├── ScoreEngine.ts
│   │   │   ├── Highway.ts
│   │   │   ├── Note.ts
│   │   │   ├── IntroSequence.ts
│   │   │   └── GameState.ts
│   │   ├── songs/
│   │   ├── api/
│   │   └── styles/
│   └── ...
│
├── backend/
│   ├── api/
│   │   ├── songs.py
│   │   └── charts.py
│   ├── services/
│   ├── parsers/
│   │   ├── midi_parser.py
│   │   └── song_ini_parser.py
│   ├── storage/
│   │   ├── local.py
│   │   └── interface.py
│   ├── models/
│   └── main.py
│
├── songs/
│   └── ...
│
├── public/
│
├── README.md
├── .env.example
└── .gitignore

Pode alterar a estrutura caso exista uma arquitetura melhor.

# ==================================================

BIBLIOTECA DE MÚSICAS

Vou criar posteriormente uma pasta contendo as músicas.

Uma música pode possuir:

album.jpg
notes.mid
song.ini

song.opus
guitar.opus
rhythm.opus
vocals.opus
drums_1.opus
drums_2.opus
drums_3.opus

Também poderá possuir um vídeo de fundo:

background.mp4

Exemplo:

songs/
└── Bulls on Parade/
    ├── album.jpg
    ├── notes.mid
    ├── song.ini
    ├── song.opus
    ├── guitar.opus
    ├── rhythm.opus
    ├── vocals.opus
    ├── drums_1.opus
    ├── drums_2.opus
    ├── drums_3.opus
    └── background.mp4

O sistema deve detectar automaticamente cada pasta de música.

NÃO codificar músicas individualmente.

# ==================================================

VÍDEO DE FUNDO

Cada música poderá possuir opcionalmente um vídeo de fundo.

Nome padrão:

background.mp4

Se existir:

background.mp4

utilizar o vídeo como background durante a gameplay.

Se não existir:

usar um background visual padrão criado pela aplicação.

O vídeo deve:

- preencher a área disponível;
- manter aspect ratio;
- utilizar object-fit: cover;
- ficar atrás da highway;
- possuir tratamento de brilho/opacidade para não prejudicar a leitura das notas;
- iniciar junto da música;
- permanecer sincronizado com a música;
- pausar quando o jogo for pausado;
- continuar quando o jogo continuar;
- reiniciar quando a música reiniciar.

Estrutura visual:

┌─────────────────────────────────────────────┐
│                                             │
│       VIDEO DA BANDA / SHOW                 │
│                                             │
│              ┌───────────┐                  │
│              │ HIGHWAY   │                  │
│              │           │                  │
│              │   🟢      │                  │
│              │     🔴    │                  │
│              │       🟡  │                  │
│              │         🔵│                  │
│              │           │                  │
│              └───────────┘                  │
│                                             │
└─────────────────────────────────────────────┘

O vídeo deve ser tratado como uma camada independente:

Background Video
        ↓
Visual Effects / Overlay
        ↓
Highway
        ↓
Notes
        ↓
HUD

# ==================================================

SINCRONIZAÇÃO DO VÍDEO

A música deve continuar sendo a fonte principal de sincronização.

Não depender do FPS.

Não simplesmente iniciar:

video.play()
audio.play()

e assumir que ambos ficarão sincronizados.

Criar VideoEngine.ts.

A VideoEngine deve:

- carregar o vídeo;
- iniciar;
- pausar;
- continuar;
- reiniciar;
- controlar volume;
- sincronizar currentTime com AudioEngine;
- corrigir pequenas diferenças de sincronização quando necessário.

A música é a referência temporal.

AudioEngine.currentTime = fonte principal.

VideoEngine deve acompanhar AudioEngine.

# ==================================================

INSTRUMENTOS

O jogador NÃO deve escolher somente a dificuldade.

Primeiro deve escolher o instrumento.

O sistema deve detectar automaticamente quais instrumentos existem no chart.

Exemplo:

Música:

Bulls on Parade

Instrumentos:

[ 🎸 Guitar ]
[ 🎸 Rhythm ]
[ 🎸 Bass ]
[ 🥁 Drums ]
[ 🎤 Vocals ]

Somente mostrar instrumentos realmente disponíveis.

Se uma música possuir somente:

Guitar
Drums

não mostrar:

Bass
Vocals

# ==================================================

SELEÇÃO DE INSTRUMENTO

Criar tela:

SELECT INSTRUMENT

┌─────────────────────────────────────┐
│                                     │
│        SELECT INSTRUMENT             │
│                                     │
│       🎸 GUITAR                     │
│                                     │
│       🎸 RHYTHM                     │
│                                     │
│       🎸 BASS                       │
│                                     │
│       🥁 DRUMS                      │
│                                     │
│       🎤 VOCALS                     │
│                                     │
└─────────────────────────────────────┘

Cada instrumento deve possuir:

- nome;
- ícone;
- disponibilidade;
- dificuldades disponíveis.

Depois:

SELECT DIFFICULTY

[ EASY ]
[ MEDIUM ]
[ HARD ]
[ EXPERT ]

Se determinado instrumento não possuir uma dificuldade:

não mostrar essa dificuldade.

# ==================================================

CHART MIDI

notes.mid é a principal fonte das notas.

Criar parser MIDI robusto.

Detectar:

PART GUITAR
PART RHYTHM
PART BASS
PART DRUMS
PART VOCALS

Detectar também:

- BPM;
- tempo;
- sustain;
- dificuldade;
- eventos;
- seções;
- notas especiais;
- HOPO quando disponível;
- taps quando disponível;
- open notes quando disponível;
- Star Power quando disponível.

Converter para formato interno.

Exemplo:

{
  "instrument": "guitar",
  "difficulty": "expert",
  "notes": [
    {
      "time": 1.234,
      "lane": 0,
      "duration": 0,
      "type": "normal"
    }
  ]
}

# ================================================== LANES

Guitarra:

lane 0 = green
lane 1 = red
lane 2 = yellow
lane 3 = blue
lane 4 = orange

Teclas:

A = green
S = red
D = yellow
F = blue
G = orange

SPACE = strum

Permitir alteração das teclas futuramente.

# ==================================================

DRUMS

Preparar suporte específico para bateria.

A bateria não deve obrigatoriamente usar a mesma representação visual da guitarra.

Criar arquitetura:

GuitarNoteRenderer
DrumNoteRenderer
VocalRenderer

No MVP, implementar completamente guitarra.

Porém, permitir que drums e vocals sejam adicionados posteriormente sem reescrever a engine.

# ==================================================

AUDIO ENGINE

Usar Web Audio API.

Criar:

AudioEngine.ts

Responsável por:

- carregar áudio;
- iniciar;
- pausar;
- continuar;
- parar;
- reiniciar;
- currentTime;
- volume;
- futuramente stems.

Arquivos possíveis:

song.opus
guitar.opus
rhythm.opus
vocals.opus
drums_1.opus
drums_2.opus
drums_3.opus

No MVP:

usar song.opus.

Porém preparar arquitetura para mixagem de stems.

# ==================================================

GAME ENGINE

A engine deve ser independente do React.

React controla:

- menus;
- seleção;
- HUD;
- configurações;
- telas.

GameEngine controla:

- tempo;
- notas;
- colisões;
- input;
- score;
- combo;
- render;
- gameplay.

NÃO utilizar React state para atualizar posição de cada nota a cada frame.

Usar:

requestAnimationFrame

e Canvas/WebGL.

# ==================================================

SINCRONIZAÇÃO

O áudio é a fonte principal de tempo.

NÃO usar:

setInterval()

para controlar a posição das notas.

NÃO usar:

nota.y += velocidade

como fonte temporal.

Utilizar:

currentAudioTime

e:

delta = note.time - currentAudioTime

A posição visual deve ser derivada do delta.

Exemplo:

position = hitPosition - delta * noteSpeed

Assim a gameplay permanece sincronizada mesmo com variação de FPS.

# ==================================================

INTRO DA MÚSICA

Antes da gameplay começar, criar uma sequência de introdução inspirada nas introduções de jogos de ritmo clássicos.

IMPORTANTE:

Não copiar animações/assets específicos de Guitar Hero 3.

Criar uma animação original que transmita a mesma sensação.

Fluxo:

1. jogador seleciona PLAY;
2. tela de loading;
3. capa/música aparece;
4. nome da música;
5. artista;
6. instrumento;
7. dificuldade;
8. pequeno countdown;
9. highway começa a aparecer;
10. notas iniciais entram na tela;
11. música começa;
12. gameplay assume.

A introdução deve ter aproximadamente:

2 a 5 segundos.

Exemplo:

---

```
   BULLS ON PARADE

   RAGE AGAINST THE MACHINE

          GUITAR

         EXPERT
```

---

```
         3

         2

         1

      ROCK!
```

---

A highway entra na tela.

As primeiras notas aparecem.

A música começa.

# ==================================================

INTRO VISUAL

Criar IntroSequence.ts.

A sequência deve possuir fases:

LOADING
TITLE
ARTIST
INSTRUMENT
DIFFICULTY
COUNTDOWN
HIGHWAY_REVEAL
START

Todas as fases devem ser baseadas em tempo.

Não usar timers independentes do AudioEngine quando isso puder causar dessincronização.

# ==================================================

HIGHWAY

Criar highway com aparência de jogo de guitarra.

Preferência:

3D/2.5D utilizando Three.js.

Se Three.js adicionar complexidade desnecessária no MVP:

começar com Canvas 2D com perspectiva.

A highway deve possuir:

- 5 lanes;
- bordas;
- iluminação;
- hit line;
- notas;
- sustains;
- efeitos;
- perspectiva.



# ==================================================

NOTAS

Notas devem ser visualmente grandes e fáceis de identificar.

Cores:

Green
Red
Yellow
Blue
Orange

Criar componentes/renderizadores próprios.

Notas sustains devem possuir corpo prolongado.

# ==================================================

HUD

Durante gameplay mostrar:

SCORE
COMBO
MULTIPLIER
ACCURACY
STAR POWER
SONG TIME
PAUSE

Exemplo:

┌─────────────────────────────────────────────┐
│ SCORE 125430       x24       ★ STAR POWER   │
│                                             │
│                 HIGHWAY                     │
│                                             │
│                    🟢                       │
│                      🔴                     │
│                         🟡                  │
│                           🔵                │
│                              🟠             │
│                                             │
│              ═══════════════                │
│                                             │
│ ACCURACY 97%                 02:34 / 04:12 │
└─────────────────────────────────────────────┘

# ==================================================

TIMING

Criar janelas configuráveis:

Perfect <= 30ms
Great <= 60ms
Good <= 100ms
Miss > 100ms

Centralizar configuração:

GAME_CONFIG = {
  timing: {
    perfect: 0.030,
    great: 0.060,
    good: 0.100
  }
}

# ==================================================

SCORE

Criar ScoreEngine independente.

Implementar:

- score;
- combo;
- multiplier;
- misses;
- accuracy;
- streak;
- Star Power.

Configuração inicial:

combo 0-9 = x1
combo 10-19 = x2
combo 20-29 = x3
combo 30+ = x4

Deixar configurável.

# ==================================================

STAR POWER

Detectar eventos/notas especiais quando disponíveis no MIDI.

Criar:

Star Power Meter

Ao ativar:

- aumentar multiplicador;
- aplicar efeitos visuais;
- alterar aparência da highway;
- consumir energia gradualmente.

Arquitetura deve permitir evolução posterior.

# ==================================================

RESULTADO

Ao terminar:

mostrar:

SONG COMPLETE

Song
Artist
Instrument
Difficulty

Score
Accuracy
Max Combo
Notes Hit
Notes Missed
Perfect
Great
Good

Criar avaliação visual:

★★★★★

Não precisa utilizar ranking global ainda.

# ==================================================

SONG SELECT

Criar tela de seleção inspirada em jogos musicais.

Mostrar:

- album art;
- título;
- artista;
- duração;
- instrumentos;
- dificuldade;
- preview;
- disponibilidade de vídeo;
- botão PLAY.

Exemplo:

┌────────────────────────────────────────────┐
│                                            │
│  [ALBUM]     BULLS ON PARADE              │
│              Rage Against The Machine      │
│                                            │
│              Guitar                        │
│              Expert                        │
│                                            │
│              Video: ✓                      │
│                                            │
│              [ PLAY ]                      │
│                                            │
└────────────────────────────────────────────┘

# ==================================================

MÚSICA PREVIEW

Ao selecionar uma música:

se houver preview configurado:

tocar pequeno trecho.

Não iniciar o áudio completo.

Ao trocar de música:

parar preview anterior.

# ==================================================

SONG METADATA

Ler song.ini automaticamente.

Extrair:

- name;
- artist;
- album;
- year;
- genre;
- charter;
- length;
- outras informações úteis.

Não hardcodar metadata.

# ==================================================

SONG DETECTION

Ao iniciar backend:

1. procurar songs;
2. procurar subpastas;
3. localizar song.ini;
4. localizar notes.mid;
5. localizar album.jpg;
6. localizar arquivos de áudio;
7. localizar background.mp4;
8. detectar instrumentos;
9. detectar dificuldades;
10. gerar biblioteca.

Se faltar arquivo:

não quebrar a aplicação.

Informar:

Missing:

- notes.mid
- song.opus

etc.

# ==================================================

API

Criar:

GET /api/songs

GET /api/songs/{song_id}

GET /api/songs/{song_id}/chart

GET /api/songs/{song_id}/chart/{instrument}/{difficulty}

GET /api/songs/{song_id}/assets

A API deve retornar:

{
  "id": "bulls-on-parade",
  "title": "Bulls on Parade",
  "artist": "Rage Against the Machine",
  "album": "...",
  "duration": 313,
  "cover": "...",
  "backgroundVideo": true,

  "instruments": {
    "guitar": {
      "available": true,
      "difficulties": [
        "easy",
        "medium",
        "hard",
        "expert"
      ]
    },
    "rhythm": {
      "available": true,
      "difficulties": [
        "easy",
        "medium",
        "hard",
        "expert"
      ]
    },
    "bass": {
      "available": false
    },
    "drums": {
      "available": true,
      "difficulties": [
        "easy",
        "medium",
        "hard",
        "expert"
      ]
    }
  }
}

# ==================================================

STORAGE

Criar abstração:

SongStorage

Implementar:

LocalSongStorage

No desenvolvimento:

songs/

Na produção:

RemoteSongStorage

Preparar suporte futuro para:

- S3;
- Cloudflare R2;
- Supabase Storage;
- Vercel Blob;
- outro object storage/CDN.

Não assumir que filesystem de serverless é persistente.

# ==================================================

DEPLOY

Preparar para:

Vercel
Netlify

O sistema deve funcionar localmente com:

songs/

mas não depender da pasta local em produção.

Documentar claramente:

- o que funciona localmente;
- o que precisa de storage em produção;
- onde colocar os vídeos;
- onde colocar os áudios;
- onde colocar os charts.

Não tentar colocar uma biblioteca enorme de músicas dentro das Functions.

# ==================================================

PERFORMANCE

Priorizar:

- requestAnimationFrame;
- Canvas/WebGL;
- Web Audio API;
- estruturas de dados eficientes;
- engine independente;
- carregamento sob demanda.

Não carregar todas as músicas e vídeos simultaneamente.

Carregar apenas assets da música selecionada.

Não deixar React renderizar novamente a cada frame.

# ==================================================

RESPONSIVE

Desktop é prioridade.

Preparar suporte futuro para:

- tablet;
- mobile;
- touch;
- gamepad;
- guitarra USB.



# ==================================================

SEGURANÇA / COPYRIGHT

A aplicação deve tratar músicas e vídeos como conteúdo fornecido pelo usuário.

Não implementar scraping automático de músicas protegidas.

Não implementar download automático de músicas de terceiros sem autorização.

A aplicação deve funcionar com músicas, charts, áudios e vídeos que o usuário possui ou está autorizado a utilizar.

# ==================================================

TESTES

Criar testes para:

- MIDI parser;
- song.ini parser;
- song detection;
- instrument detection;
- difficulty detection;
- chart conversion;
- timing;
- scoring;
- combo;
- API.



# ==================================================

MVP

O primeiro milestone funcional deve ser:

1. colocar uma música em /songs;
2. backend detectar a música;
3. frontend listar a música;
4. mostrar album art;
5. detectar instrumentos;
6. permitir escolher instrumento;
7. permitir escolher dificuldade;
8. carregar notes.mid;
9. converter chart;
10. carregar song.opus;
11. carregar background.mp4 se existir;
12. executar intro;
13. iniciar áudio;
14. iniciar vídeo;
15. iniciar highway;
16. sincronizar notas com áudio;
17. permitir A/S/D/F/G + SPACE;
18. detectar Perfect/Great/Good/Miss;
19. calcular score;
20. calcular combo;
21. implementar Star Power básico;
22. permitir pause;
23. permitir restart;
24. mostrar resultado.

Depois do MVP:

FASE 2 - CONFIGURAÇÕES E PERFIS:

- tela de settings;
- remapeamento de teclas;
- cores das notas por lane;
- volumes separados;
- note speed;
- calibração de áudio/vídeo;
- perfis de jogador;
- persistência local.

FASE 3 - MULTIPLAYER LAN:

- modo host (servidor local na máquina de um dos jogadores);
- lobby e entrada por IP;
- protocolo WebSocket versionado;
- distribuição dos assets da música pela LAN;
- sincronização do start entre máquinas;
- placar ao vivo dos oponentes;
- modo co-op;
- modo versus;
- até 4 jogadores;
- tratamento de desconexão;
- tela de resultado comparativa.

FASE 4 - INSTRUMENTOS E CHART AVANÇADO:

- stems;
- HOPO;
- tap notes;
- open notes;
- Star Power completo;
- efeitos;
- drums;
- vocals.

FASE 5:

- editor de charts.

FASE 6:

- contas;
- rankings;
- biblioteca online;
- sync de configurações na conta.

FASE 7:

- multiplayer online.

Justificativa da ordem:
as configurações vêm antes do multiplayer LAN porque o LAN depende de
perfis (o nome que aparece para os outros jogadores) e principalmente
de calibração, já que cada máquina tem latência própria.

# ==================================================

RESULTADO ESPERADO

Quero que o projeto tenha sensação de um jogo musical completo, e não de uma página web com notas.

A gameplay deve ser o foco.

O fluxo final deve ser:

SOLO:

MENU
 ↓
SONG SELECT
 ↓
INSTRUMENT SELECT
 ↓
DIFFICULTY SELECT
 ↓
INTRO
 ↓
HIGHWAY + VIDEO + AUDIO
 ↓
GAMEPLAY
 ↓
RESULT
 ↓
SONG SELECT

LAN:

MENU
 ↓
MULTIPLAYER LAN
 ↓
HOST ou JOIN
 ↓
LOBBY  (modo, jogadores, ready)
 ↓
SONG SELECT  (o host escolhe)
 ↓
INSTRUMENT + DIFFICULTY  (cada jogador escolhe o seu)
 ↓
LOADING  (clientes baixam os assets do host)
 ↓
START SINCRONIZADO
 ↓
INTRO
 ↓
HIGHWAY + VIDEO + AUDIO  (tela cheia, uma por máquina)
 ↓
GAMEPLAY  (+ placar dos oponentes em overlay)
 ↓
RESULT  (comparativo)
 ↓
LOBBY

O projeto deve ser modular, performático e preparado para crescer.

Antes de implementar:

1. analisar o projeto atual;
2. verificar arquivos existentes;
3. propor arquitetura;
4. identificar problemas de compatibilidade;
5. verificar suporte dos formatos de áudio/vídeo no navegador;
6. depois começar a implementação.

Não criar tudo de uma vez se isso aumentar risco.

Construir primeiro o MVP funcional e testável.

# ==================================================

DIREÇÃO DE ARTE

Referência de sensação: Guitar Hero 3.
Referência de conteúdo: nenhuma. Toda a arte é própria.

Isto é um pilar do produto, não um detalhe de acabamento.
O jogo tem que PARECER um jogo de console dos anos 2000, e não uma
página web com notas caindo.

O QUE IMITAR (linguagem visual)

- colagem ilustrada, estilo pôster de show e tattoo flash;
- traço desenhado à mão, com contorno grosso;
- paleta QUENTE e suja: ferrugem, âmbar, ouro velho, osso, carvão;
nada de neon frio como paleta principal;
- textura de papel envelhecido, tinta descascada, grunge;
- tipografia display pesada e condensada, com contorno e tratamento
metálico/desgastado, levemente inclinada;
- menu vertical alinhado à esquerda, com TAMANHOS DIFERENTES por item:
a hierarquia é feita pelo tamanho da fonte, não por caixinhas;
- molduras ornamentadas nas bordas da tela, emoldurando o conteúdo;
- iluminação dramática de palco por trás de tudo;
- rodapé com as dicas de controle, estilo console.

O QUE NUNCA COPIAR

- o logo de Guitar Hero;
- as ilustrações, personagens e mascotes;
- as fontes proprietárias;
- screenshots, texturas ou qualquer asset extraído;
- a composição exata de qualquer tela do jogo.

A regra é simples: alguém que jogou GH3 tem que sentir a mesma vibe,
e um advogado tem que olhar e não achar nada de lá.

APLICAÇÃO POR TELA

MENU

- fundo ilustrado em colagem, com vinheta escura;
- logo Guitar Slash grande, desgastado, à esquerda;
- lista vertical de opções à direita, tamanhos variados;
- rodapé com as teclas.

SONG SELECT

- lista com textura de papel;
- capa em destaque, emoldurada;
- metadados em tipografia de cartaz.

GAMEPLAY

- a highway continua sendo o elemento mais legível da tela;
- a moldura ornamentada NÃO pode competir com a leitura das notas;
- HUD com números pesados e desgastados;
- star power aquece a cena inteira.

RESULTADO

- tela de cartaz: estrelas grandes, score enorme, textura de papel.

RESTRIÇÃO PRÁTICA

Enquanto não houver ilustração própria produzida, a estética é construída
com CSS: gradientes quentes, ruído, vinheta, molduras geométricas e
tipografia. A troca por ilustração própria depois não deve exigir
reescrever as telas - apenas trocar as camadas de fundo e as molduras.

# ==================================================

MODOS DE JOGO

SOLO

- 1 jogador;
- 1 máquina;
- fluxo padrão do MVP.

CO-OP LAN

- 2 a 4 jogadores, cada um na sua máquina, na mesma rede local;
- mesma música;
- cada jogador em um instrumento, quando o chart tiver mais de um;
- pontuação somada = BAND SCORE;
- objetivo: tocar a música juntos.

VERSUS LAN

- 2 a 4 jogadores, cada um na sua máquina, na mesma rede local;
- mesma música;
- vence quem fizer mais pontos;
- placar comparativo ao vivo.

NÃO existe multiplayer na mesma máquina.
Não há tela dividida, não há duas highways na mesma tela,
não há dois jogadores no mesmo teclado.

Cada jogador tem a própria máquina, a própria tela, o próprio teclado
e o próprio áudio.

# ==================================================

MULTIPLAYER LAN

Máximo: 4 jogadores.
Rede local. Sem servidor na internet. Sem conta. Sem matchmaking.

Por que não passa pela Vercel:

- Serverless Function não mantém conexão WebSocket aberta;
- uma partida precisa de estado vivo e de broadcast;
- e uma página servida por HTTPS não pode abrir ws:// para um IP da LAN
(mixed content bloqueado pelo navegador).

Solução adotada: MODO HOST.

Um dos jogadores roda o backend na própria máquina.
Esse processo serve o frontend, a API, os assets da música e o WebSocket
da partida, tudo na mesma origem.
Os outros jogadores só abrem o IP do host no navegador.

Netlify e Vercel continuam existindo para o singleplayer e para a
biblioteca pública. O multiplayer LAN não depende deles.

# ==================================================

MODO HOST

O host roda o mesmo app FastAPI do backend, em modo host.

Exemplo:

```
guitarslash host --port 8000
```

O processo do host serve:

- o SPA já buildado (arquivos estáticos);
- a API de músicas, lendo songs/ da máquina do host;
- os arquivos de áudio, vídeo, capa e notes.mid;
- o WebSocket da partida;
- a página de lobby.

Consequências boas dessa escolha:

- origem única: sem CORS, sem mixed content, sem certificado;
- os clientes não instalam nada, só abrem o navegador;
- funciona 100% offline;
- latência de rede local;
- o mesmo código de backend serve produção e modo host.

Descoberta do host:

- a tela do host exibe o IP e a porta em tamanho grande;
- exibir também um QR code com a URL;
- mDNS (guitarslash.local) é conveniência opcional, nunca dependência,
porque o suporte varia por sistema operacional;
- documentar que o firewall vai pedir autorização na primeira execução.

O host normalmente também joga.
Permitir host sem jogar (host dedicado ou espectador) já na arquitetura,
mesmo que a interface só apareça depois.

Distribuição:
o artefato do modo host é backend + frontend/dist empacotados juntos.

Detecção de modo no frontend:
se o SPA não estiver sendo servido pelo domínio público, ele está em
modo host e habilita a interface de LAN.
O frontend nunca hardcoda a URL da API: usa a própria origem.

# ==================================================

SINCRONIZAÇÃO EM REDE

REGRA CENTRAL:

Cada cliente tem o próprio AudioEngine e é a autoridade absoluta sobre
o julgamento das próprias notas.

Não existe lockstep.
Não existe estado de nota compartilhado.
Não existe rollback.
A sincronização áudio-nota NUNCA depende da rede.

A rede transporta apenas:

- estado da sala e do lobby;
- comando de início com timestamp;
- score, combo, multiplicador e accuracy, em baixa frequência;
- eventos raros: star power ativado, jogador terminou, jogador caiu.

Se a rede engasgar, o jogo do jogador continua perfeito.
Só o placar dos oponentes fica desatualizado por alguns instantes.

START SINCRONIZADO

1. handshake de relógio estilo NTP: N pares ping/pong, guardar a mediana
  do offset e do RTT;
2. o host envia START_AT com um instante futuro no relógio dele,
  tipicamente agora + 3 segundos;
3. cada cliente converte esse instante para o próprio relógio;
4. cada cliente inicia áudio, vídeo e intro nesse instante.

Um desvio de 50 a 100 ms entre máquinas é aceitável, porque ninguém é
julgado contra o áudio do outro.

ATENÇÃO - jogadores na mesma sala física:

Se duas máquinas tocam a mesma música alto na mesma sala, qualquer desvio
vira eco audível. Mitigação: recomendar fones, ou deixar só o host com o
áudio alto. Documentar isso na interface do lobby.

FREQUÊNCIA DE REDE

- score broadcast entre 5 e 10 Hz, nunca a cada frame;
- enviar diffs, não o estado completo;
- o host agrega tudo e faz um único broadcast para todos;
- o placar da tela interpola entre atualizações para não ficar travado.



# ==================================================

DISTRIBUIÇÃO DE ASSETS NA LAN

Só o host precisa ter a música.

Ao selecionar a música no lobby:

1. o host publica o manifesto da música: arquivos, tamanhos e hashes;
2. cada cliente verifica o que já tem em cache;
3. cada cliente baixa do host o que falta;
4. o lobby mostra o progresso de download de cada jogador;
5. a partida só começa quando todos estiverem prontos, com timeout
  e aviso de quem está travando.

Detalhes:

- o host serve os arquivos por HTTP normal, com suporte a Range requests;
- cachear no cliente por hash (Cache Storage API), para não rebaixar
a mesma música na próxima partida;
- o vídeo de fundo é de longe o arquivo mais pesado: permitir que o
cliente desabilite o vídeo e entre na partida sem baixá-lo;
- o chart e o áudio são obrigatórios; o vídeo e a capa são opcionais;
- validar o hash do notes.mid: todos precisam jogar exatamente o mesmo chart.



# ==================================================

PROTOCOLO

WebSocket, mensagens JSON tipadas, com campo de versão.
Cliente com versão de protocolo diferente é recusado com mensagem clara.

Cliente -> Host:

JOIN               nome, versão do protocolo
SET_INSTRUMENT     instrumento escolhido
SET_DIFFICULTY     dificuldade escolhida
SET_READY          pronto / não pronto
LOAD_PROGRESS      progresso do download dos assets
SCORE_UPDATE       score, combo, multiplicador, accuracy, notas
STAR_POWER         ativou star power
FINISHED           resultado final do jogador
LEAVE              saiu
PING               sincronização de relógio

Host -> Cliente:

ROOM_STATE         estado completo da sala
PLAYER_JOINED      novo jogador
PLAYER_LEFT        jogador saiu ou caiu
MODE_CHANGED       co-op ou versus
SONG_SELECTED      música + manifesto de assets
LOADING_STATE      progresso de todos os jogadores
START_AT           timestamp de início
SCOREBOARD         placar agregado
RESULTS            resultado final consolidado
ERROR              erro com código e mensagem
PONG               sincronização de relógio

O estado da sala é do host. O host é a fonte da verdade do lobby.
Durante a música, cada cliente é a fonte da verdade do próprio score.

CONFIANÇA

LAN entre amigos: confiar no cliente.
Não implementar anti-cheat.
Não gastar esforço validando score no host.

# ==================================================

DESCONEXÕES

Cliente cai durante a música:

- os outros continuam normalmente;
- o jogador aparece como DISCONNECTED no placar;
- o score dele congela no último valor recebido;
- no co-op, o BAND SCORE continua somando os que ficaram.

Cliente cai no lobby:

- simplesmente sai da lista.

Host cai:

- a partida acaba, porque o host é o servidor;
- os clientes mostram uma mensagem clara, não uma tela quebrada;
- não tentar eleger novo host.

Reconexão:

- tentar reentrar na sala mantendo o nome e o score (fase posterior);
- no MVP da FASE 3, reconectar volta para o lobby.

Timeouts:

- heartbeat por ping;
- considerar caído após N segundos sem resposta;
- valor configurável, porque LAN por wifi oscila.



# ==================================================

CO-OP

Seleção:

- cada jogador escolhe instrumento e dificuldade na própria máquina;
- o lobby mostra quem escolheu o quê;
- instrumentos já escolhidos aparecem marcados;
- se o chart tiver menos instrumentos que jogadores, permitir instrumento
repetido (configurável, default: permitido).

Pontuação:

- cada jogador mantém combo, multiplicador e accuracy próprios;
- o BAND SCORE é a soma dos scores individuais, agregada pelo host;
- cada tela mostra o BAND SCORE em destaque e o próprio score ao lado.

Star Power:

- medidor individual;
- ativação individual;
- quando alguém ativa, os outros veem no overlay;
- preparar bônus para ativação simultânea de 2+ jogadores,
sem obrigatoriedade de implementar já.

Fail:

- no MVP não há fail;
- a arquitetura deve permitir "fail individual com resgate" depois.

Resultado:

- BAND SCORE em destaque;
- quebra por jogador: score, accuracy, max combo, notas acertadas
e notas erradas.



# ==================================================

VERSUS

Seleção:

- default: todos no mesmo instrumento;
- dificuldade independente por jogador;
- permitir instrumentos diferentes como opção avançada, deixando claro
que a comparação fica desbalanceada.

Regra de vitória:

- vence quem tiver MAIS PONTOS ao final da música.

Desempate, nesta ordem:

1. accuracy;
2. max combo;
3. notas acertadas;
4. empate declarado.

Comparação:

- o score bruto é sempre o valor oficial exibido;
- dificuldades diferentes geram scores não comparáveis: avisar na tela;
- deixar espaço para um "modo justo" com normalização no futuro,
sem implementar agora.

Resultado:

- ranking do 1º ao 4º;
- vencedor em destaque;
- tabela comparativa com todas as métricas;
- jogadores desconectados listados à parte.



# ==================================================

HUD DE OPONENTES

Cada jogador vê a própria highway em TELA CHEIA.
A presença dos oponentes é um overlay compacto, nunca uma segunda highway.

O overlay mostra, por oponente:

- nome;
- score;
- combo atual;
- star power ativo;
- estado (tocando, terminou, desconectado).

CO-OP:

┌─────────────────────────────────────────────┐
│ SCORE 125430   x24        ★ STAR POWER      │
│                                             │
│   BAND  412.980           HIGHWAY           │
│   ─────────────                             │
│   Você    125.430            🟢             │
│   Ana     158.220              🔴           │
│   Léo     129.330                🟡         │
│                                             │
│              ═══════════════                │
│ ACCURACY 97%                 02:34 / 04:12  │
└─────────────────────────────────────────────┘

VERSUS:

┌─────────────────────────────────────────────┐
│ SCORE 125430   x24        ★ STAR POWER      │
│                                             │
│   1º Ana    158.220       HIGHWAY           │
│   2º Você   125.430   -32.790                │
│   3º Léo    129.330          🟢             │
│                                🔴           │
│                                             │
│              ═══════════════                │
│ ACCURACY 97%                 02:34 / 04:12  │
└─────────────────────────────────────────────┘

Regras:

- o overlay não pode competir com a leitura das notas;
- deve ser possível reduzir ou esconder o overlay nas configurações;
- animar a mudança de posição no versus, mas sem chamar mais atenção
que a highway;
- no versus, destacar a diferença para o líder.



# ==================================================

CONFIGURAÇÕES

Tela SETTINGS acessível pelo menu principal e pela pausa.
Aplicar as alterações imediatamente sempre que possível.

GAMEPLAY

- note speed / scroll speed;
- posição da hit line;
- lefty flip (inverter a ordem das lanes);
- hit sounds on/off e volume;
- mostrar FPS;
- mostrar contadores de timing;
- janelas de timing (avançado, com opção de restaurar o padrão).

CONTROLES

- remapear as 5 fret keys;
- remapear o strum;
- teclas de pause e star power;
- teste de input ao vivo;
- detecção de teclas duplicadas dentro do próprio mapeamento.

Cada máquina tem um jogador, então não há disputa de teclado
nem problema de ghosting entre jogadores.

VISUAL

- cor de cada lane: 5 cores personalizáveis, com presets;
- preset para daltonismo;
- tema da highway;
- opacidade e brilho do vídeo de fundo;
- nível de efeitos: baixo, médio ou alto;
- HUD compacto.

ÁUDIO

- volume master;
- volume da música;
- volume dos stems, quando existirem;
- volume dos efeitos;
- volume do vídeo de fundo;
- volume do preview na seleção de música.

PERFIL

- nome do jogador;
- cor de identificação;
- avatar (opcional, futuro).

CALIBRAÇÃO

- audio offset em ms;
- video offset em ms;
- wizard de calibração.

Implementação:

- um único SettingsStore tipado, com defaults, validação e reset;
- schema versionado, com migração ao carregar versões antigas;
- persistência em localStorage no MVP;
- a engine NÃO lê o localStorage: o SettingsStore deriva um GAME_CONFIG
que é injetado na engine;
- alterações em tempo real notificam a engine por callback, e não por
re-render do React.



# ==================================================

CALIBRAÇÃO

A latência de áudio no navegador é real e varia por dispositivo,
sistema operacional e, principalmente, fones bluetooth.
Sem calibração, o jogo "parece" fora do ritmo mesmo estando correto.

Aplicação dos offsets:

tempoEfetivo = AudioEngine.currentTime + audioOffset

O offset de áudio é por máquina e por perfil, porque hardware, sistema
operacional, fones e percepção variam entre os jogadores.

Em LAN isso é ainda mais importante: cada jogador calibra a própria
máquina, e o resultado não afeta ninguém mais, porque cada cliente
julga as próprias notas contra o próprio áudio.

O offset de vídeo é global e aplicado pela VideoEngine ao sincronizar
o currentTime com o AudioEngine.

Wizard de calibração:

1. tocar um metrônomo estável;
2. o jogador bate na tecla no ritmo;
3. coletar N acertos;
4. calcular a mediana do erro (mediana, não média, para ignorar outliers);
5. sugerir o offset;
6. permitir aceitar ou ajustar manualmente.



# ==================================================

PERFIS DE JOGADOR

Perfil = nome + cores das notas + keybinds + offset + preferências.

- um perfil ativo por máquina;
- permitir vários perfis salvos na mesma máquina e troca rápida;
- perfis salvos localmente, no navegador;
- o nome do perfil é o nome exibido para os outros jogadores na LAN;
- criar, renomear e apagar perfil;
- preparar para sincronizar com conta em fase futura,
sem implementar login agora.



# ==================================================

DEPLOY

FRONTEND - NETLIFY

- build com Vite;
- publish: frontend/dist;
- netlify.toml versionado no repositório;
- redirect de SPA: /* -> /index.html 200;
- variável de ambiente VITE_API_URL apontando para o backend na Vercel;
- em desenvolvimento, VITE_API_URL aponta para o backend local.

BACKEND - VERCEL

- FastAPI rodando como Python Serverless Function;
- entrypoint exportando o app ASGI;
- vercel.json com rewrites para /api/*;
- requirements.txt no backend;
- versão do Python fixada;
- CORS liberado para o domínio do Netlify e para localhost em dev.

Restrições da Vercel que afetam a arquitetura:

- o filesystem é efêmero e somente leitura fora de /tmp;
- portanto a pasta songs/ NÃO existe em produção;
- não colocar a biblioteca de músicas dentro da function;
- há limite de tamanho de bundle e de tempo de execução;
- cold start: o parse de MIDI precisa ser rápido;
- cachear os charts já convertidos em memória e, depois, em storage/CDN.

ASSETS EM PRODUÇÃO

- áudios, vídeos, capas e notes.mid ficam em object storage/CDN;
- o backend retorna URLs, e não bytes;
- o storage precisa suportar CORS para o domínio do frontend;
- o storage precisa suportar Range requests, senão o seek de áudio
e de vídeo não funciona.

DESENVOLVIMENTO x PRODUÇÃO

Local:

- LocalSongStorage lê songs/;
- o backend local serve os arquivos.

Produção:

- RemoteSongStorage aponta para o CDN;
- mesma API, mesma resposta, só muda a origem das URLs.

O código do frontend não deve saber a diferença.

MODO HOST LAN

O modo host não é um terceiro deploy: é o mesmo backend rodando na
máquina de um jogador, servindo também o frontend já buildado.

- não passa por Vercel nem por Netlify;
- não precisa de internet;
- não precisa de storage remoto: usa songs/ da máquina do host;
- é o único caminho do multiplayer LAN, porque Serverless Function
não mantém WebSocket e página HTTPS não abre ws:// para IP local.

Empacotamento:
backend + frontend/dist distribuídos juntos, com um comando único
para subir o host.