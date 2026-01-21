const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    avatar: { type: String, default: 'default_avatar.png' },
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
