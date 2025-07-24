import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createBoardSeed, revealTile, makeGame } from "./game.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));

const rooms = new Map();

function getRoomId(socket){
  const ids = Array.from(socket.rooms).filter(r => rooms.has(r));
  return ids.length > 0 ? ids[ids.length - 1] : null;
}

function pickOddRand(min, max){
  let n = Math.floor(Math.random() * (max - min + 1)) + min;
  if (n % 2 === 0) n = (n + 1 <= max) ? n + 1 : n - 1;
  return n;
}

function broadcastTurn(roomId){
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("turn:update", { turnPlayer: room.game.turnPlayer });
}

function startTurnTimer(roomId){
  const room = rooms.get(roomId);
  if (!room) return;
  const g = room.game;
  if (g.mode !== 'TURN') return;
  clearTimeout(room.timer);

  io.to(roomId).emit("timer:reset", { remaining: g.turnSeconds });

  room.timer = setTimeout(() => {
    passTurn(roomId, true);
  }, g.turnSeconds * 1000);
}

function passTurn(roomId, isTimeout=false) {
  const room = rooms.get(roomId);
  if (!room) return;
  const g = room.game;
  if (!g.participants) return;
  const ids = g.participants;
  if (!ids.length) return;
  const curIdx = ids.indexOf(g.turnPlayer);

  const nextIdx = (curIdx + 1) % ids.length;
  g.turnPlayer = ids[nextIdx];
  broadcastTurn(roomId);
  startTurnTimer(roomId);
}

function endGame(roomId, winnerId, reason){
  const room = rooms.get(roomId);
  if (!room) return;
  room.game.over = true;
  room.game.started = false;
  room.game.winner = winnerId;
  room.game.overReason = reason;
  clearTimeout(room.timer);
  io.to(roomId).emit("game:over", { winner: winnerId, reason });
}

function calcVictoryInfo(scores, totalMines) {
  const foundSum = Object.values(scores).reduce((a, b) => a + b, 0);
  const minesLeft = totalMines - foundSum;
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return {};
  const [firstId, firstScore] = sorted[0];
  const secondScore = sorted[1]?.[1] ?? 0;

  const victoryInfo = {};
  for (const [id, score] of Object.entries(scores)) {
    // 내가 앞으로 needed개 더 먹으면, 무조건 1등을 역전 or 확정한다.
    // (최고 점수 - 내 점수 + 남은 마인 + 1)
    const topScore = (id === firstId) ? secondScore : firstScore;
    victoryInfo[id] = (topScore - score) + minesLeft + 1;
  }
  return victoryInfo;
}

io.on("connection", socket => {

  socket.on("room:create", ({ width = 16, height = 16, mines = 41, minesRange, name = "P1", mode = 'TURN', stunSmall = 3, stunBig = 10, turnSeconds = 10 } = {}) => {
    const roomId = Math.random().toString(36).slice(2,8);
    const seed = createBoardSeed();
    const finalMines = minesRange ? pickOddRand(minesRange.min, minesRange.max) : mines;
    const game = makeGame({ width, height, mines: finalMines, seed, mode, stunSmall, stunBig, turnSeconds });
    game.revealedTiles = [];
    game.pendingOption = {
      width, height, mode, stunSmall, stunBig, turnSeconds, minesRange: minesRange || {min:41, max:41}
    };
    rooms.set(roomId, { game, players: new Map([[socket.id, name]]), hostId: socket.id, clickLocks: new Map() });
    socket.join(roomId);
    socket.emit("room:created", { roomId });
  });

  // 옵션 변경 (방장만)
  socket.on("option:update", (opt) => {
    const roomId = getRoomId(socket);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    room.game.pendingOption = opt;
    io.to(roomId).emit("option:update", opt);
  });

  socket.on("room:join", async ({ roomId, name = "P2" }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });
    if (room.players.size >= 8) return socket.emit("error", { message: "Room full" });

    for (const r of socket.rooms) {
      if (rooms.has(r)) {
        socket.leave(r);
        const leavingRoom = rooms.get(r);
        if (leavingRoom) {
          leavingRoom.players.delete(socket.id);
          if (leavingRoom.players.size === 0) {
            rooms.delete(r);
          }
        }
      }
    }

    room.players.set(socket.id, name);
    socket.join(roomId);

    const canParticipate = !room.game.started;
    const playersArr = [...room.players].map(([id, nm], idx) => ({ id, name: nm, idx }));
    io.to(roomId).emit("room:joined", { roomId, players: playersArr, hostId: room.hostId, canParticipate });

    const { game } = room;
    io.to(roomId).emit("game:state", {
      seed: game.seed,
      width: game.width,
      height: game.height,
      mines: game.mines,
      started: game.started,
      turnPlayer: game.turnPlayer,
      mode: game.mode,
      stunSmall: game.stunSmall,
      stunBig: game.stunBig,
      turnSeconds: game.turnSeconds
    });

    // 옵션도 동기화
    if (game.pendingOption) {
      socket.emit("option:update", game.pendingOption);
    }
    // 열린 타일 동기화
    if (game.revealedTiles) {
      for (const t of game.revealedTiles) {
        socket.emit("tile:update", t);
      }
    }
    if (game.scores) {
      socket.emit("score:update", { scores: game.scores });
    }
    if (game.over) {
      socket.emit("game:over", { winner: game.winner, reason: game.overReason });
    }
  });

  socket.on("game:start", (opts = {}) => {
    const roomId = getRoomId(socket);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (socket.id !== room.hostId) return;

    const old = room.game;
    const cfg = {
      width: opts.width ?? old.width,
      height: opts.height ?? old.height,
      mines: opts.mines ?? old.mines,
      minesRange: opts.minesRange ?? undefined,
      mode: opts.mode ?? old.mode,
      stunSmall: opts.stunSmall ?? old.stunSmall,
      stunBig: opts.stunBig ?? old.stunBig,
      turnSeconds: opts.turnSeconds ?? old.turnSeconds
    };

    room.game.pendingOption = cfg; // 옵션 갱신

    const seed = createBoardSeed();
    const finalMines2 = cfg.minesRange ? pickOddRand(cfg.minesRange.min, cfg.minesRange.max) : cfg.mines;
    room.game = makeGame({ ...cfg, mines: finalMines2, seed });
    room.clickLocks = new Map();
    room.game.revealedTiles = [];
    room.game.pendingOption = cfg;

    room.game.participants = [...room.players.keys()];

    const g = room.game;
    g.started = true;
    g.over = false;
    g.turnPlayer = room.hostId;

    io.to(roomId).emit("game:state", {
      seed: g.seed,
      width: g.width,
      height: g.height,
      mines: g.mines,
      started: true,
      turnPlayer: g.turnPlayer,
      mode: g.mode,
      stunSmall: g.stunSmall,
      stunBig: g.stunBig,
      turnSeconds: g.turnSeconds
    });

    if (g.mode === 'TURN') {
      broadcastTurn(roomId);
      startTurnTimer(roomId);
    } else {
      io.to(roomId).emit("timer:reset", { remaining: 0 });
    }
  });

  socket.on("game:stop", () => {
    const roomId = getRoomId(socket);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || socket.id !== room.hostId) return;

    room.game.started = false;
    room.game.over = false;
    clearTimeout(room.timer);

    io.to(roomId).emit("game:state", {
      seed: room.game.seed,
      width: room.game.width,
      height: room.game.height,
      mines: room.game.mines,
      started: false,
      turnPlayer: null,
      mode: room.game.mode,
      stunSmall: room.game.stunSmall,
      stunBig: room.game.stunBig,
      turnSeconds: room.game.turnSeconds
    });
  });

  socket.on("tile:reveal", ({ x, y }) => {
    const roomId = getRoomId(socket);
    if (!roomId) return;
    const room = rooms.get(roomId);
    const g = room.game;
    const now = Date.now();

    if (!g.started || g.over) return socket.emit("error", { message: "Not started or already over" });

    if (!g.participants || !g.participants.includes(socket.id)) {
      return socket.emit("error", { message: "Game already started. You can't participate in this round." });
    }

    if (g.mode === 'TURN') {
      if (g.turnPlayer !== socket.id) return socket.emit("error", { message: "Not your turn" });
    } else {
      const lockUntil = room.clickLocks.get(socket.id) || 0;
      if (now < lockUntil) {
        const remain = Math.ceil((lockUntil - now)/1000);
        return socket.emit("stun:active", { remaining: remain });
      }
    }

    const res = revealTile(g, socket.id, x, y);
    if (res && res.updates && Array.isArray(res.updates)) {
      for (const u of res.updates) {
        if (!g.revealedTiles.find(t => t.x === u.x && t.y === u.y)) {
          g.revealedTiles.push(u);
        }
      }
    }

    if (res.error) return socket.emit("error", { message: res.error });

    res.updates.forEach(u => {
      u.owner = socket.id;
      io.to(roomId).emit("tile:update", u);
    });

    // -------------------------------
    // ★ 승리 조건 및 남은 마인 info 계산 추가 ★
    const totalMines = g.mines;
    const foundSum = Object.values(g.scores).reduce((a,b)=>a+b, 0);
    const minesLeft = totalMines - foundSum;
    const arr = Object.entries(g.scores).sort((a,b)=>b[1]-a[1]);
    let firstId = null, firstScore = 0, secondScore = 0;
    if (arr.length >= 1) {
      [firstId, firstScore] = arr[0];
      secondScore = arr[1]?.[1] ?? 0;
    }
    // [변경된 종료 조건]
    if (arr.length >= 2 && firstScore > (secondScore + minesLeft)) {
      io.to(roomId).emit("score:update", {
        scores: g.scores,
        victoryInfo: calcVictoryInfo(g.scores, g.mines),
        minesLeft: minesLeft
      });
      endGame(roomId, firstId, `역전 불가: ${firstScore} > ${secondScore} + ${minesLeft}`);
      return;
    }
    io.to(roomId).emit("score:update", {
      scores: g.scores,
      victoryInfo: calcVictoryInfo(g.scores, g.mines),
      minesLeft: minesLeft
    });
    // -------------------------------

    if (g.mode === 'TURN') {
      if (!res.hitMine) {
        passTurn(roomId, false);
      } else {
        startTurnTimer(roomId);
      }
    } else {
      if (!res.hitMine) {
        const bigOpen = res.updates.length > 10;
        const stunSec = bigOpen ? g.stunBig : g.stunSmall;
        room.clickLocks.set(socket.id, now + stunSec * 1000);
        socket.emit('stun:start', { duration: stunSec });
        io.to(roomId).emit('stun:state', { playerId: socket.id, duration: stunSec });
      }
    }
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms) {
      if (room.players.delete(socket.id)) {
        clearTimeout(room.timer);
        if (room.players.size === 0) rooms.delete(roomId);
        else io.to(roomId).emit("error", { message: "Opponent left" });
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("listening on", PORT));
