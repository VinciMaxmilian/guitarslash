# Servidor de partidas (WebSocket) + API.
#
# Existe porque Serverless Function nao mantem conexao aberta: a Vercel serve a
# API por HTTP, mas nao serve para o multiplayer. Esta imagem roda o MESMO
# create_app, com um processo de verdade.
#
# Nao inclui songs/: em producao a biblioteca vem da URL publica
# (GUITARSLASH_ASSETS_BASE_URL), igual a Vercel.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY main.py ./

EXPOSE 8000

# UM worker, de proposito: as salas vivem na memoria do processo. Com dois
# workers, dois jogadores com o mesmo codigo cairiam em salas diferentes.
# Para escalar de verdade seria preciso mover o estado para fora (Redis).
CMD ["python", "-m", "uvicorn", "backend.app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
