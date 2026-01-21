const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity in dev, refine for prod
        methods: ["GET", "POST"]
    }
});

const mongoose = require('mongoose');
const User = require('./models/User');
const Game = require('./models/Game');

// Connect to MongoDB (Ensure you have a local instance or update URI)
let isDbConnected = false;
mongoose.connect('mongodb://127.0.0.1:27017/uno')
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

    socket.on('createRoom', ({ name }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomCode] = {
            players: [{ id: socket.id, name, hand: [], saidUno: false, connected: true }],
            deck: generateDeck(),
            discardPile: [],
            currentPlayerIndex: 0,
            direction: 1,
            status: 'waiting'
        };
        socketRoomMap[socket.id] = roomCode;
        socket.join(roomCode);
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
        if (room.players.length >= 4) {
            console.log(`[Join Failed] Room ${roomCode} is full`);
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        room.players.push({ id: socket.id, name, hand: [], saidUno: false, connected: true });
        socketRoomMap[socket.id] = roomCode;
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode });
        io.to(roomCode).emit('playerListUpdate', room.players);
        console.log(`[Join Success] ${name} joined ${roomCode}`);
    });

    socket.on('startGame', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (room && room.status === 'waiting' && room.players[0].id === socket.id) {
            room.status = 'playing';

            // Deal Cards (7 each)
            room.players.forEach(player => {
                player.hand = room.deck.splice(0, 7);
            });

            // Start Discard Pile
            let firstCard = room.deck.shift();
            while (firstCard.color === 'black') {
                room.deck.push(firstCard);
                room.deck.sort(() => Math.random() - 0.5);
                firstCard = room.deck.shift();
            }
            room.discardPile.push(firstCard);

            io.to(roomCode).emit('gameStart', {
                discardPile: room.discardPile,
                currentColor: firstCard.color
            });

            updateGameState(roomCode);
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
                io.to(roomCode).emit('gameOver', { winner: player.name });
                room.status = 'ended';

                try {
                    const game = new Game({
                        roomCode,
                        players: room.players.map(p => p.name),
                        winner: player.name,
                        endedAt: new Date()
                    });
                    await game.save();

                    await User.updateOne({ username: player.name }, { $inc: { wins: 1, matchesPlayed: 1 } }, { upsert: true });
                    for (const p of room.players) {
                        if (p.name !== player.name) {
                            await User.updateOne({ username: p.name }, { $inc: { matchesPlayed: 1 } }, { upsert: true });
                        }
                    }
                } catch (err) {
                    console.error("Error saving game:", err);
                }
            } else {
                updateGameState(roomCode);
            }
        }
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

            room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;
            io.to(roomCode).emit('notification', { message: `${player.name} drew and passed.` });
            updateGameState(roomCode);
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

server.listen(4000, '0.0.0.0', () => {
    console.log('Server running on port 4000');
});
