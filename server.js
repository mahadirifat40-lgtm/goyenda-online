const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const Datastore = require('nedb-promises');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ডেটাবেস ফাইল তৈরি
const db = Datastore.create({ filename: path.join(__dirname, 'users.db'), autoload: true });

// একটি ডিফল্ট ম্যানুয়াল এডমিন অ্যাকাউন্ট তৈরি (যদি না থাকে)
async function initAdmin() {
    const adminExists = await db.findOne({ username: 'admin' });
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin1234', 10);
        await db.insert({ username: 'admin', password: hashedPassword, role: 'admin', points: 0, profilePic: '' });
        console.log("Default Admin Created -> User: admin | Pass: admin1234");
    }
}
initAdmin();

// --- API Routes (Authentication) ---

// রেজিস্ট্রেশন API (ম্যানুয়াল প্লেয়ারদের জন্য)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'সবগুলো ঘর পূরণ করুন!' });
        
        const userExists = await db.findOne({ username: username.toLowerCase() });
        if (userExists) return res.status(400).json({ error: 'এই ইউজারনেমটি ইতিমধ্যে নেওয়া হয়েছে!' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.insert({ username: username.toLowerCase(), password: hashedPassword, role: 'player', points: 0, profilePic: '' });
        res.json({ success: true, message: 'রেজিস্ট্রেশন সফল হয়েছে!' });
    } catch (err) {
        res.status(500).json({ error: 'সার্ভার সমস্যা!' });
    }
});

// লগইন API (ম্যানুয়াল প্লেয়ারদের জন্য)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.findOne({ username: username.toLowerCase() });
        if (!user) return res.status(400).json({ error: 'ইউজার পাওয়া যায়নি!' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'ভুল পাসওয়ার্ড!' });

        res.json({ success: true, username: user.username, role: user.role, points: user.points, profilePic: user.profilePic || '' });
    } catch (err) {
        res.status(500).json({ error: 'সার্ভার সমস্যা!' });
    }
});

// ফেসবুক লগইন ও ডেটাবেস সিঙ্ক API
app.post('/api/auth/facebook', async (req, res) => {
    try {
        const { username, profilePic } = req.body;
        if (!username) return res.status(400).json({ error: 'ফেসবুক ডেটা পাওয়া যায়নি!' });

        let user = await db.findOne({ username: username.toLowerCase() });
        if (!user) {
            // নতুন ফেসবুক ইউজার হলে ডেটাবেসে ইনসার্ট হবে
            user = await db.insert({ username: username.toLowerCase(), role: 'player', points: 0, profilePic: profilePic, isFacebook: true });
        } else {
            // প্রোফাইল পিকচার চেঞ্জ হলে আপডেট হবে
            await db.update({ username: username.toLowerCase() }, { $set: { profilePic: profilePic } });
            user = await db.findOne({ username: username.toLowerCase() });
        }
        res.json({ success: true, username: user.username, role: user.role, points: user.points, profilePic: user.profilePic });
    } catch (err) {
        res.status(500).json({ error: 'ফেসবুক অথেন্টিকেশন ফেইল্ড!' });
    }
});

// এডমিন প্যানেল API
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await db.find({}, { password: 0 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'ডেটা আনা সম্ভব হয়নি!' });
    }
});

// এডমিন দ্বারা ইউজার ডিলিট API
app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        await db.remove({ _id: req.params.id });
        res.json({ success: true, message: 'ইউজার ডিলিট করা হয়েছে।' });
    } catch (err) {
        res.status(500).json({ error: 'ডিলিট করা যায়নি!' });
    }
});

// --- GAME LOGIC (SOCKET.IO) ---
let rooms = {};
let onlineFbUsers = {}; // লাইভ অনলাইন ফেসবুক ইউজার ট্র্যাকিং
const SUSPECT_DECKS = [
    { suspect: "ফেলুদা ফ্যান", cards: ["ডিজিটাল পিস্তল", "টেবিল ল্যাম্পের তার", "বিষাক্ত চারমিনার cigarette"] },
    { suspect: "ব্যোমকেশ ভক্ত", cards: ["অ্যান্টিক খঞ্জর", "সায়ানাইড ক্যাপসুল", "পকেট ঘড়ির চেইন"] },
    { suspect: "কাকাবাবু অনুসারী", cards: ["ক্রাচের তলোয়ার", "ক্লোরোফর্ম রুমাল", "ভারী কাঠের মূর্তি"] },
    { suspect: "মাসুদ রানা স্পাই", cards: ["সাইলেন্সার রিভলভার", "বিষাক্ত লেজার পেন", "নাইলন সুতা"] }
];

function shuffle(array) { return array.sort(() => Math.random() - 0.5); }

// যারা একে অপরের ফেসবুক ফ্রেন্ড এবং গেমের লাইভ সার্ভারে অনলাইন আছে তাদের লিস্ট ব্রডকাস্ট করা
function sendOnlineFriendsList() {
    Object.keys(onlineFbUsers).forEach(socketId => {
        const currentUser = onlineFbUsers[socketId];
        let onlineFriends = Object.values(onlineFbUsers).filter(otherUser => {
            if (otherUser.socketId === socketId) return false;
            return currentUser.friends.some(f => f.name.toLowerCase() === otherUser.username.toLowerCase());
        });
        io.to(socketId).emit('updateOnlineFriends', onlineFriends);
    });
}

io.on('connection', (socket) => {
    
    // ফেসবুক প্লেয়ার অনলাইনে আসলে ফ্রেন্ডলিস্ট ট্র্যাকিং
    socket.on('fbUserOnline', ({ username, profilePic, friends }) => {
        onlineFbUsers[socket.id] = { socketId: socket.id, username, profilePic, friends };
        sendOnlineFriendsList();
    });

    // ডিরেক্ট ইনভাইটেশন পাঠানো লজিক
    socket.on('sendRoomInvite', ({ targetSocketId, roomCode, sender }) => {
        io.to(targetSocketId).emit('receiveRoomInvite', { roomCode, sender });
    });

    socket.on('joinRoom', ({ roomCode, username, peerId, profilePic }) => {
        const code = roomCode.toUpperCase();
        if (!rooms[code]) {
            rooms[code] = { code, players: [], state: 'lobby', killerCard: null, clues: [] };
        }
        
        let existingPlayer = rooms[code].players.find(p => p.username === username);
        if (!existingPlayer) {
            rooms[code].players.push({ 
                id: socket.id, username, peerId, role: 'Suspect', cards: [], points: 0, profilePic: profilePic || ''
            });
        } else {
            existingPlayer.id = socket.id;
            existingPlayer.peerId = peerId;
            if(profilePic) existingPlayer.profilePic = profilePic;
        }

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

    socket.on('submitAccusation', async ({ roomCode, accusedId, accusedCard }) => {
        const code = roomCode.toUpperCase();
        const room = rooms[code];
        if (!room) return;

        const killer = room.players.find(p => p.role === 'Killer');
        const win = (accusedId === killer.id && accusedCard === room.killerCard);

        for (let p of room.players) {
            let ptsToAdd = 0;
            if (win) {
                if (p.role === 'Goyenda') ptsToAdd = 3;
                if (p.role === 'Suspect') ptsToAdd = 2;
            } else {
                if (p.role === 'Killer') ptsToAdd = 3;
            }
            p.points += ptsToAdd;
            await db.update({ username: p.username.toLowerCase() }, { $inc: { points: ptsToAdd } });
        }

        const sortedLeaderboard = [...room.players].sort((a,b) => b.points - a.points);
        io.to(code).emit('gameOver', { win, killer, killerCard: room.killerCard, roomData: room, leaderboard: sortedLeaderboard });
        room.state = 'lobby'; 
    });

    socket.on('disconnect', () => {
        if (onlineFbUsers[socket.id]) {
            delete onlineFbUsers[socket.id];
            sendOnlineFriendsList();
        }
        for (let code in rooms) {
            rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
            if (rooms[code].players.length === 0) delete rooms[code];
            else io.to(code).emit('roomUpdated', rooms[code]);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`Professional Full-Stack FB Connected Game Live!`));
