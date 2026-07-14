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
    { suspect: "ফেলুদা ফ্যান", cards: ["ডিজিটাল পিস্তল", "পড়ালেখা টেবিল ল্যাম্পের তার", "বিষাক্ত চারমিনার cigarette"] },
    { suspect: "ব্যোমকেশ ভক্ত", cards: ["অ্যান্টিক খঞ্জর", "সায়ানাইড ক্যাপসুল", "পুরানো পকেট ঘড়ির চেইন"] },
    { suspect: "কাকাবাবু অনুসারী", cards: ["ক্রাচের ভেতরের তলোয়ার", "ক্লোরোফর্ম ভেজা রুমাল", "ভারী কাঠের মূর্তি"] },
    { suspect: "মাসুদ রানা স্পাই", cards: ["সাইলেন্সার যুক্ত রিভলভার", "বিষাক্ত লেজার পেন", "গলা কাটার nylon সুতা"] },
    { suspect: "কিরীটী ফলোয়ার", cards: ["আফিমের ওভারডোজ", "হাঁসের পালকের বিষাক্ত কলম", "লোহার হাতুড়ি"] }
];

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomCode, username, peerId }) => {
        const code = roomCode.toUpperCase();
        if (!rooms[code]) {
            rooms[code] = { code, players: [], state: 'lobby', killerCard: null, clues: [] };
        }
        
        if (rooms[code].state !== 'lobby') {
            return socket.emit('errorMsg', 'খেলা ইতিমধ্যে শুরু হয়ে গেছে!');
        }

        rooms[code].players.push({ id: socket.id, username, peerId, role: 'Suspect', cards: [] });
        socket.join(code);
        io.to(code).emit('roomUpdated', rooms[code]);
    });

    socket.on('startGame', (roomCode) => {
        const code = roomCode.toUpperCase();
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
                p.role = 'Goyenda';
                p.cards = [];
                p.assignedSuspectName = "প্রধান গোয়েন্দা";
            } else if (p.id === killer.id) {
                p.role = 'Killer';
                let currentDeck = deckPool[deckIndex++];
                p.assignedSuspectName = currentDeck.suspect;
                p.cards = [...currentDeck.cards];
            } else {
                p.role = 'Suspect';
                let currentDeck = deckPool[deckIndex++];
                p.assignedSuspectName = currentDeck.suspect;
                p.cards = [...currentDeck.cards];
            }
        });

        io.to(code).emit('gameUpdated', room);
    });

    socket.on('killerPickCard', ({ roomCode, card }) => {
        const code = roomCode.toUpperCase();
        if (rooms[code]) {
            rooms[code].killerCard = card;
            rooms[code].state = 'goyenda_clues';
            io.to(code).emit('gameUpdated', rooms[code]);
        }
    });

    socket.on('submitClues', ({ roomCode, clues }) => {
        const code = roomCode.toUpperCase();
        if (rooms[code]) {
            rooms[code].clues = clues;
            rooms[code].state = 'investigation';
            io.to(code).emit('gameUpdated', rooms[code]);
        }
    });

    socket.on('submitAccusation', ({ roomCode, accusedId, accusedCard }) => {
        const code = roomCode.toUpperCase();
        const room = rooms[code];
        if (!room) return;

        const killer = room.players.find(p => p.role === 'Killer');
        const win = (accusedId === killer.id && accusedCard === room.killerCard);

        io.to(code).emit('gameOver', { win, killer, killerCard: room.killerCard });
        delete rooms[code];
    });

    socket.on('disconnect', () => {
        for (let code in rooms) {
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
server.listen(PORT, '0.0.0.0', () => console.log(`Server running smoothly!`));
