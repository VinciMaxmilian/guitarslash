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

==================================================
OBJETIVO
==================================================

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
- multiplayer;
- biblioteca online;
- diferentes formatos de charts.

==================================================
STACK
==================================================

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

- Vercel
- Netlify

Banco:

Não utilizar banco de dados no MVP.

Deixar arquitetura preparada para PostgreSQL futuramente.

==================================================
ESTRUTURA
==================================================

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

==================================================
BIBLIOTECA DE MÚSICAS
==================================================

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

==================================================
VÍDEO DE FUNDO
==================================================

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

==================================================
SINCRONIZAÇÃO DO VÍDEO
==================================================

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

==================================================
INSTRUMENTOS
==================================================

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

==================================================
SELEÇÃO DE INSTRUMENTO
==================================================

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

==================================================
CHART MIDI
==================================================

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

==================================================
LANES
==================================================

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

==================================================
DRUMS
==================================================

Preparar suporte específico para bateria.

A bateria não deve obrigatoriamente usar a mesma representação visual da guitarra.

Criar arquitetura:

GuitarNoteRenderer
DrumNoteRenderer
VocalRenderer

No MVP, implementar completamente guitarra.

Porém, permitir que drums e vocals sejam adicionados posteriormente sem reescrever a engine.

==================================================
AUDIO ENGINE
==================================================

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

==================================================
GAME ENGINE
==================================================

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

==================================================
SINCRONIZAÇÃO
==================================================

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

==================================================
INTRO DA MÚSICA
==================================================

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

--------------------------------

       BULLS ON PARADE

       RAGE AGAINST THE MACHINE

              GUITAR

             EXPERT

--------------------------------

             3

             2

             1

          ROCK!

--------------------------------

A highway entra na tela.

As primeiras notas aparecem.

A música começa.

==================================================
INTRO VISUAL
==================================================

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

==================================================
HIGHWAY
==================================================

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

==================================================
NOTAS
==================================================

Notas devem ser visualmente grandes e fáceis de identificar.

Cores:

Green
Red
Yellow
Blue
Orange

Criar componentes/renderizadores próprios.

Notas sustains devem possuir corpo prolongado.

==================================================
HUD
==================================================

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

==================================================
TIMING
==================================================

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

==================================================
SCORE
==================================================

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

==================================================
STAR POWER
==================================================

Detectar eventos/notas especiais quando disponíveis no MIDI.

Criar:

Star Power Meter

Ao ativar:

- aumentar multiplicador;
- aplicar efeitos visuais;
- alterar aparência da highway;
- consumir energia gradualmente.

Arquitetura deve permitir evolução posterior.

==================================================
RESULTADO
==================================================

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

==================================================
SONG SELECT
==================================================

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

==================================================
MÚSICA PREVIEW
==================================================

Ao selecionar uma música:

se houver preview configurado:

tocar pequeno trecho.

Não iniciar o áudio completo.

Ao trocar de música:

parar preview anterior.

==================================================
SONG METADATA
==================================================

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

==================================================
SONG DETECTION
==================================================

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

==================================================
API
==================================================

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

==================================================
STORAGE
==================================================

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

==================================================
DEPLOY
==================================================

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

==================================================
PERFORMANCE
==================================================

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

==================================================
RESPONSIVE
==================================================

Desktop é prioridade.

Preparar suporte futuro para:

- tablet;
- mobile;
- touch;
- gamepad;
- guitarra USB.

==================================================
SEGURANÇA / COPYRIGHT
==================================================

A aplicação deve tratar músicas e vídeos como conteúdo fornecido pelo usuário.

Não implementar scraping automático de músicas protegidas.

Não implementar download automático de músicas de terceiros sem autorização.

A aplicação deve funcionar com músicas, charts, áudios e vídeos que o usuário possui ou está autorizado a utilizar.

==================================================
TESTES
==================================================

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

==================================================
MVP
==================================================

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

FASE 2:
- stems;
- HOPO;
- tap notes;
- open notes;
- Star Power completo;
- efeitos;
- drums;
- vocals.

FASE 3:
- editor de charts.

FASE 4:
- contas;
- rankings;
- biblioteca online.

FASE 5:
- multiplayer.

==================================================
RESULTADO ESPERADO
==================================================

Quero que o projeto tenha sensação de um jogo musical completo, e não de uma página web com notas.

A gameplay deve ser o foco.

O fluxo final deve ser:

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