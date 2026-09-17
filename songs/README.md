# Biblioteca de músicas

Cada música é **uma subpasta** desta pasta. O backend detecta tudo
automaticamente — nenhuma música é codificada no projeto.

Uma pasta é reconhecida como música quando contém `song.ini`.

```
songs/
└── Artista - Título/
    ├── song.ini          obrigatório (metadata)
    ├── notes.mid         obrigatório (chart)
    ├── song.opus         obrigatório (áudio; .ogg/.mp3/.wav também servem)
    ├── album.jpg         opcional (capa)
    ├── background.mp4    opcional (vídeo de fundo)
    ├── guitar.opus       opcional (stems, usados em fase futura)
    ├── rhythm.opus
    ├── bass.opus
    ├── vocals.opus
    └── drums_1..4.opus
```

Se faltar algum arquivo, a música ainda aparece na lista, marcada com o que
está faltando. Nada quebra.

## Formatos

| Item | Suportado hoje |
| --- | --- |
| `notes.mid` | ✅ |
| `notes.chart` | ❌ (detectado, com aviso; fase futura) |
| Guitarra, base, baixo, bateria | ✅ chart convertido |
| Vocal | ❌ detectado, mas não jogável ainda |
| Opus / Ogg / MP3 / WAV | ✅ |
| Vídeo MP4 (H.264) / WebM | ✅ |

## Conteúdo

Esta pasta é para músicas que **você possui ou está autorizado a usar**.
Ela está no `.gitignore` e nunca vai para o repositório.

Para testar sem nenhum conteúdo de terceiros, gere a música de demonstração:

```bash
python -m backend.app.tools.make_demo_song
```

Ela cria `Guitar Slash - Neon Highway/`, com chart e áudio sintetizados por
código a partir do próprio chart.
