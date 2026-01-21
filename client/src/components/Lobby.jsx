import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket, SERVER_URL } from '../socket';

export default function Lobby() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [myStats, setMyStats] = useState(null);

    // Fetch Stats (IP Based)
    useEffect(() => {
        const URL = `${SERVER_URL}/api/my-stats`;
        fetch(URL)
            .then(res => res.json())
            .then(data => setMyStats(data))
            .catch(err => console.error(err));
    }, []);

    const createRoom = (aiMode = false) => {
        if (!name) return alert('Please enter your name');
        socket.emit('createRoom', { name, aiMode });
    };

    const joinRoom = () => {
        if (!roomCode) return alert('Please enter room code');
        navigate(`/game/${roomCode.trim().toUpperCase()}`);
    };

    return (
        <div className="full-screen lobby-container">
            <div className="glass lobby-card">
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
                            padding: '15px',
                            borderRadius: '12px',
                            border: '2px solid rgba(255,255,255,0.2)',
                            background: 'rgba(255,255,255,0.15)',
                            color: 'white',
                            fontSize: '1.1rem',
                            outline: 'none',
                            transition: 'all 0.3s'
                        }}
                        onFocus={e => e.target.style.background = 'rgba(255,255,255,0.25)'}
                        onBlur={e => e.target.style.background = 'rgba(255,255,255,0.15)'}
                    />

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn-primary" style={{ flex: 1 }} onClick={() => createRoom(false)}>
                            Create Room
                        </button>
                        <button className="btn-primary" style={{ flex: 1, background: 'linear-gradient(45deg, #1e90ff, #00bfff)' }} onClick={() => createRoom(true)}>
                            Play vs Bots
                        </button>
                    </div>

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
                            className="btn-primary"
                            style={{ padding: '0 25px' }}
                        >
                            Join
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Panel */}
            <div style={{
                display: 'flex', gap: '20px', alignItems: 'flex-start',
                justifyContent: 'center', flexWrap: 'wrap', width: '100%'
            }}>
                {/* Personal Stats */}
                {myStats && (
                    <div className="glass stats-card">
                        <h2 style={{ color: 'var(--uno-blue)', marginBottom: '1rem', borderBottom: '1px solid #444', paddingBottom: '10px' }}>Your Stats</h2>
                        <div style={{ marginBottom: '10px', fontSize: '1.2rem' }}>Wins: <span style={{ color: 'var(--uno-green)', fontWeight: 'bold' }}>{myStats.wins}</span></div>
                        <div style={{ marginBottom: '10px' }}>Matches: {myStats.matchesPlayed}</div>
                        <div style={{ marginBottom: '10px' }}>Total Score: {myStats.totalScore || 0}</div>
                    </div>
                )}
            </div>
        </div>
    );
}
