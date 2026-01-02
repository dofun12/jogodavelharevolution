/* public/game.js */

// --- AUDIO SYSTEM ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, type, dur, vol=0.1) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}

const SFX = {
    move: () => playTone(300, 'sine', 0.1),
    bomb: () => { playTone(100, 'sawtooth', 0.4); if(navigator.vibrate) navigator.vibrate(200); },
    win: () => {
        [0, 100, 200, 300, 400].forEach((t, i) => setTimeout(() => playTone(400 + (i*100), 'square', 0.2), t));
        if(navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    }
};

// --- GAME LOGIC ---
const socket = io(); // Conecta automaticamente

let myPlayer = 0;
let currentRoom = '';
let boardState = [];
let turnPlayer = 1;
let bombMode = false;
let hasBomb = true;
const BOARD_SIZE = 9;

// Socket Listeners
socket.on('updateLeaderboard', (stats) => {
    document.getElementById('score-p1').innerText = stats.p1Wins;
    document.getElementById('score-p2').innerText = stats.p2Wins;
    document.getElementById('score-total').innerText = stats.matchesPlayed;
});

socket.on('roomCreated', (data) => {
    currentRoom = data.roomId;
    myPlayer = 1;
    document.getElementById('room-display').innerText = data.roomId;
});

socket.on('roomJoined', (data) => {
    currentRoom = data.roomId;
    myPlayer = 2;
    enterGame();
});

socket.on('startGame', () => {
    if(myPlayer === 1) enterGame();
});

socket.on('moveMade', (data) => applyMove(data.row, data.col, data.player));

socket.on('powerUsed', (data) => {
    const cell = document.querySelector(`.cell[data-r='${data.r}'][data-c='${data.c}']`);
    cell.innerHTML = '';
    boardState[data.r][data.c] = 0;
    turnPlayer = turnPlayer === 1 ? 2 : 1;
    updateUI();
    SFX.bomb();
});

socket.on('restartGame', initBoard);

// Funções
function joinRoom() {
    const code = document.getElementById('room-code').value.toUpperCase();
    if(code) socket.emit('joinRoom', code);
}

function enterGame() {
    document.getElementById('lobby-ui').style.display = 'none';
    document.getElementById('game-ui').style.display = 'flex';
    initBoard();
}

function initBoard() {
    const b = document.getElementById('board');
    b.innerHTML = '';
    boardState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
    turnPlayer = 1;
    hasBomb = true;
    bombMode = false;

    for(let r=0; r<BOARD_SIZE; r++) {
        for(let c=0; c<BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.onclick = () => handleClick(r, c);
            b.appendChild(cell);
        }
    }
    updateUI();
}

function handleClick(r, c) {
    if(turnPlayer !== myPlayer) return;

    if(bombMode) {
        if(boardState[r][c] !== 0 && boardState[r][c] !== myPlayer) {
            socket.emit('usePower', { roomId: currentRoom, r, c, player: myPlayer });
            const cell = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
            cell.innerHTML = '';
            boardState[r][c] = 0;
            hasBomb = false;
            bombMode = false;
            turnPlayer = turnPlayer === 1 ? 2 : 1;
            updateUI();
            SFX.bomb();
        } else {
            alert("Clique numa peça INIMIGA!");
        }
        return;
    }

    if(boardState[r][c] === 0) {
        socket.emit('makeMove', { roomId: currentRoom, row: r, col: c, player: myPlayer });
        applyMove(r, c, myPlayer);
    }
}

function applyMove(r, c, p) {
    boardState[r][c] = p;
    const cell = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
    cell.innerHTML = p === 1 ? '<div class="piece p1"></div>' : '<div class="piece p2"></div>';
    SFX.move();

    const winningLine = checkWin(r, c, p);
    if(winningLine) {
        SFX.win();
        animateWin(winningLine);
        if(p === myPlayer) socket.emit('reportWin', p);
        setTimeout(() => alert(`JOGADOR ${p} VENCEU!`), 500);
    } else {
        turnPlayer = turnPlayer === 1 ? 2 : 1;
        updateUI();
    }
}

function checkWin(row, col, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let [dr, dc] of directions) {
        let line = [[row, col]];
        let r = row + dr, c = col + dc;
        while(r>=0 && r<BOARD_SIZE && c>=0 && c<BOARD_SIZE && boardState[r][c] === player) {
            line.push([r, c]); r+=dr; c+=dc;
        }
        r = row - dr; c = col - dc;
        while(r>=0 && r<BOARD_SIZE && c>=0 && c<BOARD_SIZE && boardState[r][c] === player) {
            line.push([r, c]); r-=dr; c-=dc;
        }
        if(line.length === 5) return line;
    }
    return null;
}

function animateWin(cells) {
    cells.forEach(([r,c], i) => {
        setTimeout(() => {
            const el = document.querySelector(`.cell[data-r='${r}'][data-c='${c}'] .piece`);
            if(el) el.classList.add('win-anim');
        }, i * 100);
    });
}

function toggleBomb() {
    if(turnPlayer === myPlayer && hasBomb) {
        bombMode = !bombMode;
        document.getElementById('btn-bomb').style.background = bombMode ? '#ff3333' : 'transparent';
        document.getElementById('btn-bomb').style.color = bombMode ? '#000' : '#ff3333';
    }
}

function updateUI() {
    const msg = document.getElementById('turn-indicator');
    const isMyTurn = turnPlayer === myPlayer;
    msg.innerText = isMyTurn ? "SUA VEZ" : "VEZ DO OPONENTE";
    msg.style.color = isMyTurn ? "#0f0" : "#888";

    if(!hasBomb) {
        const btn = document.getElementById('btn-bomb');
        btn.style.opacity = 0.3;
        btn.style.textDecoration = 'line-through';
    }
}

function requestRestart() {
    socket.emit('restartRequest', currentRoom);
}