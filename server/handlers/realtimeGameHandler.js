import { GameHandler } from "./gameHandler.js";

export class RealtimeGameHandler extends GameHandler {
  start(participants, hostId){
    super.start(participants, hostId);
    // 실시간 모드에서는 턴/타이머 없음. 타이머: 0으로 리셋 방송 유지
    this.room.emitTimerReset(0);
  }

  reveal(socketId, x, y){
    const now = Date.now();
    const lockUntil = this.room.clickLocks.get(socketId) || 0;
    if (now < lockUntil) {
      const remain = Math.ceil((lockUntil - now)/1000);
      this.room.emitStunActive(socketId, remain);
      return;
    }
    super.reveal(socketId, x, y);
  }

  afterReveal(socketId, res){
    const g = this.game;
    if (!res.hitMine) {
      const bigOpen = res.updates.length > 10;
      const stunSec = bigOpen ? g.stunBig : g.stunSmall;
      this.room.clickLocks.set(socketId, Date.now() + stunSec * 1000);
      this.room.emitStunStart(socketId, stunSec);
      this.room.emitStunState(socketId, stunSec);
    }
  }
}
