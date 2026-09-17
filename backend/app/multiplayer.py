import asyncio
import json
import logging
import time
from typing import Dict, List, Set, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

class PlayerSession:
    def __init__(self, ws: WebSocket, name: str, version: str):
        self.ws = ws
        self.name = name
        self.version = version
        self.instrument: str | None = None
        self.difficulty: str | None = None
        self.ready: bool = False
        self.load_progress: float = 0.0
        self.score_state: dict = {}
        self.id = id(self)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "instrument": self.instrument,
            "difficulty": self.difficulty,
            "ready": self.ready,
            "loadProgress": self.load_progress,
            "scoreState": self.score_state
        }

class Room:
    def __init__(self):
        self.players: List[PlayerSession] = []
        self.mode: str = "versus"
        self.song_id: str | None = None

    def to_dict(self):
        return {
            "mode": self.mode,
            "songId": self.song_id,
            "players": [p.to_dict() for p in self.players]
        }

    async def broadcast(self, type_: str, payload: dict, exclude: PlayerSession = None):
        msg = json.dumps({"type": type_, "payload": payload})
        for p in self.players:
            if p != exclude:
                try:
                    await p.ws.send_text(msg)
                except Exception:
                    pass

    async def send_state(self):
        await self.broadcast("ROOM_STATE", self.to_dict())

room = Room()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    player = None
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")
            payload = msg.get("payload", {})

            if msg_type == "PING":
                client_time = payload.get("clientTime", 0)
                await websocket.send_text(json.dumps({"type": "PONG", "payload": {"clientTime": client_time, "serverTime": time.time()}}))
                continue

            if msg_type == "JOIN":
                version = payload.get("version", "1")
                name = payload.get("name", "Player")
                if version != "1":
                    await websocket.send_text(json.dumps({"type": "ERROR", "payload": {"message": "Invalid protocol version"}}))
                    await websocket.close()
                    return
                player = PlayerSession(websocket, name, version)
                room.players.append(player)
                await room.send_state()
            
            if not player:
                continue

            if msg_type == "SET_INSTRUMENT":
                player.instrument = payload.get("instrument")
                await room.send_state()
            elif msg_type == "SET_DIFFICULTY":
                player.difficulty = payload.get("difficulty")
                await room.send_state()
            elif msg_type == "SET_READY":
                player.ready = payload.get("ready", False)
                await room.send_state()
            elif msg_type == "SELECT_SONG":
                # Any player can select a song for now
                room.song_id = payload.get("songId")
                room.mode = payload.get("mode", "versus")
                for p in room.players:
                    p.ready = False
                    p.instrument = None
                    p.difficulty = None
                await room.send_state()
            elif msg_type == "LOAD_PROGRESS":
                player.load_progress = payload.get("progress", 0.0)
                await room.send_state()
                # If all ready and loaded, start
                if len(room.players) > 0 and all(p.ready and p.load_progress >= 1.0 for p in room.players):
                    # Start at 3 seconds in the future
                    start_at = time.time() + 3.0
                    await room.broadcast("START_AT", {"timestamp": start_at})
            elif msg_type == "SCORE_UPDATE":
                player.score_state = payload
                # In a real scenario we'd batch this, but for now broadcast immediately or let clients poll
                await room.broadcast("SCOREBOARD", {"playerId": player.id, "state": player.score_state}, exclude=player)
            elif msg_type == "LEAVE":
                break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if player in room.players:
            room.players.remove(player)
            await room.send_state()
