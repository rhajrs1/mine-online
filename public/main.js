import { buildBoard, renderBoard, updateTile } from "./ui.js";

const socket = io();
let seed, W, H, MINES, grid;
let lastSeed = null;
let iAmHost = false;
let players = [];
let hostId = null;
let timerSec = 0;
let timerHandle = null;
let gameOver = false;
let mode = 'TURN';
let localStunHandle = null;
let oppStuns = {};
let oppStunInterval = null;
let latestScores = {};
let lastReveals = {};
let minesLeft = 0; // 전역변수 선언
let gameStarted = false;
let canParticipate = true;
let victoryInfo = {}; // [NEW] 승리까지 남은 마인 정보
const myId = () => socket.id;

// [추가] 턴타이머를 playerSlot에서 표시
let slotTimerSec = 0;
let slotTimerHandle = null;
let currentTurnPlayerId = null;

const qs = s => document.querySelector(s);
// topbar elements
const startBtn = qs('#start');
const turnEl = qs('#turn');
const timerEl = qs('#timer');
const roomCodeEl = qs('#roomCode');
const board = document.getElementById('board');

const resultEl = qs('#result');
const stunMsgEl = qs('#stunMsg');

const modeSel = qs('#mode');
const stunSmallInput = qs('#stunSmall');
const stunBigInput = qs('#stunBig');
const turnSecondsInput = qs('#turnSeconds');
const wInput = qs('#width');
const hInput = qs('#height');
const minesMinInput = qs('#minesMin');
const minesMaxInput = qs('#minesMax');

const slotColors = [
  '#ffb3ba', '#bae1ff', '#baffc9', '#ffffba',
  '#ffdfba', '#bafff6', '#d0baff', '#ffd6e0'
];

// --------- 색상매핑 ---------
function getPlayerColorMap() {
  const arr = getOrderedPlayers(players, hostId);
  const map = {};
  for(let i=0; i<arr.length; ++i) {
    if(arr[i]) map[arr[i].id] = slotColors[i];
  }
  return map;
}

function getOrderedPlayers(playersRaw, hostId) {
  const host = playersRaw.find(p => p.id === hostId);
  const rest = playersRaw.filter(p => p.id !== hostId);
  const arr = [];
  if (host) arr.push(host);
  arr.push(...rest);
  return arr;
}
function updateAllPlayerSlots() {
  renderPlayerSlots(getOrderedPlayers(players, hostId), latestScores, oppStuns, victoryInfo);
}
function getPlayerColor(playerId) {
  const colorMap = getPlayerColorMap();
  return colorMap[playerId] || "#bbb";
}

function renderPlayerSlots(playersArr, scores = {}, stuns = {}, victory = {}) {
  const colorMap = getPlayerColorMap();
  const container = document.getElementById('playerSlots');
  container.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const pl = playersArr[i];
    const slot = document.createElement('div');
    slot.className = 'player-slot';
    if (pl) {
      slot.style.background = colorMap[pl.id];
      let inner = `<div class="slot-main">
          <span class="slot-name">${pl.name}</span>`;
      // 스턴 표시
      if (stuns[pl.id]) inner += `<span class="slot-stun">스턴 ${stuns[pl.id]}s</span>`;
      // [추가] 승리까지 남은 마인 표시
      if (victory && victory[pl.id] !== undefined) {
        if (victory[pl.id] <= 0) {
          inner += `<span class="slot-victory">🎉승리!</span>`;
        } else {
          inner += `<span class="slot-victory">- ${victory[pl.id]}</span>`;
        }
      }
      // [추가] 타이머 표시(턴 유저일 때만, 턴제 모드에서만)
      if (pl.id === currentTurnPlayerId && slotTimerSec > 0 && mode === 'TURN') {
        inner += `<span class="slot-timer">⏳ ${slotTimerSec}s</span>`;
      }
      inner += `</div><span class="slot-score">${scores[pl.id] ?? 0}</span>`;
      slot.innerHTML = inner;
      // 턴 유저 강조
      if (pl.id === currentTurnPlayerId && mode === 'TURN') slot.classList.add('turn');
      if (pl.id === myId()) slot.classList.add('me');
    } else {
      slot.classList.add('empty');
      slot.innerHTML = `<span class="slot-empty">비어있음</span>`;
    }
    container.appendChild(slot);
  }
}

// ---------- 게임 시작/중지 버튼 ----------
function updateStartStopButton() {
  if (!iAmHost) {
    startBtn.style.display = "none";
    return;
  }
  startBtn.style.display = "inline-block";
  if (gameStarted) {
    startBtn.textContent = "게임 중지";
    startBtn.disabled = false;
  } else {
    startBtn.textContent = "게임 시작";
    startBtn.disabled = !(players.length >= 2 && iAmHost);
  }
}

function updateMinesLeftBar() {
  const el = document.getElementById('minesLeft');
  if (el) el.textContent = `💣 x ${minesLeft}`;
}

function updateBoardHighlight() {
  if (currentTurnPlayerId === myId() && mode === 'TURN' && gameStarted && !gameOver) {
    board.classList.add('my-turn');
  } else {
    board.classList.remove('my-turn');
  }
}

// ---------- 이벤트 핸들러 ----------
qs('#create').onclick = () => {
  socket.emit('room:create', collectOptionsForCreate());
};
qs('#join').onclick = () => {
  socket.emit('room:join', { roomId: qs('#roomId').value.trim(), name: qs('#name').value });
};
startBtn.onclick = () => {
  if (!iAmHost) return;
  if (!gameStarted) {
    socket.emit('game:start', collectOptionsForStart());
  } else {
    socket.emit('game:stop');
  }
};

function collectOptionsForCreate(){
  return {
    width: Number(wInput.value),
    height: Number(hInput.value),
    name: qs('#name').value,
    mode: modeSel.value,
    stunSmall: Number(stunSmallInput.value),
    stunBig: Number(stunBigInput.value),
    turnSeconds: Number(turnSecondsInput.value),
    minesRange: { min: Number(minesMinInput.value), max: Number(minesMaxInput.value) }
  };
}
function collectOptionsForStart(){
  return {
    width: Number(wInput.value),
    height: Number(hInput.value),
    mode: modeSel.value,
    stunSmall: Number(stunSmallInput.value),
    stunBig: Number(stunBigInput.value),
    turnSeconds: Number(turnSecondsInput.value),
    minesRange: { min: Number(minesMinInput.value), max: Number(minesMaxInput.value) }
  };
}

// [옵션 변경 동기화 추가 - 방장만 서버에 전송]
[wInput, hInput, modeSel, stunSmallInput, stunBigInput, turnSecondsInput, minesMinInput, minesMaxInput].forEach(el => {
  el.addEventListener('change', () => {
    if (iAmHost) {
      const opt = {
        width: Number(wInput.value),
        height: Number(hInput.value),
        mode: modeSel.value,
        stunSmall: Number(stunSmallInput.value),
        stunBig: Number(stunBigInput.value),
        turnSeconds: Number(turnSecondsInput.value),
        minesRange: { min: Number(minesMinInput.value), max: Number(minesMaxInput.value) }
      };
      socket.emit('option:update', opt);
    }
  });
});

modeSel.addEventListener('change', ()=>{
  toggleRealtimeInputs(modeSel.value === 'REALTIME');
});
function toggleRealtimeInputs(show){
  document.querySelectorAll('.realtime-only').forEach(el=> el.style.display = show ? 'flex' : 'none');
  document.querySelectorAll('.turn-only').forEach(el=> el.style.display = show ? 'none' : 'flex');
}
toggleRealtimeInputs(false);

// ========== SOCKET EVENTS ==========
socket.on('room:created', ({ roomId }) => {
  roomCodeEl.textContent = `방 코드: ${roomId}`;
  iAmHost = true;
  updateStartStopButton();
});
socket.on('room:joined', ({ roomId, players: p, hostId: hId }) => {
  roomCodeEl.textContent = `방 코드: ${roomId}`;
  players = p;
  hostId = hId;
  iAmHost = (socket.id === hostId);
  updateAllPlayerSlots();
  updateStartStopButton();
});

socket.on('game:state', (st) => {
  ({ seed, width: W, height: H, mines: MINES, mode } = st);
  gameStarted = !!st.started;
  canParticipate = !st.started || (players.find(p=>p.id === myId()) && st.started);
  gameOver = false;
  const newGame = seed !== lastSeed;
  if (newGame) {
    lastSeed = seed;
    resetBoard();
    grid = buildBoard(W, H);
    lastReveals = {};
    renderBoard(grid, (x, y) => {
      if (!gameOver && !isStunned() && canParticipate && gameStarted) {
        socket.emit('tile:reveal', { x, y });
      }
    }, getPlayerColorMap(), lastReveals);
    document.getElementById('minesLeft').classList.remove('hidden');
    document.getElementById('board').classList.remove('hidden');
    hideResult();
    oppStuns = {};
    latestScores = {};
  }
  lockOptions(gameStarted && !gameOver);
  updateAllPlayerSlots();
  updateStartStopButton();

  // [수정] TURN 모드에서는 timerEl 항상 숨김
  if (mode === "TURN") {
    timerEl.textContent = "";
    timerEl.style.display = "none";
  } else {
    stopLocalTimer();
    timerEl.textContent = "";
    timerEl.style.display = "";
  }
  updateBoardHighlight();
});

// 옵션 동기화 처리 추가
socket.on('option:update', (opt) => {
  wInput.value = opt.width;
  hInput.value = opt.height;
  modeSel.value = opt.mode;
  stunSmallInput.value = opt.stunSmall;
  stunBigInput.value = opt.stunBig;
  turnSecondsInput.value = opt.turnSeconds;
  minesMinInput.value = opt.minesRange.min;
  minesMaxInput.value = opt.minesRange.max;
  toggleRealtimeInputs(opt.mode === 'REALTIME');
});

// [변경] turn:update에서 현재 턴플레이어 갱신
socket.on('turn:update', ({ turnPlayer }) => {
  const prev = currentTurnPlayerId;
  currentTurnPlayerId = turnPlayer;
  renderPlayerSlots(players, latestScores, oppStuns, victoryInfo);
  updateBoardHighlight();
});

// [변경] timer:reset에서 slotTimer 시작
socket.on('timer:reset', ({ remaining }) => {
  slotTimerSec = remaining;
  updateSlotTimer();
  updateBoardHighlight();
});

function updateSlotTimer() {
  clearInterval(slotTimerHandle);
  renderPlayerSlots(players, latestScores, oppStuns, victoryInfo);
  if (slotTimerSec > 0) {
    slotTimerHandle = setInterval(() => {
      slotTimerSec -= 1;
      renderPlayerSlots(players, latestScores, oppStuns, victoryInfo);
      if (slotTimerSec <= 0) {
        clearInterval(slotTimerHandle);
        slotTimerHandle = null;
      }
    }, 1000);
  }
}

socket.on('tile:update', (u) => {
  if(!gameOver) {
    if (u.owner) lastReveals[u.owner] = { x: u.x, y: u.y };
    updateTile(u, getPlayerColorMap(), lastReveals, grid, W, H);
  }
});
socket.on('score:update', ({ scores, victoryInfo: vinfo, minesLeft: left }) => {
  latestScores = scores;
  victoryInfo = vinfo || {};
  if (typeof left === 'number') minesLeft = left;
  updateAllPlayerSlots();
  updateMinesLeftBar();
});
socket.on('stun:start', ({ duration }) => startLocalStun(duration));
socket.on('stun:active', ({ remaining }) => startLocalStun(remaining));
socket.on('stun:state', ({ playerId, duration }) => {
  if(playerId === socket.id) return;
  startOppStun(playerId, duration);
  updateAllPlayerSlots();
});
socket.on('game:over', ({ winner, reason }) => {
  stopLocalTimer();
  gameOver = true;
  gameStarted = false;
  updateStartStopButton();
  updateBoardHighlight();
  const p = players.find(v=>v.id===winner);
  showResult(`${p ? p.name : winner} 승리! ${reason || ''}`);
  lockOptions(false);
  updateAllPlayerSlots();
});
socket.on('error', ({ message }) => console.warn(message));

// ---------- HELPERS ----------
function updateTurn(pid){
  if(mode !== 'TURN'){ turnEl.textContent = ''; return; }
  const p = players.find(v=>v.id===pid);
  if(!p){ turnEl.textContent = ''; return; }
  turnEl.innerHTML = `<span class="dot" style="background:${getPlayerColor(p.id)}"></span> 턴: ${p.name}`;
}

// 타이머를 playerSlot만에서 관리하게 되므로 stopLocalTimer만 정리
function stopLocalTimer() {
  clearInterval(slotTimerHandle);
  slotTimerHandle = null;
  slotTimerSec = 0;
  timerEl.textContent = '';
}

function showResult(text){
  resultEl.textContent = text;
  resultEl.classList.remove('hidden');
}
function hideResult(){
  resultEl.textContent = '';
  resultEl.classList.add('hidden');
}
function resetBoard(){
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
}
function lockOptions(lock){
  const disabled = lock || !iAmHost;
  [modeSel, stunSmallInput, stunBigInput, turnSecondsInput, wInput, hInput, minesMinInput, minesMaxInput].forEach(el=> el.disabled = disabled);
  toggleRealtimeInputs(modeSel.value === 'REALTIME');
}
function startLocalStun(sec){
  clearInterval(localStunHandle);
  let left = sec;
  const slot = document.getElementById('stunSlot');
  slot.style.visibility = 'visible';
  stunMsgEl.classList.remove('hidden');
  const me = players.find(pl=>pl.id===myId());
  if(me) stunMsgEl.style.background = getPlayerColor(me.id);
  stunMsgEl.textContent = `스턴: ${left}s`;
  localStunHandle = setInterval(()=>{
    left -= 1;
    if(left <= 0){
      clearInterval(localStunHandle);
      stunMsgEl.classList.add('hidden');
      stunMsgEl.textContent = '';
    } else {
      stunMsgEl.textContent = `스턴: ${left}s`;
    }
  },1000);
}
function startOppStun(pid, sec){
  oppStuns[pid] = sec;
  if(!oppStunInterval){
    oppStunInterval = setInterval(()=>{
      let changed = false;
      Object.keys(oppStuns).forEach(id=>{
        oppStuns[id] -= 1;
        if(oppStuns[id] <= 0){ delete oppStuns[id]; changed = true; }
        else changed = true;
      });
      if(changed) updateAllPlayerSlots();
      if(Object.keys(oppStuns).length===0){
        clearInterval(oppStunInterval);
        oppStunInterval = null;
      }
    },1000);
  }
}
function isStunned(){
  return !stunMsgEl.classList.contains('hidden');
}
