const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- ESTADO DO SERVIDOR ---
let globalStats = { p1Wins: 0, p2Wins: 0, matchesPlayed: 0 };
const rooms = {};     // Armazena dados da sala: { players: [], gameActive: bool }
const socketRoomMap = {}; // Mapeia socket.id -> roomId (para desconexão rápida)

// --- LOGGER SIMPLES ---
function log(tag, msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] [${tag}] ${msg}`);
}

io.on('connection', (socket) => {
    log('CONNECT', `Jogador conectado: ${socket.id}`);
    socket.emit('updateLeaderboard', globalStats);

    // --- CRIAR SALA ---
    socket.on('createRoom', () => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            players: [socket.id],
            gameActive: true // Controla se jogadas são aceitas
        };
        socketRoomMap[socket.id] = roomId;

        socket.join(roomId);
        socket.emit('roomCreated', { roomId, player: 1 });
        log('ROOM', `Sala ${roomId} criada por ${socket.id}`);
    });

    // --- ENTRAR NA SALA ---
    socket.on('joinRoom', (roomId) => {
        const room = rooms[roomId];

        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            socketRoomMap[socket.id] = roomId;
            socket.join(roomId);

            // Reinicia estado da sala ao entrar o segundo jogador
            room.gameActive = true;

            socket.emit('roomJoined', { roomId, player: 2 });
            io.to(roomId).emit('startGame', { roomId });
            log('ROOM', `Jogador ${socket.id} entrou na sala ${roomId}`);
        } else {
            socket.emit('error', 'Sala cheia ou inexistente!');
            log('ERROR', `Tentativa falha de entrar na sala ${roomId}`);
        }
    });

    // --- JOGADAS (Com Validação) ---
    socket.on('makeMove', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameActive) {
            socket.to(data.roomId).emit('moveMade', data);
            log('GAME', `Jogada na sala ${data.roomId} por P${data.player}`);
        } else {
            log('WARN', `Jogada rejeitada na sala ${data.roomId} (Jogo inativo)`);
        }
    });

    socket.on('usePower', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameActive) {
            socket.to(data.roomId).emit('powerUsed', data);
            log('GAME', `Poder usado na sala ${data.roomId}`);
        }
    });

    // --- FIM DE JOGO / REINÍCIO ---
    socket.on('reportWin', (winner) => {
        const roomId = socketRoomMap[socket.id];
        if (rooms[roomId]) {
            rooms[roomId].gameActive = false; // TRAVA O JOGO NO SERVIDOR

            if (winner === 1) globalStats.p1Wins++;
            if (winner === 2) globalStats.p2Wins++;
            globalStats.matchesPlayed++;

            io.emit('updateLeaderboard', globalStats);
            log('WIN', `Vitória do P${winner} na sala ${roomId}`);
        }
    });

    socket.on('restartRequest', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].gameActive = true; // DESTRAVA O JOGO
            io.to(roomId).emit('restartGame');
            log('GAME', `Jogo reiniciado na sala ${roomId}`);
        }
    });

    // --- SAÍDA / DESCONEXÃO ---
    const handleLeave = () => {
        const roomId = socketRoomMap[socket.id];
        if (roomId && rooms[roomId]) {
            // Remove o jogador da lista
            rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id);

            // Avisa o oponente que sobrou
            io.to(roomId).emit('opponentLeft');
            log('LEAVE', `Jogador saiu da sala ${roomId}.`);

            // Se a sala ficar vazia, deleta
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
                log('CLEAN', `Sala ${roomId} deletada.`);
            }

            delete socketRoomMap[socket.id];
        }
    };

    socket.on('leaveRoom', handleLeave); // Saída manual (botão)
    socket.on('disconnect', () => {      // Saída forçada (fechar aba)
        log('DISCONNECT', `Socket ${socket.id} desconectou.`);
        handleLeave();
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log('--- SERVIDOR GOMOKU ONLINE INICIADO NA PORTA 3000 ---');
});