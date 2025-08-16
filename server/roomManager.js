import { createBoardSeed, makeGame } from "./gameCore.js";
import { Room } from "./room.js";

export class RoomManager {
  constructor(io){
    this.io = io;
    this.rooms = new Map(); // roomId -> Room
  }

  getRoomIdOfSocket(socket){
    const ids = Array.from(socket.rooms).filter(r => this.rooms.has(r));
    return ids.length > 0 ? ids[ids.length - 1] : null;
  }

  leaveAllRoomsOfSocket(socket){
    for (const r of socket.rooms) {
      if (this.rooms.has(r)) {
        socket.leave(r);
        const room = this.rooms.get(r);
        if (room) {
          const status = room.leave(socket.id);
          if (status === 'EMPTY') {
            this.rooms.delete(r);
          }
        }
      }
    }
  }

  pickOddRand(min, max){
    let n = Math.floor(Math.random() * (max - min + 1)) + min;
    if (n % 2 === 0) n = (n + 1 <= max) ? n + 1 : n - 1;
    return n;
  }

  createRoom(hostSocket, { width = 16, height = 16, mines = 41, minesRange, name = "P1", mode = 'TURN', stunSmall = 3, stunBig = 10, turnSeconds = 10 } = {}){
    const roomId = Math.random().toString(36).slice(2,8);
    const seed = createBoardSeed();
    const finalMines = minesRange ? this.pickOddRand(minesRange.min, minesRange.max) : mines;
    const game = makeGame({ width, height, mines: finalMines, seed, mode, stunSmall, stunBig, turnSeconds });
    const room = new Room({ io: this.io, roomId, hostId: hostSocket.id, hostName: name, initialGame: game });

    // 룸 옵션 대기 설정(원본과 동일 의미)
    room.pendingOption = { width, height, mode, stunSmall, stunBig, turnSeconds, minesRange: minesRange || {min:41, max:41} };

    this.rooms.set(roomId, room);
    hostSocket.join(roomId);
    hostSocket.emit("room:created", { roomId });
    return room;
  }

  optionUpdate(socket, opt){
    const roomId = this.getRoomIdOfSocket(socket);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    room.updateOption(opt);
  }

  joinRoom(socket, { roomId, name = "P2" }){
    const room = this.rooms.get(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }
    if (room.players.size >= 8) {
      socket.emit("error", { message: "Room full" });
      return;
    }

    // 기존 룸 떠나기
    this.leaveAllRoomsOfSocket(socket);

    room.players.set(socket.id, name);
    socket.join(roomId);

    const canParticipate = !room.game.started;
    room.join(socket.id, name, canParticipate);
  }

  startGame(socket, opts = {}){
    const roomId = this.getRoomIdOfSocket(socket);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || socket.id !== room.hostId) return;

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
    room.pendingOption = cfg;

    const seed = createBoardSeed();
    const finalMines2 = cfg.minesRange ? this.pickOddRand(cfg.minesRange.min, cfg.minesRange.max) : cfg.mines;
    room.startGame({ ...cfg, mines: finalMines2, seed });
  }

  stopGame(socket){
    const roomId = this.getRoomIdOfSocket(socket);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || socket.id !== room.hostId) return;
    room.stopGame();
  }

  reveal(socket, { x, y }){
    const roomId = this.getRoomIdOfSocket(socket);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.handleReveal(socket.id, x, y);
  }

  onDisconnect(socket){
    for (const [roomId, room] of this.rooms) {
      if (room.players.has(socket.id)) {
        socket.leave(roomId);
        const status = room.leave(socket.id);
        if (status === 'EMPTY') this.rooms.delete(roomId);
        break;
      }
    }
  }
}
