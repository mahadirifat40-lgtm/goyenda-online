const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

let rooms = {}; 

const ALL_CARDS = [
    "Kitchen Knife", "Arsenic Poison", "Rope Strands", "Pillow", "Heavy Statue",
    "Broken Wine Glass", "Old Revolver", "Sleeping Pills", "Insulin Syringe", "Iron Rod",
    "Tainted Sweets", "Screwdriver", "Hammer", "Paper Cutter", "Kerosene Flask", 
    "Gold Ring", "Torn Letter", "Bloodied Glove", "Muddy Shoe", "Security Keycard"
];

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomCode, username }) => {
        roomCode = roomCode.toUpperCase().trim();
        socket.join(roomCode);
        
        if (!rooms[roomCode]) {
            rooms[roomCode] = { 
                code: roomCode, 
                players: [], 
                state: 'lobby', 
                clues: null, 
                killerCard: null 
            };
        }
        
        if(!rooms[roomCode].players.some(p => p.id === socket.id)) {
            rooms[roomCode].players.push({ id: socket.id, username, role: null, cards: [] });
        }
        
        socket.roomCode = roomCode;
        io.to(roomCode).emit('roomUpdated', rooms[roomCode]);
    });

    socket.on('startGame', (roomCode) => {
        let room = rooms[roomCode];
        if (!room || room.players.length < 3) return;

        let deck = [...ALL_CARDS].sort(() => Math.random() - 0.5);
        let roles = ['Goyenda', 'Killer'];
        while (roles.length < room.players.length) {
            roles.push('Suspect');
        }
        roles.sort(() => Math.random() - 0.5);

        room.players.forEach((player, idx) => {
            player.role = roles[idx];
            player.cards = [deck.pop(), deck.pop()];
        });

        room.state = 'role_reveal';
        io.to(roomCode).emit('gameUpdated', room);
    });

    socket.on('killerPickCard', ({ roomCode, card }) => {
        let room = rooms[roomCode];
        if (room) {
            room.killerCard = card;
            room.state = 'goyenda_clues';
            io.to(roomCode).emit('gameUpdated', room);
        }
    });

    socket.on('submitClues', ({ roomCode, clues }) => {
        let room = rooms[roomCode];
        if (room) {
            room.clues = clues;
            room.state = 'investigation';
            io.to(roomCode).emit('gameUpdated', room);
        }
    });

    socket.on('submitAccusation', ({ roomCode, accusedId, accusedCard }) => {
        let room = rooms[roomCode];
        if (!room) return;

        let killer = room.players.find(p => p.role === 'Killer');
        let win = (accusedId === killer.id && accusedCard === room.killerCard);

        room.state = 'game_over';
        io.to(roomCode).emit('gameOver', { win, killer, killerCard: room.killerCard, accusedId, accusedCard });
    });

    socket.on('disconnect', () => {
        let roomCode = socket.roomCode;
        if (rooms[roomCode]) {
            rooms[roomCode].players = rooms[roomCode].players.filter(p => p.id !== socket.id);
            if (rooms[roomCode].players.length === 0) {
                delete rooms[roomCode];
            } else {
                io.to(roomCode).emit('roomUpdated', rooms[roomCode]);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Goyendagiri running on port ${PORT}`));