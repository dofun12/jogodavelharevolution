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

// --- NOVO: Persistência de Dados (Placar Global) ---
// Em um app real, isso seria um banco de dados (SQLite/MongoDB)
let globalStats = {
    p1Wins: 0,
    p2Wins: 0,
    matchesPlayed: 0
};
// ---------------------------------------------------

const rooms = {};

io.on('connection', (socket) => {
    console.log('Conectado:', socket.id);

    // --- NOVO: Enviar placar assim que conectar ---
    socket.emit('updateLeaderboard', globalStats);

    socket.on('createRoom', () => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = { players: [socket.id] };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, player: 1 });
    });

    socket.on('joinRoom', (roomId) => {
        // (Código anterior de joinRoom mantém igual...)
        if (rooms[roomId]) { // Verificação simples
            rooms[roomId].players.push(socket.id);
            socket.join(roomId);
            socket.emit('roomJoined', { roomId, player: 2 });
            io.to(roomId).emit('startGame', { roomId });
        }
    });

    socket.on('makeMove', (data) => socket.to(data.roomId).emit('moveMade', data));
    socket.on('usePower', (data) => socket.to(data.roomId).emit('powerUsed', data));
    socket.on('restartRequest', (roomId) => io.to(roomId).emit('restartGame'));

    // --- NOVO: Registrar Vitória ---
    socket.on('reportWin', (winner) => {
        if (winner === 1) globalStats.p1Wins++;
        if (winner === 2) globalStats.p2Wins++;
        globalStats.matchesPlayed++;

        // Atualiza o placar para TODOS os conectados no servidor
        io.emit('updateLeaderboard', globalStats);
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log('Servidor Rodando em 0.0.0.0:3000');
});