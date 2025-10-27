const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 600;

let players = {};
let keys = {};

socket.on("init", (data) => {
  players = data;
});

socket.on("newPlayer", ({ id, data }) => {
  players[id] = data;
});

socket.on("update", (data) => {
  players = data;
});

socket.on("removePlayer", (id) => {
  delete players[id];
});

document.addEventListener("keydown", (e) => (keys[e.key] = true));
document.addEventListener("keyup", (e) => (keys[e.key] = false));

function move() {
  let dx = 0, dy = 0;
  if (keys["w"]) dy -= 5;
  if (keys["s"]) dy += 5;
  if (keys["a"]) dx -= 5;
  if (keys["d"]) dx += 5;

  if (dx !== 0 || dy !== 0) {
    socket.emit("move", { x: dx, y: dy });
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let id in players) {
    const p = players[id];
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 40, 40);
  }
}

function gameLoop() {
  move();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
