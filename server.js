const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

// --- 🧠 AI-Style Dynamic Generator Pools ---
const SUSPECT_NAMES = [
    { name: "ফেলুদা ফ্যান", seed: "feluda" },
    { name: "ব্যোমকেশ ভক্ত", seed: "byomkesh" },
    { name: "কাকাবাবু অনুসারী", seed: "kakababu" },
    { name: "মাসুদ রানা স্পাই", seed: "rana" },
    { name: "কিরীটী অনুরাগী", seed: "kiriti" },
    { name: "হিমু ট্রাভেলার", seed: "himu" },
    { name: "মিসির আলী থিঙ্ক-ট্যাঙ্ক", seed: "misir" },
    { name: "টিনটিন লাভার", seed: "tintin" },
    { name: "শেরিফ সাহেব", seed: "sheriff" },
    { name: "রহস্যময়ী তনয়া", seed: "tonoya" },
    { name: "প্রробнее শঙ্কু অ্যাসিস্ট্যান্ট", seed: "shonku" },
    { name: "ডিজিটাল হ্যাকার", seed: "hacker" }
];

const WEAPON_POOL = [
    { name: "ডিজিটাল পিস্তল", icon: "🔫", img: "https://images.unsplash.com/photo-1595590424283-b8f17842773f?w=150&q=80" },
    { name: "টেবিল ল্যাম্পের তার", icon: "🔌", img: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=150&q=80" },
    { name: "বিষাক্ত চারমিনার", icon: "🚬", img: "https://images.unsplash.com/photo-1556997685-309989c1aa82?w=150&q=80" },
    { name: "অ্যান্টিক খঞ্জর", icon: "🗡️", img: "https://images.unsplash.com/photo-1599819811279-d5ad9cccf838?w=150&q=80" },
    { name: "সায়ানাইড ক্যাপসুল", icon: "💊", img: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=150&q=80" },
    { name: "পকেট ঘড়ির চেইন", icon: "⛓️", img: "https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?w=150&q=80" },
    { name: "ক্রাচের تলোয়ার", icon: "⚔️", img: "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=150&q=80" },
    { name: "ক্লোরোফর্ম রুমাল", icon: "🧼", img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=150&q=80" },
    { name: "ভারী কাঠের মূর্তি", icon: "🗿", img: "https://images.unsplash.com/photo-1518929458119-e5bf444c30f4?w=150&q=80" },
    { name: "সাইলেন্সার রিভলভার", icon: "🔫", img: "https://images.unsplash.com/photo-1534353436294-0dbd4bdac845?w=150&q=80" },
    { name: "বিষাক্ত লেজার পেন", icon: "🖊️", img: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=150&q=80" },
    { name: "নাইলন সুতা", icon: "🧵", img: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=150&q=80" },
    { name: "কাঁচের ভাঙা টুকরো", icon: "💎", img: "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?w=150&q=80" },
    { name: "জং ধরা পেরেক", icon: "📌", img: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=150&q=80" },
    { name: "হিমায়িত বরফের টুকরো", icon: "❄️", img: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=150&q=80" },
    { name: "মেকআপ কিটের সুঁই", icon: "🪡", img: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=150&q=80" },
    { name: "প্রাচীন সোনার মুদ্রা", icon: "🪙", img: "https://images.unsplash.com/photo-1621972750749-0fbb1abb7736?w=150&q=80" },
    { name: "অজানা ভেষজ তরল", icon: "🧪", img: "https://images.unsplash.com/photo-1576086213369-97a306d36557?w=150&q=80" }
];

const CLUE_OPTIONS = {
    locations: [
        ["ড্রয়িং রুম", "পরিত্যক্ত গুদামঘর", "অন্ধকার গলি"],
        ["লাইব্রেরি রুম", "ছাদের চিলেকোঠা", "পুরনো রাজবাড়ি"],
        ["গোপন ল্যাবরেটরি", "লঞ্চের কেবিন", "কুয়াশাচ্ছন্ন বাগান"],
        ["জঙ্গলের বাংলো", "আন্ডারগ্রাউন্ড পার্কিং", "চলন্ত ট্রেন"]
    ],
    causes: [
        ["ধারালো অস্ত্র", "শ্বাসরোধ", "বিষপ্রয়োগ"],
        ["মাথায় আঘাত", "বিদ্যুতায়িত", "অতিরিক্ত রক্তক্ষরণ"],
        ["অ্যালার্জি বিক্রিয়া", "ধীরগতির বিষ", "হার্ট অ্যাটাক (কৃত্রিম)"]
    ],
    scenarios: [
        ["ধস্তাধস্তি", "একদম পরিষ্কার", "রক্তের ছিট ফোঁটা"],
        ["ভেজা জুতার ছাপ", "খোলা জানালা", "অর্ধেক খাওয়া চা"],
        ["ভাঙা ফুলদানি", "উল্টে থাকা চেয়ার", "পোড়া কাগজের ছাই"]
    ]
};

function shuffle(array) { 
    return array.sort(() => Math.random() - 0.5); 
}

function generateDynamicDecks(playerCount) {
    let shuffledSuspects = shuffle([...SUSPECT_NAMES]);
    let shuffledWeapons = shuffle([...WEAPON_POOL]);
    let decks = [];
    for(let i = 0; i < playerCount; i++) {
        let suspect = shuffledSuspects[i] || { name: `সন্দেহভাজন ${i+1}`, seed: `avatar${i}` };
        let cards = [
            shuffledWeapons[i * 3],
            shuffledWeapons[i * 3 + 1],
            shuffledWeapons[i * 3 + 2]
        ].filter(Boolean);

        decks.push({
            suspect: suspect.name,
            avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${suspect.seed}`,
            cards: cards
        });
    }
    return decks;
}

io.on('connection', (socket) => {
    
    socket.on('joinRoom', ({ roomCode, username }) => {
        const code = roomCode.toUpperCase().trim();
        const name = username.trim();
        if (!code || !name) return;

        if (!rooms[code]) {
            rooms[code] = { code, players: [], state: 'lobby', killerCard: null, clues: [], cluePools: {} };
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

        room.cluePools = {
            locations: shuffle([...CLUE_OPTIONS.locations])[0],
            causes: shuffle([...CLUE_OPTIONS.causes])[0],
            scenarios: shuffle([...CLUE_OPTIONS.scenarios])[0]
        };

        let shuffledPlayers = shuffle([...room.players]);
        let goyenda = shuffledPlayers[0];
        let killer = shuffledPlayers[1];
        
        let dynamicDecks = generateDynamicDecks(room.players.length);
        let deckIndex = 0;

        room.players.forEach(p => {
            if (p.id === goyenda.id) {
                p.role = 'Goyenda'; 
                p.cards = []; 
                p.assignedSuspectName = "প্রধান গোয়েন্দা";
                p.avatar = "https://api.dicebear.com/7.x/bottts/svg?seed=goyenda-boss";
            } else {
                let deck = dynamicDecks[deckIndex++];
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
