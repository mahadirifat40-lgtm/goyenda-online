const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

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
    { name: "রহস্যময়ী তনয়া", seed: "tonoya" }
];

const WEAPON_POOL = [
    { name: "ডিজিটাল পিস্তল", icon: "🔫", img: "https://images.unsplash.com/photo-1595590424283-b8f17842773f?w=150&q=80" },
    { name: "টেবিল ল্যাম্পের তার", icon: "🔌", img: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=150&q=80" },
    { name: "বিষাক্ত চারমিনার", icon: "🚬", img: "https://images.unsplash.com/photo-1556997685-309989c1aa82?w=150&q=80" },
    { name: "অ্যান্টিক খঞ্জর", icon: "🗡️", img: "https://images.unsplash.com/photo-1599819811279-d5ad9cccf838?w=150&q=80" },
    { name: "সায়ানاید ক্যাপসুল", icon: "💊", img: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=150&q=80" },
    { name: "পকেট ঘড়ির চেইন", icon: "⛓️", img: "https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?w=150&q=80" },
    { name: "ক্রাচের তলোয়ার", icon: "⚔️", img: "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=150&q=80" },
    { name: "ক্লোরোফর্ম রুমাল", icon: "🧼", img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=150&q=80" },
    { name: "ভারী কাঠের মূর্তি", icon: "🗿", img: "https://images.unsplash.com/photo-1518929458119-e5bf444c30f4?w=150&q=80" },
    { name: "সাইলেন্সার রিভলভার", icon: "🔫", img: "https://images.unsplash.com/photo-1534353436294-0dbd4bdac845?w=150&q=80" }
];

const CLUE_OPTIONS = {
    locations: ["ড্রয়িং রুম", "পরিত্যক্ত গুদামঘর", "অন্ধকার গলি", "লাইব্রেরি রুম", "ছাদের চিলেকোঠা", "পুরনো রাজবাড়ি"],
    causes: ["ধারালো অস্ত্র", "শ্বাসরোধ", "বিষপ্রয়োগ", "মাথায় আঘাত", "বিদ্যুতায়িত"],
    scenarios: ["ধস্তাধস্তি", "একদম পরিষ্কার", "রক্তের ছিট ফোঁটা", "ভেজা জুতার ছাপ", "ভাঙা ফুলদানি"]
};

function shuffle(array) { return array.sort(() => Math.random() - 0.5); }

io.on('connection', (socket) => {
    
    socket.on('joinRoom', ({ roomCode, username }) => {
        const code = roomCode.toUpperCase().trim();
        const name = username.trim();
        if (!code || !name) return;

        if (!rooms[code]) {
            rooms[code] = { 
                code, players: [], state: 'lobby', killerCard: null, 
                cluesGiven: [], cluePools: {}, sentClueTypes: [] // পাঠানো টাইপ ট্র্যাক করার জন্য
            };
        }
        
        let existingPlayer = rooms[code].players.find(p => p.username.toLowerCase() === name.toLowerCase());
        if (!existingPlayer) {
            rooms[code].players.push({ 
                id: socket.id, username: name, role: 'Suspect', cards: [], points: 0, assignedSuspectName: "", avatar: ""
            });
        } else { existingPlayer.id = socket.id; }

        socket.join(code);
        socket.roomCode = code;
        socket.username = name;
        io.to(code).emit('roomUpdated', rooms[code]);
    });

    socket.on('sendMessage', ({ roomCode, message }) => {
        const code = roomCode.toUpperCase().trim();
        if(message.trim() === "") return;
        io.to(code).emit('chatMessage', { sender: socket.username, msg: message });
    });

    socket.on('startGame', (roomCode) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];
        if (!room || room.players.length < 3) return;

        room.state = 'role_reveal';
        room.cluesGiven = [];
        room.sentClueTypes = []; 
        room.killerCard = null;

        let shuffledLocs = shuffle([...CLUE_OPTIONS.locations]);
        let shuffledCauses = shuffle([...CLUE_OPTIONS.causes]);
        let shuffledScenarios = shuffle([...CLUE_OPTIONS.scenarios]);

        // ৩টি মূল ক্লু পুল
        room.cluePools = {
            loc: shuffledLocs[0],
            cause: shuffledCauses[0],
            scene: shuffledScenarios[0]
        };

        let shuffledPlayers = shuffle([...room.players]);
        let goyenda = shuffledPlayers[0];
        let killer = shuffledPlayers[1];
        
        let shuffledSuspects = shuffle([...SUSPECT_NAMES]);
        let shuffledWeapons = shuffle([...WEAPON_POOL]);
        let deckIndex = 0;

        room.players.forEach(p => {
            if (p.id === goyenda.id) {
                p.role = 'Goyenda'; p.assignedSuspectName = "প্রধান গোয়েন্দা";
                p.avatar = "https://api.dicebear.com/7.x/bottts/svg?seed=goyenda-boss"; p.cards = [];
            } else {
                if (p.id === killer.id) p.role = 'Killer';
                else p.role = 'Suspect';
                let suspect = shuffledSuspects[deckIndex] || { name: `সন্দিগ্ধ ${deckIndex+1}`, seed: `x${deckIndex}` };
                p.assignedSuspectName = suspect.name;
                p.avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${suspect.seed}`;
                p.cards = [shuffledWeapons[deckIndex*3], shuffledWeapons[deckIndex*3+1], shuffledWeapons[deckIndex*3+2]].filter(Boolean);
                deckIndex++;
            }
        });
        io.to(code).emit('gameUpdated', room);
    });

    socket.on('killerPickCard', ({ roomCode, card }) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];
        if (room) {
            room.killerCard = card;
            room.state = 'investigation'; 
            io.to(code).emit('gameUpdated', room);
        }
    });

    // গোয়েন্দার নির্দিষ্ট ক্লু পাঠানোর রিকোয়েস্ট
    socket.on('sendSpecificClue', ({ roomCode, clueType }) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];
        if (!room || room.state !== 'investigation') return;
        if (room.sentClueTypes.includes(clueType)) return; // অলরেডি পাঠানো হলে ইগনোর করবে

        room.sentClueTypes.push(clueType);

        if(clueType === 'loc') {
            room.cluesGiven.push({ type: 'loc', label: "📍 স্থান", val: room.cluePools.loc });
        } else if(clueType === 'cause') {
            room.cluesGiven.push({ type: 'cause', label: "🧪 মৃত্যুর কারণ", val: room.cluePools.cause });
        } else if(clueType === 'scene') {
            room.cluesGiven.push({ type: 'scene', label: "🧥 ঘটনাস্থল", val: room.cluePools.scene });
        }

        io.to(code).emit('gameUpdated', room);
    });

    socket.on('submitAccusation', ({ roomCode, accusedId, accusedCardName }) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];
        if (!room) return;

        const killer = room.players.find(p => p.role === 'Killer');
        const win = (accusedId === killer.id && accusedCardName === room.killerCard.name);

        // রিলিজ হওয়া ক্লু-র সংখ্যার ওপর ভিত্তি করে ডাইনামিক পয়েন্ট মেকানিজম
        let releasedCount = room.sentClueTypes.length;
        let earlyBirdPoints = 1;
        if (releasedCount === 0 || releasedCount === 1) earlyBirdPoints = 5; 
        else if (releasedCount === 2) earlyBirdPoints = 3;
        else earlyBirdPoints = 1;

        room.players.forEach(p => {
            if (win) {
                if (p.id === socket.id) p.points += earlyBirdPoints; 
                else if (p.role === 'Goyenda') p.points += 2;
                else if (p.role === 'Suspect') p.points += 1;
            } else {
                if (p.role === 'Killer') p.points += 3;
            }
        });

        const sortedLeaderboard = [...room.players].sort((a,b) => b.points - a.points);
        io.to(code).emit('gameOver', { win, killer, killerCard: room.killerCard, roomData: room, leaderboard: sortedLeaderboard, detectorUser: socket.username, ptsEarned: earlyBirdPoints });
        room.state = 'lobby'; 
    });

    socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
            if (rooms[code].players.length === 0) delete rooms[code];
            else io.to(code).emit('roomUpdated', rooms[code]);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`Custom Detective Game running on ${PORT}`));
