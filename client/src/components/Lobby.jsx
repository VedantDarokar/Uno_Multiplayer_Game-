import React, { useState, useEffect } from 'react';
import { socket } from '../socket';

export default function Lobby() {
    const [name, setName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [leaderboard, setLeaderboard] = useState([]);

    useEffect(() => {
        const URL = window.location.hostname === 'localhost'
            ? "http://localhost:4000/api/leaderboard"
            : `http://${window.location.hostname}:4000/api/leaderboard`;

        fetch(URL)
            .then(res => res.json())
            .then(data => setLeaderboard(data))
            .catch(err => console.error("Failed to fetch leaderboard", err));
    }, []);

    const createRoom = () => {
        if (!name) return alert('Please enter your name');
        socket.emit('createRoom', { name });
    };

    const joinRoom = () => {
        if (!name || !roomCode) return alert('Please enter name and room code');
        socket.emit('joinRoom', { name, roomCode: roomCode.trim().toUpperCase() });
    };

    return (
        <div className="full-screen flex-center" style={{
            background: 'radial-gradient(circle at center, #2e2e3a 0%, #1a1a1a 100%)',
            gap: '2rem',
            flexWrap: 'wrap',
            padding: '20px'
        }}>
            <div className="glass" style={{ padding: '3rem', width: '400px', textAlign: 'center' }}>
                <h1 style={{ marginBottom: '2rem', fontSize: '3rem', fontWeight: 'bold' }}>
                    <span style={{ color: 'var(--uno-red)' }}>U</span>
                    <span style={{ color: 'var(--uno-yellow)' }}>N</span>
                    <span style={{ color: 'var(--uno-green)' }}>O</span>
                </h1>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        type="text"
                        placeholder="Your Name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'rgba(255,255,255,0.1)',
                            color: 'white',
                            fontSize: '1rem'
                        }}
                    />

                    <button className="btn-primary" onClick={createRoom}>
                        Create Room
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0', color: '#888' }}>
                        <div style={{ flex: 1, height: '1px', background: '#444' }}></div>
                        <span style={{ padding: '0 10px' }}>OR</span>
                        <div style={{ flex: 1, height: '1px', background: '#444' }}></div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            placeholder="Room Code"
                            value={roomCode}
                            onChange={e => setRoomCode(e.target.value.toUpperCase())}
                            style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                fontSize: '1rem',
                                textTransform: 'uppercase'
                            }}
                        />
                        <button
                            onClick={joinRoom}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                padding: '0 20px',
                                borderRadius: '8px',
                                fontWeight: 'bold'
                            }}
                        >
                            Join
                        </button>
                    </div>
                </div>
            </div>

            {/* Leaderboard Panel */}
            <div className="glass" style={{ padding: '2rem', width: '300px', maxHeight: '500px', overflowY: 'auto' }}>
                <h2 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid #444', paddingBottom: '10px' }}>Leaderboard</h2>
                {leaderboard.length === 0 ? (
                    <p style={{ color: '#888' }}>No games played yet.</p>
                ) : (
                    <ul style={{ listStyle: 'none' }}>
                        {leaderboard.map((user, index) => (
                            <li key={index} style={{
                                display: 'flex', justifyContent: 'space-between',
                                padding: '10px',
                                background: index === 0 ? 'rgba(255, 215, 0, 0.1)' : 'rgba(255,255,255,0.05)',
                                marginBottom: '5px', borderRadius: '5px',
                                border: index === 0 ? '1px solid gold' : 'none'
                            }}>
                                <span style={{ color: index === 0 ? 'gold' : 'white', fontWeight: 'bold' }}>{index + 1}. {user.username}</span>
                                <span style={{ color: '#aaa' }}>{user.wins} Wins</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
