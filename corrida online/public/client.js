// client.js - jogo arcade 2 players online via WebSocket
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    status: document.getElementById("status"),
    joinBtn: document.getElementById("joinBtn"),
    roomIdEl: document.getElementById("roomId"),
    hint: document.getElementById("hint"),
    myLapsEl: document.getElementById("myLaps"),
    oppLapsEl: document.getElementById("oppLaps"),
    targetLapsEl: document.getElementById("targetLaps"),
    targetLapsEl2: document.getElementById("targetLaps2"),
  };

  // configurações
  const TARGET_LAPS = 3; // altere aqui para X voltas por corrida
  ui.targetLapsEl.textContent = TARGET_LAPS;
  ui.targetLapsEl2.textContent = TARGET_LAPS;

  class Car {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.angle = 0; // rad
      this.speed = 0;
      this.width = 28;
      this.height = 16;
      this.color = color;
      this.laps = 0;
      this.currentCheckpoint = 0;
    }
    update(dt, controls) {
      const ACC = 200; // px/s^2
      const BRAKE = 300;
      const MAX = 420;
      const TURN_SPEED = 3.2; // rad/s

      if (controls.acc) this.speed += ACC * dt;
      else if (controls.rev) this.speed -= BRAKE * dt;
      else this.speed -= Math.sign(this.speed) * 120 * dt;

      if (this.speed > MAX) this.speed = MAX;
      if (this.speed < -120) this.speed = -120;

      const turnFactor = Math.max(0.12, Math.abs(this.speed) / MAX);
      if (controls.left) this.angle -= TURN_SPEED * turnFactor * dt;
      if (controls.right) this.angle += TURN_SPEED * turnFactor * dt;

      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;

      // wrap-around leve
      if (this.x < -200) this.x = canvas.width + 200;
      if (this.x > canvas.width + 200) this.x = -200;
      if (this.y < -200) this.y = canvas.height + 200;
      if (this.y > canvas.height + 200) this.y = -200;
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.roundRect(-this.width/2, -this.height/2, this.width, this.height, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(-6, -this.height/2, 12, this.height/2);
      ctx.restore();
    }
  }

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      if (typeof r === "number") r = {tl: r, tr: r, br: r, bl: r};
      this.beginPath();
      this.moveTo(x + r.tl, y);
      this.arcTo(x + w, y, x + w, y + h, r.tr);
      this.arcTo(x + w, y + h, x, y + h, r.br);
      this.arcTo(x, y + h, x, y, r.bl);
      this.arcTo(x, y, x + w, y, r.tl);
      this.closePath();
    };
  }

  // Criando checkpoints simples (círculos) em ordem no traçado
  // Aqui definimos 6 checkpoints formando um circuito oval - ajuste conforme quiser
  const checkpoints = [
    {x: canvas.width/2, y: 80, r: 30},
    {x: canvas.width-120, y: canvas.height/2 - 60, r: 30},
    {x: canvas.width/2, y: canvas.height - 80, r: 30},
    {x: 120, y: canvas.height/2 + 60, r: 30},
  ];
  // Se quiser mais checkpoints, adicione objetos {x, y, r}

  // jogo
  const localCar = new Car(240, canvas.height/2, "#ff4466");
  const remoteCar = new Car(canvas.width - 240, canvas.height/2, "#66d9ff");

  const controls = { left: false, right: false, acc: false, rev: false };
  const keys = {};
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    updateControlsFromKeys();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    updateControlsFromKeys();
  });

  function updateControlsFromKeys() {
    controls.left = keys["KeyA"] || keys["ArrowLeft"];
    controls.right = keys["KeyD"] || keys["ArrowRight"];
    controls.acc = keys["KeyW"] || keys["ArrowUp"];
    controls.rev = keys["KeyS"] || keys["ArrowDown"];
  }

  // WebSocket
  let ws = null;
  let clientId = String(Math.floor(Math.random()*1e9));
  let roomId = null;
  let lastSend = 0;
  let raceFinished = false;
  let opponentFinished = false;

  ui.joinBtn.addEventListener("click", () => {
    roomId = ui.roomIdEl.value.trim() || "room1";
    connectWS(roomId);
  });

  function connectWS(rid) {
    if (ws) ws.close();
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(protocol + "://" + location.host);
    ui.status.textContent = "Conectando...";
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "join", roomId: rid }));
      ui.status.textContent = "Conectado — Sala: " + rid;
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "joined") {
        ui.status.textContent = `Sala: ${rid} — players: ${msg.players}`;
      } else if (msg.type === "state") {
        // atualizar posição remota
        remoteCar.x = lerp(remoteCar.x, msg.x, 0.18);
        remoteCar.y = lerp(remoteCar.y, msg.y, 0.18);
        remoteCar.angle = lerpAngle(remoteCar.angle, msg.angle, 0.18);
        remoteCar.speed = msg.speed;
      } else if (msg.type === "peer-joined") {
        ui.status.textContent = `Sala: ${rid} — outro jogador entrou`;
      } else if (msg.type === "peer-left") {
        ui.status.textContent = `Sala: ${rid} — outro jogador saiu`;
      } else if (msg.type === "lap") {
        // outro jogador completou volta / mudou checkpoint index
        if (msg.id && msg.id !== clientId) {
          // atualiza contagem do adversário de forma simples
          remoteCar.laps = msg.laps;
          remoteCar.currentCheckpoint = msg.checkpointIndex;
          ui.oppLapsEl.textContent = remoteCar.laps;
          if (remoteCar.laps >= TARGET_LAPS) {
            opponentFinished = true;
            ui.status.textContent = "Oponente terminou a corrida!";
          }
        }
      }
    });
    ws.addEventListener("close", () => {
      ui.status.textContent = "Desconectado";
      ws = null;
    });
    ws.addEventListener("error", () => {
      ui.status.textContent = "Erro na conexão";
    });
  }

  // helpers
  function lerp(a,b,t){ return a + (b-a)*t; }
  function lerpAngle(a,b,t){
    let diff = ((b - a + Math.PI) % (2*Math.PI)) - Math.PI;
    return a + diff * t;
  }

  // checkpoint detection: sequência ordenada
  function checkCheckpointsAndLaps() {
    if (raceFinished) return;

    const cpIndex = localCar.currentCheckpoint;
    const cp = checkpoints[cpIndex];
    const dx = localCar.x - cp.x;
    const dy = localCar.y - cp.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const threshold = cp.r + Math.max(localCar.width, localCar.height) * 0.6;

    if (dist < threshold) {
      // passou no checkpoint correto — avança
      localCar.currentCheckpoint = (localCar.currentCheckpoint + 1) % checkpoints.length;
      // se completou toda a sequência (voltou ao checkpoint 0 -> completou uma volta)
      if (localCar.currentCheckpoint === 0) {
        localCar.laps += 1;
        ui.myLapsEl.textContent = localCar.laps;
        // envia evento de volta ao servidor para notificar o adversário
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "lap",
            id: clientId,
            laps: localCar.laps,
            checkpointIndex: localCar.currentCheckpoint
          }));
        }
        // verificar fim da corrida
        if (localCar.laps >= TARGET_LAPS) {
          raceFinished = true;
          ui.status.textContent = "Você venceu! (completou as voltas)";
        }
      } else {
        // enviamos também atualização de checkpoint para manter o adversário sincronizado
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "lap",
            id: clientId,
            laps: localCar.laps,
            checkpointIndex: localCar.currentCheckpoint
          }));
        }
      }
    }
  }

  // desenha checkpoints
  function drawCheckpoints(ctx) {
    checkpoints.forEach((cp, idx) => {
      ctx.save();
      // destaque do próximo checkpoint local
      const nextIdx = localCar.currentCheckpoint;
      const isNext = idx === nextIdx;
      ctx.globalAlpha = isNext ? 0.95 : 0.5;
      ctx.beginPath();
      ctx.fillStyle = isNext ? "rgba(255,220,80,0.18)" : "rgba(255,255,255,0.06)";
      ctx.strokeStyle = isNext ? "rgba(255,220,80,0.6)" : "rgba(255,255,255,0.12)";
      ctx.lineWidth = isNext ? 3 : 1;
      ctx.arc(cp.x, cp.y, cp.r, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  // track & rendering helpers (pista)
  function drawBackground(ctx) {
    ctx.save();
    ctx.fillStyle = "#10202a";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle = "#26424a";
    const pad = 60;
    ctx.beginPath();
    ctx.roundRect(pad, pad, canvas.width - pad*2, canvas.height - pad*2, 80);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(canvas.width/2, pad + 20);
    ctx.lineTo(canvas.width/2, canvas.height - pad - 20);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  // game loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;

    // update
    localCar.update(dt, controls);
    checkCheckpointsAndLaps();

    // send local state periodically (~16Hz)
    if (ws && ws.readyState === WebSocket.OPEN) {
      const nowMs = Date.now();
      if (nowMs - lastSend > 60) {
        const payload = {
          type: "state",
          id: clientId,
          x: localCar.x,
          y: localCar.y,
          angle: localCar.angle,
          speed: localCar.speed
        };
        ws.send(JSON.stringify(payload));
        lastSend = nowMs;
      }
    }

    // render
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawBackground(ctx);
    drawCheckpoints(ctx);

    // opponent behind local (for readability)
    remoteCar.draw(ctx);
    localCar.draw(ctx);

    // HUD
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.9;
    ctx.font = "14px monospace";
    ctx.fillText(`Vel: ${Math.round(localCar.speed)} px/s`, 12, canvas.height - 12);
    ctx.restore();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // start positions e reset de corrida
  function resetRacePositions() {
    localCar.x = 240; localCar.y = canvas.height/2;
    localCar.angle = 0; localCar.speed = 0;
    localCar.laps = 0; localCar.currentCheckpoint = 0;
    ui.myLapsEl.textContent = "0";
    remoteCar.laps = 0; remoteCar.currentCheckpoint = 0;
    ui.oppLapsEl.textContent = "0";
    raceFinished = false; opponentFinished = false;
  }
  resetRacePositions();

  // friendly helper: when user opens second tab on mesma máquina, teclas podem controlar ambos.
})();

