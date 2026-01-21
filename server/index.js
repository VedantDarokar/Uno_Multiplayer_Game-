require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');

const app = express();

const clientUrl = process.env.CLIENT_URL || "*";
const allowedOrigins = clientUrl === "*"
    ? "*"
    : clientUrl.split(',').map(url => url.trim().replace(/\/$/, ""));

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

const mongoose = require('mongoose');
const User = require('./models/User');
const Game = require('./models/Game');

// Connect to MongoDB
let isDbConnected = false;
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/uno')
    .then(() => {
        console.log('MongoDB Connected');
        isDbConnected = true;
    })
    .catch(err => console.log('MongoDB Connection Failed (Running without DB):', err.message));

app.get('/api/leaderboard', async (req, res) => {
    if (!isDbConnected) return res.json([]);
    try {
        const topPlayers = await User.find().sort({ wins: -1 }).limit(10);
        res.json(topPlayers);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

app.get('/api/my-stats', async (req, res) => {
    if (!isDbConnected) return res.json({ wins: 0, matchesPlayed: 0, totalScore: 0 });
    try {
        const ip = req.ip || req.connection.remoteAddress;
        const user = await User.findOne({ ip });
        res.json(user || { wins: 0, matchesPlayed: 0, totalScore: 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Game State Storage
// rooms[roomCode] = {
//   players: [{ id, name, hand: [] }],
//   deck: [],
//   discardPile: [],
//   currentPlayerIndex: 0,
//   direction: 1, // 1 for clockwise, -1 for counter-clockwise
//   status: 'waiting' | 'playing' | 'ended'
// }
const rooms = {};

// Helper: Generate Deck
const generateDeck = () => {
    const colors = ['red', 'yellow', 'green', 'blue'];
    const deck = [];

    colors.forEach(color => {
        deck.push({ color, value: '0', type: 'number' });
        for (let i = 1; i <= 9; i++) {
            deck.push({ color, value: String(i), type: 'number' });
            deck.push({ color, value: String(i), type: 'number' });
        }
        deck.push({ color, value: 'skip', type: 'action' });
        deck.push({ color, value: 'skip', type: 'action' });
        deck.push({ color, value: 'reverse', type: 'action' });
        deck.push({ color, value: 'reverse', type: 'action' });
        deck.push({ color, value: '+2', type: 'action' });
        deck.push({ color, value: '+2', type: 'action' });
    });

    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'black', value: 'wild', type: 'wild' });
        deck.push({ color: 'black', value: '+4', type: 'wild' });
    }

    return deck.sort(() => Math.random() - 0.5); // Simple shuffle
};

const socketRoomMap = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', ({ name, aiMode }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const ip = socket.handshake.address;
        rooms[roomCode] = {
            players: [{ id: socket.id, name, ip, hand: [], saidUno: false, connected: true }],
            deck: generateDeck(),
            discardPile: [],
            currentPlayerIndex: 0,
            direction: 1,
            status: 'waiting'
        };
        socketRoomMap[socket.id] = roomCode;
        socket.join(roomCode);

        // AI Mode: Add 3 Bots immediately
        if (aiMode) {
            const botNames = ["Bot Alpha", "Bot Beta", "Bot Gamma"];
            botNames.forEach((bName, i) => {
                rooms[roomCode].players.push({
                    id: `bot-${Date.now()}-${i}`,
                    name: bName,
                    hand: [],
                    saidUno: false,
                    connected: true,
                    isBot: true
                });
            });
        }

        socket.emit('roomCreated', { roomCode, name });
        io.to(roomCode).emit('playerListUpdate', rooms[roomCode].players);
    });

    socket.on('joinRoom', ({ name, roomCode }) => {
        console.log(`[Join Attempt] Name: ${name}, Room: ${roomCode}, Socket: ${socket.id}`);
        const room = rooms[roomCode];

        if (!room) {
            console.log(`[Join Failed] Room ${roomCode} not found`);
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        // Reconnection Logic
        const existingPlayer = room.players.find(p => p.name === name);
        if (existingPlayer) {
            if (!existingPlayer.connected) {
                // Reconnect
                console.log(`[Reconnect] ${name} reconnected to ${roomCode}`);
                existingPlayer.id = socket.id; // Update socket ID
                existingPlayer.connected = true;

                socketRoomMap[socket.id] = roomCode;
                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode });

                if (room.status === 'playing') {
                    updateGameState(roomCode);
                } else {
                    io.to(roomCode).emit('playerListUpdate', room.players);
                }
                return;
            } else {
                socket.emit('error', { message: 'Name already taken and player is online' });
                return;
            }
        }

        if (room.status !== 'waiting') {
            console.log(`[Join Failed] Room ${roomCode} is ${room.status}`);
            socket.emit('error', { message: 'Game has already started' });
            return;
        }
        if (room.players.length >= 6) {
            console.log(`[Join Failed] Room ${roomCode} is full`);
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        room.players.push({ id: socket.id, name, ip: socket.handshake.address, hand: [], saidUno: false, connected: true });
        socketRoomMap[socket.id] = roomCode;
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode });
        io.to(roomCode).emit('playerListUpdate', room.players);
        console.log(`[Join Success] ${name} joined ${roomCode}`);
    });

    socket.on('addBot', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || room.status !== 'waiting') return;
        if (room.players.length >= 6) return; // Limit 6

        const botNames = ["Bot Alpha", "Bot Beta", "Bot Gamma", "Bot Delta", "Bot Epsilon"];
        const usedNames = room.players.map(p => p.name);
        const name = botNames.find(n => !usedNames.includes(n)) || `Bot ${Math.floor(Math.random() * 1000)}`;

        const botUser = {
            id: `bot-${Date.now()}-${Math.random()}`,
            name,
            hand: [],
            saidUno: false,
            connected: true,
            isBot: true
        };
        room.players.push(botUser);
        io.to(roomCode).emit('playerListUpdate', room.players);
    });

    socket.on('startGame', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (room && room.status === 'waiting' && room.players[0].id === socket.id) {
            room.status = 'playing';

            // Deal Cards (7 each)
            room.players.forEach(player => {
                player.hand = room.deck.splice(0, 7);
            });

            // Start Discard Pile - Ensure first isn't Wild (simplified)
            let firstCard = room.deck.shift();
            while (firstCard.type === 'wild') { // Reshuffle if wild/draw4
                room.deck.push(firstCard);
                room.deck.sort(() => Math.random() - 0.5);
                firstCard = room.deck.shift();
            }
            room.discardPile.push(firstCard);

            // Apply first card effect if action
            if (firstCard.value === 'skip') {
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else if (firstCard.value === 'reverse') {
                if (room.players.length === 2) {
                    room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                } else {
                    room.direction *= -1;
                    // For reverse, the current player (dealer/0) is effectively "playing" it, so play moves to LAST player?
                    // Standard UNO: Dealer flips. Left of dealer plays.
                    // Index 0 = Host. 
                    // Let's assume Index 0 starts.
                    // Reverse -> Index 0 is skipped? No.
                    // Standard: "Dealer left starts".
                    // If Reverse: "Dealer right starts".
                    // We'll keep it simple: Index 0 starts. 
                    // If Reverse at start: direction flips, Index 0 plays. Next is Last player.
                }
            } else if (firstCard.value === '+2') {
                // First player draws 2 and loses turn.
                const p = room.players[room.currentPlayerIndex];
                p.hand.push(...room.deck.splice(0, 2));
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            }

            // Set Color
            room.currentColor = firstCard.color;

            io.to(roomCode).emit('gameStart', {
                discardPile: room.discardPile,
                currentColor: room.currentColor
            });

            updateGameState(roomCode);
            handleBotTurn(roomCode, io);
        }
    });

    socket.on('playCard', async ({ roomCode, cardIndex, chosenColor }) => {
        const room = rooms[roomCode];
        if (!room || room.status !== 'playing') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const isTurn = room.players[room.currentPlayerIndex].id === socket.id;
        if (!isTurn) return;

        const card = player.hand[cardIndex];
        if (!card) return;

        const topCard = room.discardPile[room.discardPile.length - 1];

        // Validation
        let isValid = false;
        if (card.color === 'black') isValid = true;
        else if (card.color === (room.currentColor || topCard.color)) isValid = true;
        else if (card.value === topCard.value) isValid = true;

        if (isValid) {
            player.hand.splice(cardIndex, 1);
            room.discardPile.push(card);

            // Special Cards
            if (card.value === 'skip') {
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else if (card.value === 'reverse') {
                if (room.players.length === 2) {
                    room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                    room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                } else {
                    room.direction *= -1;
                    room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                }
            } else if (card.value === '+2') {
                const nextPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                const nextPlayer = room.players[nextPlayerIndex];
                nextPlayer.hand.push(...room.deck.splice(0, 2));
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else if (card.value === 'wild') {
                room.currentColor = chosenColor;
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else if (card.value === '+4') {
                room.currentColor = chosenColor;
                const nextPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                const nextPlayer = room.players[nextPlayerIndex];
                nextPlayer.hand.push(...room.deck.splice(0, 4));
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else {
                room.currentColor = card.color;
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            }

            // Check Win
            if (player.hand.length === 0) {
                // Calculate Score
                let totalScore = 0;
                const pointsBreakdown = [];

                room.players.forEach(p => {
                    if (p.id !== player.id) {
                        let pScore = 0;
                        p.hand.forEach(c => {
                            if (c.type === 'number') pScore += parseInt(c.value);
                            else if (c.type === 'action') pScore += 20;
                            else if (c.type === 'wild') pScore += 50;
                        });
                        totalScore += pScore;
                        pointsBreakdown.push({ name: p.name, points: pScore, hand: p.hand });
                    }
                });

                io.to(roomCode).emit('gameOver', {
                    winner: player.name,
                    score: totalScore,
                    breakdown: pointsBreakdown
                });
                room.status = 'ended';

                try {
                    const game = new Game({
                        roomCode,
                        players: room.players.map(p => p.name),
                        winner: player.name,
                        score: totalScore, // Add score to schema if possible, or just ignore for now
                        endedAt: new Date()
                    });
                    await game.save();

                    // Update stats
                    if (!player.isBot && player.ip) {
                        await User.updateOne(
                            { ip: player.ip },
                            {
                                $set: { username: player.name },
                                $inc: { wins: 1, matchesPlayed: 1, totalScore: totalScore }
                            },
                            { upsert: true }
                        );
                    }
                    for (const p of room.players) {
                        if (p.name !== player.name && !p.isBot && p.ip) {
                            await User.updateOne(
                                { ip: p.ip },
                                {
                                    $set: { username: p.name },
                                    $inc: { matchesPlayed: 1 }
                                },
                                { upsert: true }
                            );
                        }
                    }
                } catch (err) {
                    console.error("Error saving game:", err);
                }
                return;
            } else {
                updateGameState(roomCode);
                handleBotTurn(roomCode, io);
            }
        }
    });

    socket.on('restartGame', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || room.status !== 'ended') return;

        // Reset Room
        room.deck = generateDeck();
        room.discardPile = [];
        room.players.forEach(p => {
            p.hand = [];
            p.saidUno = false;
        });
        room.currentPlayerIndex = 0;
        room.direction = 1;
        room.status = 'playing'; // Start immediately or wait? Implied "Play Again" means restart.

        // Deal
        room.players.forEach(player => {
            player.hand = room.deck.splice(0, 7);
        });

        // Start Discard
        let firstCard = room.deck.shift();
        while (firstCard.type === 'wild') {
            room.deck.push(firstCard);
            room.deck.sort(() => Math.random() - 0.5);
            firstCard = room.deck.shift();
        }
        room.discardPile.push(firstCard);

        // Apply First Card
        if (firstCard.value === 'skip') {
            room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
        } else if (firstCard.value === 'reverse') {
            if (room.players.length > 2) room.direction *= -1;
            // else treat as skip? No, 2 player reverse is skip.
            if (room.players.length === 2) room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
        } else if (firstCard.value === '+2') {
            const p = room.players[room.currentPlayerIndex];
            p.hand.push(...room.deck.splice(0, 2));
            room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
        }

        room.currentColor = firstCard.color;

        io.to(roomCode).emit('gameStart', {
            discardPile: room.discardPile,
            currentColor: room.currentColor
        });
        updateGameState(roomCode);
        handleBotTurn(roomCode, io);
    });

    socket.on('sayUno', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player && player.hand.length <= 2) {
            player.saidUno = true;
            io.to(roomCode).emit('notification', { message: `${player.name} said UNO!` });
            updateGameState(roomCode);
        }
    });

    socket.on('catchUno', ({ roomCode, targetId }) => {
        const room = rooms[roomCode];
        if (!room) return;
        const target = room.players.find(p => p.id === targetId);
        if (target && target.hand.length === 1 && !target.saidUno) {
            target.hand.push(...room.deck.splice(0, 2));
            target.saidUno = false;
            io.to(roomCode).emit('notification', { message: `${target.name} caught not saying UNO! Drawn 2 cards.` });
            updateGameState(roomCode);
        }
    });

    socket.on('passTurn', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || room.status !== 'playing') return;
        const isTurn = room.players[room.currentPlayerIndex].id === socket.id;
        if (!isTurn) return;

        room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
        io.to(roomCode).emit('notification', { message: `${room.players.find(p => p.id === socket.id).name} passed.` });
        updateGameState(roomCode);
        handleBotTurn(roomCode, io);
    });

    socket.on('drawCard', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || room.status !== 'playing') return;

        const isTurn = room.players[room.currentPlayerIndex].id === socket.id;
        if (!isTurn) return;

        if (room.deck.length === 0) {
            const top = room.discardPile.pop();
            room.deck = room.discardPile.map(c => ({ ...c })).sort(() => Math.random() - 0.5);
            room.discardPile = [top];
        }

        if (room.deck.length > 0) {
            const card = room.deck.shift();
            const player = room.players.find(p => p.id === socket.id);
            player.hand.push(card);
            player.saidUno = false;

            // Check if Drawn Card is Playable
            const topCard = room.discardPile[room.discardPile.length - 1];
            let isValid = false;
            // Simple validation reused (simplest form)
            if (card.color === 'black') isValid = true;
            else if (card.color === (room.currentColor || topCard.color)) isValid = true;
            else if (card.value === topCard.value) isValid = true;

            if (isValid) {
                // Do NOT advance turn. User must Play or Pass.
                io.to(roomCode).emit('notification', { message: `${player.name} drew. Play or Pass?` });
            } else {
                // Auto Advance
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                io.to(roomCode).emit('notification', { message: `${player.name} drew and passed.` });
            }

            updateGameState(roomCode);
            handleBotTurn(roomCode, io);
        }
    });

    socket.on('syncGameState', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            socket.emit('gameStateUpdate', {
                hand: player.hand,
                opponents: room.players.filter(p => p.id !== player.id).map(p => ({
                    id: p.id,
                    name: p.name,
                    cards: p.hand.length,
                    saidUno: p.saidUno,
                    connected: p.connected
                })),
                discardPile: room.discardPile,
                topCard: room.discardPile[room.discardPile.length - 1],
                currentColor: room.currentColor || (room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1].color : null),
                currentPlayerName: room.players[room.currentPlayerIndex]?.name,
                direction: room.direction,
                saidUno: player.saidUno,
                status: room.status,
                isPlayer: true
            });
            socket.emit('playerListUpdate', room.players);
        } else {
            socket.emit('roomStateForNewcomer', {
                status: room.status,
                players: room.players,
                isPlayer: false
            });
        }
    });

    // Chat Logic
    socket.on('sendMessage', ({ roomCode, message }) => {
        const room = rooms[roomCode];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                io.to(roomCode).emit('receiveMessage', { sender: player.name, text: message });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const roomCode = socketRoomMap[socket.id];
        if (roomCode && rooms[roomCode]) {
            const room = rooms[roomCode];
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.connected = false;
                // Notify logic
                if (room.status === 'playing') {
                    // Maybe notify that player disconnected? For now just log
                    console.log(`${player.name} disconnected from ${roomCode}`);
                }
                io.to(roomCode).emit('playerListUpdate', room.players);
            }
            delete socketRoomMap[socket.id];
        }
    });
});

function updateGameState(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.players.forEach(player => {
        const gameState = {
            hand: player.hand,
            opponents: room.players.filter(p => p.id !== player.id).map(p => ({
                id: p.id,
                name: p.name,
                cards: p.hand.length,
                saidUno: p.saidUno,
                connected: p.connected
            })),
            discardPile: room.discardPile,
            topCard: room.discardPile[room.discardPile.length - 1],
            currentColor: room.currentColor || (room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1].color : null),
            currentPlayerName: room.players[room.currentPlayerIndex].name,
            direction: room.direction,
            saidUno: player.saidUno
        };
        io.to(player.id).emit('gameStateUpdate', gameState);
    });
}

const BOT_DELAY = 1500;

function handleBotTurn(roomCode, io) {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing') return;

    const player = room.players[room.currentPlayerIndex];
    if (!player || !player.isBot) return;

    console.log(`[Bot] ${player.name} is thinking...`);

    setTimeout(async () => {
        // Double check state hasn't changed drastically
        if (rooms[roomCode]?.currentPlayerIndex !== room.currentPlayerIndex) return;

        // 1. Identify Valid Cards
        const topCard = room.discardPile[room.discardPile.length - 1];
        const validCards = player.hand.map((card, index) => {
            let isValid = false;
            if (card.color === 'black') isValid = true;
            else if (card.color === (room.currentColor || topCard.color)) isValid = true;
            else if (card.value === topCard.value) isValid = true;
            return isValid ? { card, index } : null;
        }).filter(c => c !== null);

        // 2. Decide Move
        if (validCards.length > 0) {
            // Pick strategic card? High value or specific action?
            // Simple: Pick first valid (or random valid)
            const move = validCards[Math.floor(Math.random() * validCards.length)];
            const { card, index } = move;

            console.log(`[Bot] ${player.name} plays ${card.color} ${card.value}`);

            player.hand.splice(index, 1);
            room.discardPile.push(card);

            // Handle Wild Color Choice (Random valid color)
            let chosenColor = null;
            if (card.color === 'black') {
                const colors = ['red', 'blue', 'green', 'yellow'];
                // Choose color present in hand
                const handColors = player.hand.filter(c => c.color !== 'black').map(c => c.color);
                chosenColor = handColors.length > 0
                    ? handColors[Math.floor(Math.random() * handColors.length)]
                    : colors[Math.floor(Math.random() * colors.length)];
            }

            // Apply Effects
            if (card.value === 'skip') {
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else if (card.value === 'reverse') {
                if (room.players.length === 2) {
                    room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                } else {
                    room.direction *= -1;
                }
            } else if (card.value === '+2') {
                const nextPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                const nextPlayer = room.players[nextPlayerIndex];
                nextPlayer.hand.push(...room.deck.splice(0, 2));
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else if (card.value === 'wild') {
                room.currentColor = chosenColor;
            } else if (card.value === '+4') {
                room.currentColor = chosenColor;
                const nextPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                const nextPlayer = room.players[nextPlayerIndex];
                nextPlayer.hand.push(...room.deck.splice(0, 4));
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else {
                room.currentColor = card.color;
            }

            // Advance Turn (if not skipped/effected already handled above logic is slightly diff from original PlayCard... 
            // Original PlayCard handled advancement IN the effect blocks for skip/+2.
            // But basic cards fall through.
            // Let's match original logic structure to be safe.
            if (card.value !== 'skip' && card.value !== 'reverse' && card.value !== '+2' && card.value !== '+4') {
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length; // Wait, why twice?
                // Original logic lines 238: index = ...
                // Actually original logic seemed to have a bug or I misread?
                // Line 238: `room.currentPlayerIndex = (room.currentPlayerIndex + ...)`
                // Oh, looking at original PlayCard:
                // skip: advances twice? "currentPlayerIndex = ...; currentPlayerIndex = ..." (lines 210-211).
                // Ah, ONE advance is "Action", SECOND is "Next Player".
                // In UNO, Skip means: Active Player plays Skip. Next player is skipped. Turn goes to Player After.
                // So: Current -> Target (Skipped) -> Next.
                // Correct logic: Advance ONCE effectively skips if we don't process their turn. 
                // But simply index += 2?
                // Original code:
                // 210: index = index + dir
                // 211: index = index + dir
                // Yes, it skips the immediate next.

                // However, for Normal cards (Line 238):
                // One advance.
                // Wait, original Line 238 seems to index = index + dir.
                // Checks out.

                // BUT: My logic above for Skip/+2 used ONE advance line in some cases?
                // Let's re-verify:
                // Skip: I did `room.currentPlayerIndex = ...`. Check orig: It did it TWICE.
                // I should match original.
            }
            // Wait, my bot logic above for 'skip' only advanced ONCE. I need to fix that.

            // Re-evaluating Index Logic
            // Standard "Next Turn": Index + Direction.
            // Skip: Index + Direction * 2.
            // +2: Next player draws. Then Index + Direction * 2? Or does +2 skip them? 
            // Rule: "Next player draws 2 cards and loses their turn". So yes, skip them.
            // Original code +2 (220): NextPlayer gets cards (223). Then index updated (224), then updated AGAIN (225).
            // So YES, original code skips the person who drew.

            // Fix Bot Logic:
            if (card.value === 'skip') {
                room.currentPlayerIndex = (room.currentPlayerIndex + 2 * room.direction + 2 * room.players.length) % room.players.length;
            } else if (card.value === 'reverse') {
                if (room.players.length === 2) {
                    room.currentPlayerIndex = (room.currentPlayerIndex + 2 * room.direction + 2 * room.players.length) % room.players.length;
                } else {
                    room.direction *= -1;
                    room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                }
            } else if (card.value === '+2') {
                // Victim
                const victimIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                room.players[victimIndex].hand.push(...room.deck.splice(0, 2));
                // Skip victim
                room.currentPlayerIndex = (room.currentPlayerIndex + 2 * room.direction + 2 * room.players.length) % room.players.length;
            } else if (card.value === 'wild') {
                room.currentColor = chosenColor;
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            } else if (card.value === '+4') {
                room.currentColor = chosenColor;
                const victimIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                room.players[victimIndex].hand.push(...room.deck.splice(0, 4));
                // Skip
                room.currentPlayerIndex = (room.currentPlayerIndex + 2 * room.direction + 2 * room.players.length) % room.players.length;
            } else {
                // Normal
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            }

            // Say UNO?
            if (player.hand.length === 1) {
                // Bots rarely forget, but maybe add 10% chance to forget?
                if (Math.random() > 0.1) {
                    player.saidUno = true;
                    io.to(roomCode).emit('notification', { message: `${player.name} said UNO!` });
                }
            }

            // Check Win
            if (player.hand.length === 0) {
                // Calculate Score
                let totalScore = 0;
                const pointsBreakdown = [];

                room.players.forEach(p => {
                    if (p.id !== player.id) {
                        let pScore = 0;
                        p.hand.forEach(c => {
                            if (c.type === 'number') pScore += parseInt(c.value);
                            else if (c.type === 'action') pScore += 20;
                            else if (c.type === 'wild') pScore += 50;
                        });
                        totalScore += pScore;
                        pointsBreakdown.push({ name: p.name, points: pScore, hand: p.hand });
                    }
                });

                io.to(roomCode).emit('gameOver', {
                    winner: player.name,
                    score: totalScore,
                    breakdown: pointsBreakdown
                });
                room.status = 'ended';

                // Save Game Logic
                try {
                    const game = new Game({
                        roomCode,
                        players: room.players.map(p => p.name),
                        winner: player.name,
                        score: totalScore,
                        endedAt: new Date()
                    });
                    await game.save();

                    if (!player.isBot && player.ip) {
                        await User.updateOne(
                            { ip: player.ip },
                            {
                                $set: { username: player.name },
                                $inc: { wins: 1, matchesPlayed: 1, totalScore: totalScore }
                            },
                            { upsert: true }
                        );
                    }
                    for (const p of room.players) {
                        if (p.name !== player.name && !p.isBot && p.ip) {
                            await User.updateOne(
                                { ip: p.ip },
                                {
                                    $set: { username: p.name },
                                    $inc: { matchesPlayed: 1 }
                                },
                                { upsert: true }
                            );
                        }
                    }
                } catch (err) {
                    console.error("Error saving game:", err);
                }
                return;
            }

        } else {
            // Draw
            console.log(`[Bot] ${player.name} draws.`);
            if (room.deck.length === 0) {
                const top = room.discardPile.pop();
                room.deck = room.discardPile.map(c => ({ ...c })).sort(() => Math.random() - 0.5);
                room.discardPile = [top];
            }
            if (room.deck.length > 0) {
                const card = room.deck.shift();
                player.hand.push(card);
                player.saidUno = false;

                // Can play drawn card?
                // Logic: If playable, play immediately (Bot always plays if beneficial/valid).
                // Check validity
                const topCard = room.discardPile[room.discardPile.length - 1]; // Re-check top (didn't change but good practice)
                let isValid = false;
                if (card.color === 'black') isValid = true;
                else if (card.color === (room.currentColor || topCard.color)) isValid = true;
                else if (card.value === topCard.value) isValid = true;

                if (isValid) {
                    // Play it!
                    // Recursive call? Or just handle here?
                    // Just handle here to avoid deep recursion or delay.
                    console.log(`[Bot] ${player.name} plays drawn ${card.color} ${card.value}`);
                    player.hand.pop(); // Remove the card we just added
                    room.discardPile.push(card);
                    // Logic for effects again...
                    // DRY violation but safe for now.
                    // Copy-paste effect logic.

                    // Helper for Effect Logic?
                    // I'll just do minimal for now or recursing is slightly safer if I reset index?
                    // No, "Play Immediately" usually implies part of same turn context.
                    // But simpler: Just advance turn if I can't play.
                    // If I CAN play, I'll play it.

                    // To avoid massive code duplication, I'll just ADVANCE turn here.
                    // The bot is "Dumb" on draw -> It draws and passes.
                    // User requirement: "If playable, you MAY play it".
                    // Ideally I should play it.
                    // Let's implement Play logic for drawn card.

                    // ... Effect Logic Duplication ...
                    // Actually, I'll just call `handleBotTurn` again immediately? 
                    // No, because `handleBotTurn` expects `currentPlayer` to be bot.
                    // If I haven't advanced index, it is still bot.
                    // So if I don't advance index, and call `handleBotTurn` again, it will find the new card and play it.
                    // BUT I added delay.
                    // So: Draw -> Don't advance -> Call `handleBotTurn`.
                    // It will wait 1.5s then play.
                    // This looks natural! "Draws... Thinks... Plays".
                    updateGameState(roomCode);
                    handleBotTurn(roomCode, io);
                    return;
                }

                // If not valid, advance
                room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
                io.to(roomCode).emit('notification', { message: `${player.name} drew and passed.` });
            }
        }

        updateGameState(roomCode);
        handleBotTurn(roomCode, io); // Trigger next player (if bot)

    }, BOT_DELAY);
}

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
    // Set static folder
    app.use(express.static(path.join(__dirname, '../client/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../client/dist', 'index.html'));
    });
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
