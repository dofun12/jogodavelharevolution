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
    },
    error: () => playTone(150, 'sawtooth', 0.3)
};

// --- UI SYSTEM (TOASTS) ---
function showToast(msg, color='#fff') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.innerText = msg;
    el.style.background = 'rgba(0,0,0,0.9)';
    el.style.borderLeft = `5px solid ${color}`;
    el.style.padding = '15px';
    el.style.color = '#fff';
    el.style.marginBottom = '10px';
    el.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5)';
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

// --- GAME LOGIC ---
const socket = io();

let myPlayer = 0;
let currentRoom = '';
let boardState = [];
let turnPlayer = 1;
let bombMode = false;
let hasBomb = true;
let isGameActive = false; // NOVA VARIÁVEL DE CONTROLE
const BOARD_SIZE = 9;

// --- SOCKET LISTENERS ---

socket.on('updateLeaderboard', (stats) => {
    document.getElementById('score-p1').innerText = stats.p1Wins;
    document.getElementById('score-p2').innerText = stats.p2Wins;
    document.getElementById('score-total').innerText = stats.matchesPlayed;
});

socket.on('roomCreated', (data) => {
    currentRoom = data.roomId;
    myPlayer = 1;
    document.getElementById('room-display').innerText = data.roomId;
    showToast("Sala criada! Aguardando oponente...", "#0ff");
});

socket.on('roomJoined', (data) => {
    currentRoom = data.roomId;
    myPlayer = 2;
    enterGame();
});

socket.on('startGame', () => {
    if(myPlayer === 1) enterGame();
    showToast("JOGO INICIADO!", "#0f0");
    isGameActive = true;
    updateUI();
});

socket.on('opponentLeft', () => {
    showToast("Oponente desconectou!", "#ff0000");
    isGameActive = false; // Trava o jogo
    document.getElementById('turn-indicator').innerText = "OPONENTE SAIU - FIM DE JOGO";
    document.getElementById('turn-indicator').style.color = "#ff0000";
    SFX.error();
});

socket.on('moveMade', (data) => applyMove(data.row, data.col, data.player));

socket.on('powerUsed', (data) => {
    const cell = document.querySelector(`.cell[data-r='${data.r}'][data-c='${data.c}']`);
    cell.innerHTML = '';
    boardState[data.r][data.c] = 0;
    turnPlayer = turnPlayer === 1 ? 2 : 1;
    updateUI();
    SFX.bomb();
    showToast("Oponente usou a BOMBA!", "#ff3333");
});

socket.on('restartGame', () => {
    initBoard();
    showToast("Partida Reiniciada!", "#0ff");
});

socket.on('error', (msg) => {
    showToast(msg, "#ff0000");
    SFX.error();
});

// --- ACTIONS ---

function joinRoom() {
    const code = document.getElementById('room-code').value.toUpperCase();
    if(code) socket.emit('joinRoom', code);
    else showToast("Digite o código da sala!", "#ff0000");
}

function leaveGame() {
    if(confirm("Tem certeza que deseja sair da sala?")) {
        socket.emit('leaveRoom');
        // Reseta UI para Lobby
        document.getElementById('game-ui').style.display = 'none';
        document.getElementById('lobby-ui').style.display = 'block';
        currentRoom = '';
        myPlayer = 0;
        isGameActive = false;
    }
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
    isGameActive = true; // Ativa o jogo

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
    if(!isGameActive) return; // TRAVA SE O JOGO ACABOU
    if(turnPlayer !== myPlayer) {
        showToast("Não é sua vez!", "#ff3333");
        return;
    }

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
            showToast("Selecione uma peça inimiga!", "#ff3333");
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
        isGameActive = false; // TRAVA O JOGO
        SFX.win();
        animateWin(winningLine);

        if(p === myPlayer) {
            socket.emit('reportWin', p);
            showToast("VOCÊ VENCEU!", "#00ff00");
        } else {
            showToast("VOCÊ PERDEU!", "#ff0000");
        }
        updateUI(); // Atualiza texto para mostrar quem ganhou
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
    if(!isGameActive) return;
    if(turnPlayer === myPlayer && hasBomb) {
        bombMode = !bombMode;
        const btn = document.getElementById('btn-bomb');
        btn.style.background = bombMode ? '#ff3333' : 'transparent';
        btn.style.color = bombMode ? '#000' : '#ff3333';
    } else if (!hasBomb) {
        showToast("Você já gastou sua bomba!", "#ff3333");
    }
}

function updateUI() {
    const msg = document.getElementById('turn-indicator');

    if (!isGameActive) {
        // Se o jogo acabou, não muda o texto de turno para não confundir,
        // ou exibe quem venceu se tivermos essa info localmente (opcional)
        // Por enquanto, o toast já avisa quem ganhou.
        return;
    }

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
    if(!currentRoom) return;
    socket.emit('restartRequest', currentRoom);
}