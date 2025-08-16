import { makeGame } from "./gameCore.js";
import { TurnGameHandler } from "./handlers/turnGameHandler.js";
import { RealtimeGameHandler } from "./handlers/realtimeGameHandler.js";

export class Room {
  constructor({ io, roomId, hostId, hostName, initialGame }){
    this.io = io;
    this.roomId = roomId;
    this.hostId = hostId;
    this.players = new Map([[hostId, hostName]]);
    this.participants = []; // 게임 시작 시점에 확정
    this.pendingOption = null;

    this.game = initialGame; // makeGame 결과
    this.handler = null;     // GameHandler 인스턴스
    this.timer = null;       // 턴 타이머
    this.clickLocks = new Map(); // realtime용

    // 동기화용(중복 제거)
    this.revealedTilesSet = new Set();
  }

  // --- broadcast helpers ---
  emit(event, payload){
    this.io.to(this.roomId).emit(event, payload);
  }
  emitError(socketId, message){
    this.io.to(socketId).emit("error", { message });
  }
  emitTileUpdate(update){
    this.emit("tile:update", update);
  }
  emitScoreUpdate(obj){
    this.emit("score:update", obj);
  }
  emitTimerReset(remaining){
    this.emit("timer:reset", { remaining });
  }
  emitTurnUpdate(){
    this.emit("turn:update", { turnPlayer: this.turnPlayer });
  }
  emitStunStart(playerId, duration){
    this.io.to(playerId).emit('stun:start', { duration });
  }
  emitStunState(playerId, duration){
    this.emit('stun:state', { playerId, duration });
  }
  emitStunActive(playerId, remaining){
    this.io.to(playerId).emit('stun:active', { remaining });
  }

  // --- room lifecycle ---
  get stateForBroadcast(){
    const g = this.game;
    return {
      seed: g.seed,
      width: g.width,
      height: g.height,
      mines: g.mines,
      started: g.started,
      turnPlayer: this.turnPlayer ?? null,
      mode: g.mode,
      stunSmall: g.stunSmall,
      stunBig: g.stunBig,
      turnSeconds: g.turnSeconds
    };
  }

  broadcastGameState(startedOverride){
    const s = { ...this.stateForBroadcast };
    if (typeof startedOverride === 'boolean') s.started = startedOverride;
    this.emit("game:state", s);
  }

  updateOption(opt){
    this.pendingOption = opt;
    this.emit("option:update", opt);
  }

  join(socketId, name, canParticipate){
    this.players.set(socketId, name);
    const playersArr = [...this.players].map(([id, nm], idx) => ({ id, name: nm, idx }));
    this.emit("room:joined", { roomId: this.roomId, players: playersArr, hostId: this.hostId, canParticipate });

    // 상태 동기화
    this.emit("game:state", this.stateForBroadcast);

    if (this.pendingOption) {
      this.io.to(socketId).emit("option:update", this.pendingOption);
    }
    // 열린 타일
    if (this.game.revealedTiles?.length) {
      for (const t of this.game.revealedTiles) {
        this.io.to(socketId).emit("tile:update", t);
      }
    }
    if (this.game.scores && Object.keys(this.game.scores).length){
      this.io.to(socketId).emit("score:update", { scores: this.game.scores });
    }
    if (this.game.over){
      this.io.to(socketId).emit("game:over", { winner: this.game.winner, reason: this.game.overReason });
    }
  }

  leave(socketId){
    const removed = this.players.delete(socketId);
    if (!removed) return;

    // 참가자 목록에서 제거
    const idx = this.participants.indexOf(socketId);
    if (idx >= 0) this.participants.splice(idx, 1);

    // 턴 플레이어가 나갔으면 턴 넘기기
    if (this.game?.started && !this.game?.over && this.game.mode === 'TURN' && this.turnPlayer === socketId) {
      this.passTurn(true);
    }

    // 방 정리
    if (this.players.size === 0){
      this.clearTurnTimer();
      return 'EMPTY';
    } else {
      this.emit("error", { message: "Opponent left" });
      return 'STILL';
    }
  }

  // --- game lifecycle ---
  startGame(cfg){
    // 새로운 게임 상태 생성
    const g = makeGame({ ...cfg });
    this.game = g;
    this.clickLocks = new Map();
    this.revealedTilesSet = new Set();
    this.game.revealedTiles = [];
    this.pendingOption = cfg;

    // 참가자 확정(현재 방에 있는 모든 플레이어)
    this.participants = [...this.players.keys()];

    // 모드별 핸들러 생성
    this.handler = (g.mode === 'TURN')
      ? new TurnGameHandler(this, g)
      : new RealtimeGameHandler(this, g);

    // 방송
    g.started = true;
    g.over = false;
    this.turnPlayer = (g.mode === 'TURN') ? this.hostId : null;

    this.broadcastGameState(true);

    // 핸들러 시작
    this.handler.start(this.participants, this.hostId);

    // TURN 모드면 현재 턴 방송
    if (g.mode === 'TURN') this.broadcastTurn();
    else this.emitTimerReset(0);
  }

  stopGame(){
    if (this.handler) this.handler.stop();
    this.clearTurnTimer();
    this.game.started = false;
    this.game.over = false;

    this.broadcastGameState(false);
  }

  endGame(winnerId, reason){
    this.game.over = true;
    this.game.started = false;
    this.game.winner = winnerId;
    this.game.overReason = reason;
    this.clearTurnTimer();
    this.emit("game:over", { winner: winnerId, reason });
  }

  // --- turn timer helpers (TURN 전용) ---
  clearTurnTimer(){
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  startTurnTimer(seconds){
    if (this.game.mode !== 'TURN') return;
    this.clearTurnTimer();
    this.emitTimerReset(seconds);
    this.timer = setTimeout(() => this.passTurn(true), seconds * 1000);
  }

  passTurn(isTimeout=false){
    if (this.game.mode !== 'TURN') return;
    if (!this.participants?.length) return;
    const ids = this.participants;
    const curIdx = ids.indexOf(this.turnPlayer);
    const nextIdx = (curIdx >= 0 ? curIdx : -1) + 1;
    const nidx = ids.length ? (nextIdx % ids.length) : 0;
    this.turnPlayer = ids[nidx];
    this.broadcastTurn();
    this.startTurnTimer(this.game.turnSeconds);
  }

  broadcastTurn(){
    this.emitTurnUpdate();
  }

  // --- reveal entrypoint ---
  handleReveal(socketId, x, y){
    this.handler?.reveal(socketId, x, y);
  }
}
