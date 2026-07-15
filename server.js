const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

// প্রতিটি সন্দেহভাজন চরিত্রের নাম, ইউনিক অবতার (PNG) এবং প্রতিটি কার্ডের জন্য ছবি ও আইকন সেট করা হয়েছে
const SUSPECT_DECKS = [
    { 
        suspect: "ফেলুদা ফ্যান", 
        avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=feluda", // শার্লক/ডিটেক্টিভ স্টাইল অবতার
        cards: [
            { name: "ডিজিটাল পিস্তল", icon: "🔫", img: "https://images.unsplash.com/photo-1595590424283-b8f17842773f?w=150&q=80" },
            { name: "টেবিল ল্যাম্পের তার", icon: "🔌", img: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=150&q=80" },
            { name: "বিষাক্ত চারমিনার", icon: "🚬", img: "https://images.unsplash.com/photo-1556997685-309989c1aa82?w=150&q=80" }
        ] 
    },
    { 
        suspect: "ব্যোমকেশ ভক্ত", 
        avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=byomkesh", 
        cards: [
            { name: "অ্যান্টিক খঞ্জর", icon: "🗡️", img: "https://images.unsplash.com/photo-1599819811279-d5ad9cccf838?w=150&q=80" },
            { name: "সায়ানাইড ক্যাপসুল", icon: "💊", img: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=150&q=80" },
            { name: "পকেট ঘড়ির চেইন", icon: "⛓️", img: "https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?w=150&q=80" }
        ] 
    },
    { 
        suspect: "কাকাবাবু অনুসারী", 
        avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=kakababu", 
        cards: [
            { name: "ক্রাচের তলোয়ার", icon: "⚔️", img: "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=150&q=80" },
            { name: "ক্লোরোফর্ম রুমাল", icon: "🧼", img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=150&q=80" },
            { name: "ভারী কাঠের মূর্তি", icon: "🗿", img: "https://images.unsplash.com/photo-1518929458119-e5bf444c30f4?w=150&q=80" }
        ] 
    },
    { 
        suspect: "মাসুদ রানা স্পাই", 
        avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=rana", 
        cards: [
            { name: "সাইলেন্সার রিভলভার", icon: "🔫", img: "https://images.unsplash.com/photo-1534353436294-0dbd4bdac845?w=150&q=80" },
            { name: "বিষাক্ত লেজার পেন", icon: "🖊️", img: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=150&q=80" },
            { name: "নাইলন সুতা", icon: "🧵", img: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=150&q=80" }
        ] 
    }
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
        
        let existingPlayer = rooms[code].players.find(p => p.username.toLowerCase() === name.toLowerCase());
        if (!existingPlayer) {
            rooms[code].players.push({ 
                id: socket.id, username: name, role: 'Suspect', cards: [], points: 0, assignedSuspectName: "", avatar: ""
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
                p.role = 'Goyenda'; 
                p.cards = []; 
                p.assignedSuspectName = "প্রধান গোয়েন্দা";
                p.avatar = "https://api.dicebear.com/7.x/bottts/svg?seed=goyenda-boss"; // বিশেষ রোবট/গোয়েন্দা লোগো
            } else {
                let deck = deckPool[deckIndex++];
                if (p.id === killer.id) {
                    p.role = 'Killer';
                } else {
                    p.role = 'Suspect';
                }
                p.assignedSuspectName = deck ? deck.suspect : "সন্দেহভাজন";
                p.avatar = deck ? deck.avatar : "https://api.dicebear.com/7.x/adventurer/svg?seed=suspect";
                p.cards = deck ? [...deck.cards] : [];
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

    socket.on('submitAccusation', ({ roomCode, accusedId, accusedCardName }) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];
        if (!room) return;

        const killer = room.players.find(p => p.role === 'Killer');
        const win = (accusedId === killer.id && accusedCardName === room.killerCard.name);

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
server.listen(PORT, '0.0.0.0', () => console.log(`Goyendagiri Game is running on port ${PORT}`));
