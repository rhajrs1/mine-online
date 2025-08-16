export function createBoardSeed(){
  return Math.floor(Math.random() * 2 ** 31);
}

function rng(seed){
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

export function makeGame({ width, height, mines, seed, mode = 'TURN', stunSmall = 3, stunBig = 10, turnSeconds = 10 }){
  return {
    width,
    height,
    mines,
    seed,
    mode,          // 'TURN' | 'REALTIME'
    stunSmall,     // seconds
    stunBig,       // seconds
    turnSeconds,   // seconds for TURN mode
    started: false,
    over: false,
    turnPlayer: null,
    revealed: new Set(),
    scores: {},
    mineSet: null,
    winner: null,
    overReason: null,
    // 동기화용(룸이 소유하던 것과 동일 의미)
    revealedTiles: [],
  };
}

export function lazyMineSet(game){
  if (game.mineSet) return game.mineSet;
  const r = rng(game.seed);
  const coords = [];
  for (let y = 0; y < game.height; y++) for (let x = 0; x < game.width; x++) coords.push([x, y]);
  for (let i = coords.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    [coords[i], coords[j]] = [coords[j], coords[i]];
  }
  const set = new Set(coords.slice(0, game.mines).map(([x, y]) => `${x},${y}`));
  game.mineSet = set;
  return set;
}

export function neighbors(game, x, y){
  const res = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
    if (dx || dy){
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < game.width && ny < game.height) res.push([nx, ny]);
    }
  }
  return res;
}

export function countAdjacent(game, x, y){
  const mines = lazyMineSet(game);
  return neighbors(game, x, y).reduce((c, [nx, ny]) => c + mines.has(`${nx},${ny}`), 0);
}

export function revealTile(game, pid, x, y){
  const key = `${x},${y}`;
  if (game.revealed.has(key)) return { error: "Already revealed" };

  const mines = lazyMineSet(game);
  const isMine = mines.has(key);
  game.revealed.add(key);

  game.scores[pid] = (game.scores[pid] || 0) + (isMine ? 1 : 0);

  const updates = [];
  if (isMine){
    updates.push({ x, y, state: "boom", value: -1 });
    return { updates, hitMine: true };
  }

  const value = countAdjacent(game, x, y);
  updates.push({ x, y, state: "revealed", value });
  if (value === 0){
    const stack = neighbors(game, x, y);
    while (stack.length){
      const [cx, cy] = stack.pop();
      const ck = `${cx},${cy}`;
      if (game.revealed.has(ck) || mines.has(ck)) continue;
      game.revealed.add(ck);
      const v = countAdjacent(game, cx, cy);
      updates.push({ x: cx, y: cy, state: "revealed", value: v });
      if (v === 0) stack.push(...neighbors(game, cx, cy));
    }
  }
  return { updates, hitMine: false };
}

// 승리 정보: "어떻게 분배돼도" 1등 확정까지 내가 더 먹어야 하는 최소 개수
export function calcVictoryInfo(scores, totalMines) {
  const foundSum = Object.values(scores).reduce((a, b) => a + b, 0);
  const minesLeft = totalMines - foundSum;
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return {};
  const [firstId, firstScore] = sorted[0];
  const secondScore = sorted[1]?.[1] ?? 0;

  const victoryInfo = {};
  for (const [id, score] of Object.entries(scores)) {
    const topScore = (id === firstId) ? secondScore : firstScore;
    const diff = topScore - score;
    // needed = floor((diff + minesLeft)/2) + 1, 최소 0
    const needed = Math.max(0, Math.floor((diff + minesLeft) / 2) + 1);
    victoryInfo[id] = needed;
  }
  return victoryInfo;
}
