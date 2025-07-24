export function buildBoard(w, h) {
  const grid = [];
  const el = document.getElementById('board');
  el.style.setProperty('--w', w);
  el.innerHTML = '';
  for (let y = 0; y < h; ++y) {
    for (let x = 0; x < w; ++x) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      el.appendChild(cell);
      grid.push(cell);
    }
  }
  return grid;
}

// renderBoard(grid, clickHandler, colorMap, lastReveals)
export function renderBoard(grid, onClick, playerColorMap, lastReveals = {}) {
  grid.forEach(cell => {
    cell.onclick = () => {
      const x = Number(cell.dataset.x);
      const y = Number(cell.dataset.y);
      onClick(x, y);
    };
    cell.className = 'cell';
    cell.style.background = '';
    cell.style.boxShadow = '';
    cell.style.border = '';
  });

  // 외곽선 표시 (각 플레이어별로 마지막 클릭 위치)
  // (최초 렌더에서만 사용)
  setCellOutlines(grid, playerColorMap, lastReveals);
}

// **이 함수 추가**
function setCellOutlines(grid, playerColorMap, lastReveals) {
  // 모든 칸 외곽선 초기화
  grid.forEach(cell => cell.style.boxShadow = '');
  // 각 플레이어별 마지막 클릭 위치에만 외곽선 추가
  Object.entries(lastReveals).forEach(([playerId, pos]) => {
    const idx = grid.findIndex(
      cell => Number(cell.dataset.x) === pos.x && Number(cell.dataset.y) === pos.y
    );
    if (idx !== -1 && playerColorMap[playerId]) {
      grid[idx].style.boxShadow = `0 0 0 3px ${playerColorMap[playerId]}`;
    }
  });
}

// updateTile(update, playerColorMap, lastReveals, grid, W, H)
export function updateTile(update, playerColorMap, lastReveals = {}, grid = null, W = null, H = null) {
  const el = document.getElementById('board');
  let cell;
  if (grid && W && H) {
    // grid, W, H가 넘어오면 빠르게 인덱싱
    cell = grid[update.y * W + update.x];
  } else {
    cell = Array.from(el.children).find(
      c => Number(c.dataset.x) === update.x && Number(c.dataset.y) === update.y
    );
  }
  if (!cell) return;

  // 지뢰(boom)만 색칠
  if (update.state === "boom" && update.owner && playerColorMap[update.owner]) {
    cell.style.background = playerColorMap[update.owner];
  } else {
    cell.style.background = ""; // 기본색
  }

  // 모든 칸 외곽선 초기화, 마지막 클릭 칸에만 외곽선
  if (grid && W && H) {
    setCellOutlines(grid, playerColorMap, lastReveals);
  } else {
    // fallback: 직접 초기화
    Array.from(el.children).forEach(cell2 => (cell2.style.boxShadow = ''));
    Object.entries(lastReveals || {}).forEach(([pid, pos]) => {
      if (pos.x === update.x && pos.y === update.y) {
        cell.style.boxShadow = `0 0 0 3px ${playerColorMap[pid]}`;
      }
    });
  }

  if (update.state === "boom") {
    cell.className = "cell boom";
    cell.textContent = "💣";
  } else if (update.state === "revealed") {
    cell.className = "cell rev";
    cell.textContent = update.value > 0 ? update.value : "";
  }
}
