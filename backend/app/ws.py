import asyncio
from typing import Dict, List
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, project_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(project_id, []).append(websocket)

    def disconnect(self, project_id: str, websocket: WebSocket) -> None:
        conns = self._connections.get(project_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns and project_id in self._connections:
            del self._connections[project_id]

    async def broadcast(self, project_id: str, payload: dict) -> None:
        conns = list(self._connections.get(project_id, []))
        dead: List[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(project_id, ws)


ws_manager = ConnectionManager()
