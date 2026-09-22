# Servidor de partidas (WebSocket) + API.
#
# Existe porque Serverless Function nao mantem conexao aberta: a Vercel serve a
# API por HTTP, mas nao serve para o multiplayer. Esta imagem roda o MESMO
# create_app, com um processo de verdade. Destino atual: Railway (ver DEPLOY.md
# Parte 4), conectado ao repositorio pelo git.
#
# Nao inclui songs/: em producao a biblioteca vem da URL publica
# (GUITARSLASH_ASSETS_BASE_URL), igual a Vercel.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Atras do proxy do Railway o TLS termina antes da aplicacao. Sem isto o
# uvicorn ignora os cabecalhos X-Forwarded-* (o default so confia em
# 127.0.0.1) e registra todo mundo com o IP do proxy, o que atrapalha na hora
# de ler log de partida.
#
# Vai como variavel, e nao como `--forwarded-allow-ips "*"` no CMD, porque ali
# a aspa teria de sobreviver a duas camadas de shell para o `*` nao virar glob.
# O uvicorn le $FORWARDED_ALLOW_IPS sozinho quando a flag nao vem.
ENV FORWARDED_ALLOW_IPS="*"

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY main.py ./

# Informativo. Quem manda e a variavel PORT (veja o CMD): plataformas como o
# Railway escolhem a porta e injetam ela no ambiente.
EXPOSE 8000

# CMD em shell-form DE PROPOSITO: a forma exec (["python", ...]) nao expande
# variavel nenhuma, entao ${PORT} chegaria literal no uvicorn e o Railway
# ficaria com healthcheck eterno numa porta onde ninguem escuta. O `exec`
# mantem o uvicorn como PID 1, para o SIGTERM do deploy chegar nele e as
# partidas fecharem com codigo limpo em vez de cair no timeout.
#
# UM worker, de proposito: as salas vivem na memoria do processo. Com dois
# workers, dois jogadores com o mesmo codigo cairiam em salas diferentes.
# Para escalar de verdade seria preciso mover o estado para fora (Redis).
CMD exec python -m uvicorn backend.app.main:app \
      --host 0.0.0.0 \
      --port "${PORT:-8000}" \
      --workers 1 \
      --proxy-headers
