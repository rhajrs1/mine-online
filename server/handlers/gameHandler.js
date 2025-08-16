import { calcVictoryInfo, revealTile as coreReveal } from "../gameCore.js";

export class GameHandler {
  constructor(room, game){
    this.room = room;   // Room 인스턴스
    this.game = game;   // 게임 상태(makeGame 결과)
  }

  start(participants, hostId){
    // 모드별로 오버라이드
    this.game.started = true;
    this.game.over = false;
    this.game.scores = {};
    this.game.revealed = new Set();
    this.game.winner = null;
    this.game.overReason = null;
  }

  stop(){
    // 타이머 정리는 Room 쪽에서 맡음(필요 시 오버라이드)
    this.game.started = false;
    this.game.over = false;
  }

  onPlayerLeft(socketId){
    // 필요 시 TURN 핸들러에서 구현
  }

  // 공통: 타일 오픈 처리 + 점수 브로드캐스트 + 종료 판정
  reveal(socketId, x, y){
    if (!this.game.started || this.game.over) {
      this.room.emitError(socketId, "Not started or already over");
      return;
    }

    if (!this.room.participants.includes(socketId)) {
      this.room.emitError(socketId, "Game already started. You can't participate in this round.");
      return;
    }

    const res = coreReveal(this.game, socketId, x, y);

    // 동기화용 revealedTiles 누적(중복 방지)
    if (res && res.updates && Array.isArray(res.updates)) {
      for (const u of res.updates) {
        const k = `${u.x},${u.y}`;
        if (!this.room.revealedTilesSet.has(k)) {
          this.room.revealedTilesSet.add(k);
          this.game.revealedTiles.push(u);
        }
      }
    }

    if (res.error) {
      this.room.emitError(socketId, res.error);
      return;
    }

    // 타일 업데이트 방송 (owner 포함)
    for (const u of res.updates) {
      this.room.emitTileUpdate({ ...u, owner: socketId });
    }

    // 점수/승리 정보 방송 + 종료 판정
    this._broadcastScoreAndMaybeEnd();

    // 이후의 턴/스턴 등은 각 모드 핸들러에서 수행
    this.afterReveal(socketId, res);
  }

  afterReveal(_socketId, _res){
    // 모드별 오버라이드(TURN/REALTIME)
  }

  _broadcastScoreAndMaybeEnd(){
    const g = this.game;
    const totalMines = g.mines;
    const foundSum = Object.values(g.scores).reduce((a,b)=>a+b, 0);
    const minesLeft = totalMines - foundSum;

    // 점수 방송 (victoryInfo 공식 보정)
    this.room.emitScoreUpdate({
      scores: g.scores,
      victoryInfo: calcVictoryInfo(g.scores, g.mines),
      minesLeft
    });

    // 종료 판정 1: 역전 불가
    const arr = Object.entries(g.scores).sort((a,b)=>b[1]-a[1]);
    if (arr.length >= 2){
      const [firstId, firstScore] = arr[0];
      const secondScore = arr[1]?.[1] ?? 0;
      if (firstScore > (secondScore + minesLeft)) {
        this.room.endGame(firstId, `역전 불가: ${firstScore} > ${secondScore} + ${minesLeft}`);
        return;
      }
    }

    // 종료 판정 2: 모든 지뢰 발견
    if (foundSum === totalMines){
      let winnerId = null;
      if (arr.length >= 1) {
        const topScore = arr[0][1];
        const tied = arr.filter(([_, s]) => s === topScore);
        if (tied.length > 1) {
          // 무승부 처리 - 클라 프로토콜 유지: winner:null 로 보내고 reason에 무승부 표기
          this.room.endGame(null, "모든 지뢰 발견: 동점");
        } else {
          winnerId = arr[0][0];
          this.room.endGame(winnerId, "모든 지뢰 발견: 최다 득점");
        }
      } else {
        this.room.endGame(null, "모든 지뢰 발견");
      }
    }
  }
}
