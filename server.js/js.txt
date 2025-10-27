const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function joinRoom(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  ws.roomId = roomId;
}

function leaveRoom(ws) {
  const r = ws.roomId;
  if (!r) return;
  const s = rooms.get(r);
  if (!s) return;
  s.delete(ws);
  if (s.size === 0) rooms.delete(r);
  delete ws.roomId;
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (msg.type === "join") {
      joinRoom(msg.roomId, ws);
      const room = rooms.get(msg.roomId);
      ws.send(JSON.stringify({ type: "joined", players: room.size }));
      room.forEach((c) => {
        if (c !== ws) c.send(JSON.stringify({ type: "peer-joined" }));
      });
    }

    if (msg.type === "state") {
      const room = rooms.get(ws.roomId);
      if (!room) return;
      const payload = JSON.stringify({
        type: "state",
        id: msg.id,
        x: msg.x,
        y: msg.y,
        angle: msg.angle,
        speed: msg.speed,
        timestamp: Date.now(),
      });
      room.forEach((c) => {
        if (c !== ws) c.send(payload);
      });
    }
  });

  ws.on("close", () => {
    const roomId = ws.roomId;
    leaveRoom(ws);
    if (roomId) {
      const r = rooms.get(roomId);
      if (r) {
        r.forEach((c) => {
          c.send(JSON.stringify({ type: "peer-left" }));
        });
      }
    }
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(process.env.PORT || 3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
