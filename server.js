const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const SUSPECT_DECKS = [
    { suspect: "ফেলুদা ফ্যান", cards: ["ডিজিটাল পিস্তল", "টেবিল ল্যাম্পের তার", "বিষাক্ত চারমিনার cigarette"] },
    { suspect: "ব্যোমকেশ ভক্ত", cards: ["অ্যান্টিক খঞ্জর", "সায়ানাইড ক্যাপসুল", "পকেট ঘড়ির চেইন"] },
    { suspect: "কাকাবাবু অনুসারী", cards: ["ক্রাচের তলোয়ার", "ক্লোরোফর্ম রুমাল", "ভারী কাঠের মূর্তি"] },
    { suspect: "মাসুদ রানা স্পাই", cards: ["সাইলেন্সার রিভলভার", "বিষাক্ত লেজার পেন", "নাইলন সুতা"] }
];

function shuffle(array) { return array.sort(() => Math.random() - 0.5); }

io.on('connection', (socket) => {
    
    socket.on('joinRoom', ({ roomCode, username }) => {
        const code = roomCode.toUpperCase().trim();
        const name = username.trim();
        if (!code || !name) return;

        if (!rooms[code]) {
            rooms[code] = { code, players: [], state: 'lobby', killerCard: null, clues: [] };
        }
        
        // একই নামে কেউ অলরেডি রুমে থাকলে তাকে নতুন সকেটে কানেক্ট করা
        let existingPlayer = rooms[code].players.find(p => p.username.toLowerCase() === name.toLowerCase());
        if (!existingPlayer) {
            rooms[code].players.push({ 
                id: socket.id, username: name, role: 'Suspect', cards: [], points: 0
            });
        } else {
            existingPlayer.id = socket.id;
        }

        socket.join(code);
        socket.roomCode = code;
        socket.username = name;
        io.to(code).emit('roomUpdated', rooms[code]);
    });

    socket.on('startGame', (roomCode) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];
        if (!room || room.players.length < 3) return;

        room.state = 'role_reveal';
        room.clues = [];
        room.killerCard = null;

        let shuffledPlayers = shuffle([...room.players]);
        let goyenda = shuffledPlayers[0];
        let killer = shuffledPlayers[1];
        let deckPool = shuffle([...SUSPECT_DECKS]);
        let deckIndex = 0;

        room.players.forEach(p => {
            if (p.id === goyenda.id) {
                p.role = 'Goyenda'; p.cards = []; p.assignedSuspectName = "প্রধান গোয়েন্দা";
            } else if (p.id === killer.id) {
                p.role = 'Killer';
                let deck = deckPool[deckIndex++];
                p.assignedSuspectName = deck ? deck.suspect : "সন্দেহভাজন";
                p.cards = deck ? [...deck.cards] : ["ছুরি", "দড়ি", "বিষ"];
            } else {
                p.role = 'Suspect';
                let deck = deckPool[deckIndex++];
                p.assignedSuspectName = deck ? deck.suspect : "সন্দেহভাজন";
                p.cards = deck ? [...deck.cards] : ["ছুরি", "দড়ি", "বিষ"];
            }
        });
        io.to(code).emit('gameUpdated', room);
    });

    socket.on('killerPickCard', ({ roomCode, card }) => {
        const code = roomCode.toUpperCase().trim();
        if (rooms[code]) {
            rooms[code].killerCard = card;
            rooms[code].state = 'goyenda_clues';
            io.to(code).emit('gameUpdated', rooms[code]);
        }
    });

    socket.on('submitClues', ({ roomCode, clues }) => {
        const code = roomCode.toUpperCase().trim();
        if (rooms[code]) {
            rooms[code].clues = clues;
            rooms[code].state = 'investigation';
            io.to(code).emit('gameUpdated', rooms[code]);
        }
    });

    socket.on('submitAccusation', ({ roomCode, accusedId, accusedCard }) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];
        if (!room) return;

        const killer = room.players.find(p => p.role === 'Killer');
        const win = (accusedId === killer.id && accusedCard === room.killerCard);

        room.players.forEach(p => {
            let ptsToAdd = 0;
            if (win) {
                if (p.role === 'Goyenda') ptsToAdd = 3;
                if (p.role === 'Suspect') ptsToAdd = 2;
            } else {
                if (p.role === 'Killer') ptsToAdd = 3;
            }
            p.points += ptsToAdd;
        });

        const sortedLeaderboard = [...room.players].sort((a,b) => b.points - a.points);
        io.to(code).emit('gameOver', { win, killer, killerCard: room.killerCard, roomData: room, leaderboard: sortedLeaderboard });
        room.state = 'lobby'; 
    });

    socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
            if (rooms[code].players.length === 0) {
                delete rooms[code];
            } else {
                io.to(code).emit('roomUpdated', rooms[code]);
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`Basic Goyendagiri Game is running on port ${PORT}`));
