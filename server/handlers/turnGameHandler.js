import { GameHandler } from "./gameHandler.js";

export class TurnGameHandler extends GameHandler {
  start(participants, hostId){
    super.start(participants, hostId);
    this.room.turnPlayer = hostId;
    this.room.broadcastTurn();
    this.room.startTurnTimer(this.game.turnSeconds);
  }

  stop(){
    super.stop();
    this.room.clearTurnTimer();
  }

  onPlayerLeft(socketId){
    if (this.room.turnPlayer === socketId){
      this.room.passTurn(true);
    }
  }

  reveal(socketId, x, y){
    if (this.room.turnPlayer !== socketId) {
      this.room.emitError(socketId, "Not your turn");
      return;
    }
    super.reveal(socketId, x, y);
  }

  afterReveal(_socketId, res){
    // 의도 확인: 안전칸이면 턴 넘김, 지뢰면 턴 유지
    if (!res.hitMine) {
      this.room.passTurn(false);
    } else {
      // 지뢰면 현재 플레이어 유지, 타이머만 리셋
      this.room.startTurnTimer(this.game.turnSeconds);
    }
  }
}
