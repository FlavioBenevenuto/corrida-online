const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};

io.on("connection", (socket) => {
  console.log("Um jogador entrou:", socket.id);

  // Adiciona novo jogador
  players[socket.id] = {
    x: Math.random() * 600,
    y: Math.random() * 400,
    color: `hsl(${Math.random() * 360}, 70%, 50%)`
  };

  socket.emit("init", players);
  socket.broadcast.emit("newPlayer", { id: socket.id, data: players[socket.id] });

  // Movimento do jogador
  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x += data.x;
      players[socket.id].y += data.y;
      io.emit("update", players);
    }
  });

  // Desconexão
  socket.on("disconnect", () => {
    console.log("Jogador saiu:", socket.id);
    delete players[socket.id];
    io.emit("removePlayer", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

