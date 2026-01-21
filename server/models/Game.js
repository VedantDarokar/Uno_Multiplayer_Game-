const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    roomCode: { type: String, required: true },
    players: [{ type: String }], // Array of usernames
    winner: { type: String },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date }
});

module.exports = mongoose.model('Game', gameSchema);
