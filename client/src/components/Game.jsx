import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import Card from './Card';
import { soundManager } from '../utils/SoundManager';
import { useRef } from 'react';

export default function Game() {
    const params = useParams();
    const roomCode = params.roomCode.toUpperCase(); // Ensure room code is handled in uppercase
    const navigate = useNavigate();
    const [gameState, setGameState] = useState(null);
    const [waiting, setWaiting] = useState(true);
    const [players, setPlayers] = useState([]);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [pendingCardIndex, setPendingCardIndex] = useState(null);
    const [hasDrawn, setHasDrawn] = useState(false);

    const [gameOverData, setGameOverData] = useState(null);

    // New State for direct join (link access)
    const [needsToJoin, setNeedsToJoin] = useState(false);
    const [joinName, setJoinName] = useState('');

    // Chat State
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => {
        if (gameState && gameState.currentPlayerName !== players.find(p => p.id === socket.id)?.name) {
            setHasDrawn(false);
        }
    }, [gameState, players]);

    useEffect(() => {
        // Listeners
        socket.on('playerListUpdate', (list) => {
            setPlayers(list);
        });

        socket.on('gameStart', ({ discardPile, currentColor }) => {
            console.log("Game Start!", discardPile, currentColor);
            setWaiting(false);
        });

        socket.on('gameStateUpdate', (state) => {
            console.log("State Update", state);

            // Sound Logic using closure variable or Ref is tricky inside listener if we want previous state
            // Better to rely on the useEffect dependency below
            setGameState(prev => {
                // Heuristic: If discard pile length increased, Play Sound
                if (prev && state.discardPile.length > prev.discardPile.length) {
                    soundManager.play('play');
                }
                // Heuristic: If ANY player's hand size increased? 
                // Let's just check my hand for now or check current player change?
                // Actually, let's play 'draw' if deck size changed? We don't have deck size.
                // If my hand increased:
                if (prev && state.hand.length > prev.hand.length) {
                    soundManager.play('draw');
                }
                return state;
            });

            setWaiting(state.status === 'waiting');
            setNeedsToJoin(false);
        });

        socket.on('roomStateForNewcomer', (data) => {
            console.log("Newcomer State", data);
            setPlayers(data.players);
            setNeedsToJoin(true);
            setWaiting(true);
        });

        socket.on('roomJoined', () => {
            setNeedsToJoin(false);
            // Expecting playerListUpdate shortly
        });

        socket.on('gameOver', (data) => {
            soundManager.play('win');
            setGameOverData(data);
            setWaiting(false);
        });

        socket.on('notification', ({ message }) => {
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.style.cssText = `
               position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
               background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
               border-radius: 5px; z-index: 200; pointer-events: none;
           `;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        });

        socket.on('receiveMessage', (msg) => {
            setMessages(prev => [...prev, msg].slice(-20)); // Keep last 20
        });

        // Initial Sync: Check if we are already in the room or need to join
        socket.emit('syncGameState', { roomCode });

        return () => {
            socket.off('playerListUpdate');
            socket.off('gameStart');
            socket.off('gameStateUpdate');
            socket.off('roomStateForNewcomer');
            socket.off('roomJoined');
            socket.off('gameOver');
            socket.off('notification');
            socket.off('receiveMessage');
        };
    }, [navigate, roomCode]);

    const startGame = () => {
        socket.emit('startGame', { roomCode });
    };

    const handleJoinGame = () => {
        if (!joinName.trim()) return alert("Please enter your name");
        socket.emit('joinRoom', { name: joinName, roomCode });
    };

    const handleCardClick = (card, index) => {
        if (gameState.currentPlayerName !== players.find(p => p.id === socket.id)?.name) return;

        if (card.color === 'black') {
            setPendingCardIndex(index);
            setShowColorPicker(true);
            return;
        }
        socket.emit('playCard', { roomCode, cardIndex: index });
    };

    const handleColorPick = (color) => {
        socket.emit('playCard', { roomCode, cardIndex: pendingCardIndex, chosenColor: color });
        setShowColorPicker(false);
        setPendingCardIndex(null);
    };

    const drawCard = () => {
        if (gameState.currentPlayerName !== players.find(p => p.id === socket.id)?.name) return;
        socket.emit('drawCard', { roomCode });
        setHasDrawn(true);
    };

    const passTurn = () => {
        socket.emit('passTurn', { roomCode });
    };

    const sayUno = () => {
        soundManager.play('uno');
        socket.emit('sayUno', { roomCode });
    };

    const catchUno = (targetId) => {
        soundManager.play('uno');
        socket.emit('catchUno', { roomCode, targetId });
    };


    const sendMessage = (e) => {
        if (e) e.preventDefault();
        if (!chatInput.trim()) return;
        socket.emit('sendMessage', { roomCode, message: chatInput.trim() });
        setChatInput('');
    };

    const restartGame = () => {
        socket.emit('restartGame', { roomCode });
        setGameOverData(null);
        setWaiting(false);
    };

    // Render: Game Over Modal
    if (gameOverData) {
        const myName = players.find(p => p.id === socket.id)?.name;
        const isWinner = gameOverData.winner === myName;

        return (
            <div className="full-screen flex-center" style={{
                background: 'rgba(0,0,0,0.9)',
                color: 'white',
                flexDirection: 'column',
                zIndex: 1000
            }}>
                <h1 style={{
                    fontSize: '4rem',
                    color: isWinner ? 'gold' : '#ff5555',
                    animation: 'bounce 1s infinite'
                }}>
                    {isWinner ? "🎉 YOU WON! 🎉" : `${gameOverData.winner} WON!`}
                </h1>

                {!isWinner && <h2 style={{ fontSize: '2rem', color: '#aaa' }}>Better luck next time!</h2>}

                <div className="glass" style={{ padding: '2rem', marginTop: '2rem', width: '400px' }}>
                    <h3>Game Summary</h3>
                    <p style={{ fontSize: '1.5rem', margin: '10px 0' }}>
                        Total Score: <span style={{ color: 'var(--uno-yellow)' }}>{gameOverData.score}</span>
                    </p>

                    <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                        <p style={{ borderBottom: '1px solid #555', paddingBottom: '5px' }}>Points Breakdown:</p>
                        <ul style={{ listStyle: 'none', padding: 0, marginTop: '10px' }}>
                            {gameOverData.breakdown && gameOverData.breakdown.map((p, i) => (
                                <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                                    <span>{p.name}</span>
                                    <span style={{ color: '#ff5555' }}>+{p.points}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <button
                        className="btn-primary"
                        style={{ marginTop: '2rem', width: '100%' }}
                        onClick={restartGame}
                    >
                        Play Again 🔄
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        style={{
                            marginTop: '10px', width: '100%',
                            background: 'transparent', border: '1px solid white',
                            color: 'white', padding: '10px', borderRadius: '5px', cursor: 'pointer'
                        }}
                    >
                        Back to Lobby
                    </button>
                </div>

                {/* Simple Confetti Effect if Winner */}
                {isWinner && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                        {Array.from({ length: 50 }).map((_, i) => (
                            <div key={i} style={{
                                position: 'absolute',
                                top: '-20px',
                                left: `${Math.random() * 100}%`,
                                width: '10px', height: '10px',
                                background: ['red', 'blue', 'green', 'yellow', 'gold'][Math.floor(Math.random() * 5)],
                                animation: `fall ${2 + Math.random() * 3}s linear infinite`,
                                animationDelay: `${Math.random() * 5}s`
                            }}></div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Render: Join Form for Newcomers
    if (needsToJoin) {
        return (
            <div className="full-screen flex-center" style={{
                color: 'white'
            }}>
                <div className="glass" style={{ padding: '3rem', width: '400px', textAlign: 'center' }}>
                    <h2 style={{ marginBottom: '1.5rem' }}>Join Room <span style={{ color: 'var(--uno-yellow)' }}>{roomCode}</span></h2>
                    <input
                        type="text"
                        placeholder="Your Name"
                        value={joinName}
                        onChange={e => setJoinName(e.target.value)}
                        style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'rgba(255,255,255,0.1)',
                            color: 'white',
                            fontSize: '1rem',
                            marginBottom: '1rem',
                            width: '100%'
                        }}
                    />
                    <button className="btn-primary" style={{ width: '100%' }} onClick={handleJoinGame}>Join Game</button>

                    <div style={{ marginTop: '2rem', textAlign: 'left' }}>
                        <p style={{ fontSize: '0.9rem', color: '#aaa' }}>Players currently in lobby:</p>
                        <ul style={{ listStyle: 'none', marginTop: '0.5rem' }}>
                            {players.map(p => (
                                <li key={p.id} style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    {p.name}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        )
    }

    // Render: Waiting Room
    // Show if we are waiting for state, OR if state is loaded and status is waiting
    if ((waiting && !gameState) || (gameState && gameState.status === 'waiting')) {
        return (
            <div className="full-screen flex-center" style={{ flexDirection: 'column', color: 'white' }}>
                <div className="glass" style={{ padding: '2rem', minWidth: '300px', textAlign: 'center' }}>
                    <h2>Waiting Room: <span style={{ color: 'var(--uno-green)' }}>{roomCode}</span></h2>

                    <div style={{ margin: '20px 0' }}>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href)
                                    .then(() => alert("Link copied to clipboard!"))
                                    .catch(() => alert("Failed to copy link. Please copy URL manually."));
                            }}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                padding: '8px 16px',
                                borderRadius: '20px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.9rem',
                                cursor: 'pointer'
                            }}
                        >
                            🔗 Copy Invite Link
                        </button>
                    </div>

                    <ul style={{ listStyle: 'none', margin: '20px 0', fontSize: '1.2rem', textAlign: 'left' }}>
                        {players.map(p => (
                            <li key={p.id} style={{
                                padding: '10px',
                                background: p.id === socket.id ? 'rgba(85, 170, 85, 0.2)' : 'rgba(255,255,255,0.05)',
                                margin: '5px 0',
                                borderRadius: '5px',
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>{p.name}</span>
                                {p.id === socket.id && <span style={{ opacity: 0.5 }}>(You)</span>}
                            </li>
                        ))}
                    </ul>

                    {players.length >= 2 && players[0].id === socket.id ? (
                        <button className="btn-primary" onClick={startGame}>Start Game ({players.length}/6)</button>
                    ) : (
                        <div style={{ opacity: 0.7, marginTop: '20px' }}>
                            <p>{players.length < 2 ? 'Waiting for more players...' : 'Waiting for host to start...'}</p>
                            <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>{players.length}/6 Players</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (!gameState) return <div className="full-screen flex-center text-white">Loading...</div>;

    const myPlayer = players.find(p => p.id === socket.id);
    const myTurn = gameState.currentPlayerName === myPlayer?.name;
    const myHandLength = gameState.hand.length;

    // Helper to get opponent position based on index relative to me
    // We want them spaced out in an arc: Left, Top-Left, Top, Top-Right, Right
    const getOpponentStyle = (index, total) => {
        // Simple fixed positions for up to 5 opponents
        const positions = [
            { top: '30%', left: '10%' }, // Left
            { top: '15%', left: '30%' }, // Top Left
            { top: '10%', left: '50%', transform: 'translateX(-50%)' }, // Top
            { top: '15%', right: '30%' }, // Top Right
            { top: '30%', right: '10%' }  // Right
        ];

        // If fewer players, pick balanced slots
        if (total === 1) return positions[2]; // Top
        if (total === 2) return [positions[1], positions[3]][index];
        if (total === 3) return [positions[0], positions[2], positions[4]][index];

        return positions[index] || positions[0];
    };

    return (
        <div className="full-screen" style={{
            background: 'radial-gradient(circle at center, #8B0000 20%, #2a0000 100%)',
            overflow: 'hidden',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
        }}>
            {/* 3D Perspective Container */}
            <div className="game-perspective-container">
                {/* The Table Plane */}
                <div className="game-table">
                    {/* Center Area: Color Wheel & Decks */}
                    <div className="center-area">
                        {/* Direction Arrows Ring */}
                        <style>
                            {`
                                @keyframes spin {
                                    from { transform: rotate(0deg); }
                                    to { transform: rotate(360deg); }
                                }
                            `}
                        </style>
                        <div className="direction-ring" style={{
                            position: 'absolute',
                            animation: 'spin 8s linear infinite',
                            transform: gameState.direction === 1 ? 'none' : 'scaleX(-1)',
                            pointerEvents: 'none',
                            opacity: 0.8,
                            zIndex: 0
                        }}>
                            <svg width="100%" height="100%" viewBox="0 0 200 200" style={{ overflow: 'visible' }}>
                                <defs>
                                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" style={{ stopColor: 'rgba(255,255,0,0)', stopOpacity: 0 }} />
                                        <stop offset="100%" style={{ stopColor: 'rgba(255,255,0,0.8)', stopOpacity: 1 }} />
                                    </linearGradient>
                                    <marker id="arrowHead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                        <path d="M0,0 L6,3 L0,6 L2,3 Z" fill="#ffff00" />
                                    </marker>
                                </defs>

                                {/* 3 Arcs creating a circle effect */}
                                <path id="curve1" d="M 100, 20 A 80, 80 0 0, 1 180, 100" fill="none" stroke="url(#grad1)" strokeWidth="4" markerEnd="url(#arrowHead)" />
                                <path id="curve2" d="M 180, 100 A 80, 80 0 0, 1 100, 180" fill="none" stroke="url(#grad1)" strokeWidth="4" markerEnd="url(#arrowHead)" transform="rotate(120, 100, 100)" />
                                <path id="curve3" d="M 100, 180 A 80, 80 0 0, 1 20, 100" fill="none" stroke="url(#grad1)" strokeWidth="4" markerEnd="url(#arrowHead)" transform="rotate(240, 100, 100)" />
                            </svg>
                        </div>

                        {/* Color Wheel - Segmented Circle */}
                        <div className="color-wheel" style={{
                            position: 'relative',
                            borderRadius: '50%', overflow: 'hidden',
                            boxShadow: '0 0 50px rgba(0,0,0,0.5)',
                            transform: 'rotate(45deg)', // Tilt to look like X
                            border: '5px solid white'
                        }}>
                            {/* Segments */}
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '50%', background: '#ff5555', opacity: gameState.currentColor === 'red' ? 1 : 0.3 }}></div>
                            <div style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '50%', background: '#ffaa00', opacity: gameState.currentColor === 'yellow' ? 1 : 0.3 }}></div>
                            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '50%', height: '50%', background: '#5555ff', opacity: gameState.currentColor === 'blue' ? 1 : 0.3 }}></div>
                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '50%', height: '50%', background: '#55aa55', opacity: gameState.currentColor === 'green' ? 1 : 0.3 }}></div>

                            {/* Inner Circle (Logo or Active Color) */}
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)',
                                width: '60px', height: '60px', background: 'white', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: '900', color: '#333', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
                            }}>
                                UNO
                            </div>
                        </div>

                        {/* Draw Pile (Left of Wheel) */}
                        <div className="draw-pile" style={{
                            position: 'absolute',
                            cursor: (myTurn && !hasDrawn) ? 'pointer' : 'default',
                            transform: 'translateZ(20px)'
                        }} onClick={drawCard}>
                            {/* Make it look like a stack */}
                            <div style={{ position: 'absolute', top: -4, left: -4 }}><Card style={{ transform: 'scale(0.8)' }} /></div>
                            <div style={{ position: 'absolute', top: -2, left: -2 }}><Card style={{ transform: 'scale(0.8)' }} /></div>
                            <Card style={{ transform: 'scale(0.8)', boxShadow: '5px 5px 15px rgba(0,0,0,0.5)' }} />
                        </div>

                        {/* Discard Pile (Below/On Wheel) */}
                        <div className="discard-pile" style={{
                            position: 'absolute',
                            transform: 'rotate(-10deg) translateZ(30px)'
                        }}>
                            {gameState.topCard && (() => {
                                // Visual Trick: If top card is Wild, show it as the chosen color
                                const displayCard = (gameState.topCard.color === 'black' && gameState.currentColor)
                                    ? { ...gameState.topCard, color: gameState.currentColor }
                                    : gameState.topCard;

                                return <Card card={displayCard} isPlayable={false} style={{ transform: 'scale(0.9)', boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }} />;
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Turn Indicator (Banner at Top) */}
            <div style={{
                position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
                background: myTurn ? 'linear-gradient(90deg, transparent, #4ade80, transparent)' : 'transparent',
                padding: '10px 100px',
                color: 'white', fontWeight: 'bold', fontSize: '1.5rem',
                textShadow: '0 2px 4px black',
                zIndex: 50
            }}>
                {myTurn ? "⚠️ YOUR TURN ⚠️" : `${gameState.currentPlayerName.toUpperCase()}'S TURN`}
            </div>

            {/* Opponents (2D Overlay) */}
            {gameState.opponents.map((op, i) => {
                const posStyle = getOpponentStyle(i, gameState.opponents.length);
                const isOpTurn = gameState.currentPlayerName === op.name;

                return (
                    <div key={i} style={{
                        position: 'absolute',
                        ...posStyle,
                        zIndex: 20
                    }}>
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            opacity: op.connected ? 1 : 0.5,
                            transform: isOpTurn ? 'scale(1.1)' : 'scale(1)',
                            transition: 'all 0.3s'
                        }}>
                            {/* Player Label */}
                            <div style={{
                                background: 'linear-gradient(to bottom, #ff9966, #ff5e62)',
                                padding: '5px 15px', borderRadius: '15px',
                                color: 'white', fontWeight: 'bold', fontSize: '0.9rem',
                                marginBottom: '-10px', zIndex: 2,
                                border: '2px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                            }}>
                                {op.name}
                            </div>

                            {/* Avatar Box */}
                            <div style={{
                                width: '80px', height: '80px', background: '#333',
                                borderRadius: '10px', border: `3px solid ${isOpTurn ? '#ffff00' : 'white'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: isOpTurn ? '0 0 20px #ffff00' : '0 4px 10px rgba(0,0,0,0.5)',
                                overflow: 'hidden'
                            }}>
                                <span style={{ fontSize: '2.5rem' }}>🤖</span>
                            </div>

                            {/* Card Count Badge */}
                            <div style={{
                                position: 'absolute', right: '-15px', bottom: '10px',
                                background: 'white', color: 'black', fontWeight: 'bold',
                                width: '30px', height: '35px', borderRadius: '5px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid #ccc',
                                boxShadow: '2px 2px 5px rgba(0,0,0,0.3)'
                            }}>
                                <span style={{ fontSize: '0.8rem' }}>🃏</span> {op.cards}
                            </div>
                        </div>

                        {/* Catch UNO Button for this specific opponent (if needed, but we have global) */}
                        {/* We will keep the Global one for UI cleanliness as requested before centered, but user asked for "same layout" which usually implies interaction on the player. 
                             However, the user asked for button in bottom right. So keeping it separate is better. 
                         */}
                    </div>
                )
            })}

            {/* Pass / UNO / Catch Buttons (Bottom Right) */}
            <div className="game-actions-container" style={{ position: 'fixed', bottom: '30px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', zIndex: 100 }}>
                {/* Pass Button */}
                {hasDrawn && myTurn && (
                    <button onClick={passTurn} className="btn-primary" style={{ background: '#555', padding: '15px 30px', fontSize: '1.2rem', animation: 'pulse 1s infinite' }}>
                        PASS TURN
                    </button>
                )}

                {/* UNO Button - Rectangular Card Style */}
                {myHandLength <= 2 && (
                    <button onClick={sayUno} disabled={gameState.saidUno}
                        style={{
                            width: '120px', height: '80px',
                            background: gameState.saidUno ? '#555' : '#e61d1d',
                            border: '4px solid #ffd700',
                            borderRadius: '10px',
                            transform: 'rotate(-10deg)',
                            boxShadow: '0 5px 15px rgba(0,0,0,0.5), 0 0 10px #ffd700',
                            cursor: gameState.saidUno ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'transform 0.2s',
                            animation: !gameState.saidUno ? 'pulse 2s infinite' : 'none',
                        }}
                        onMouseEnter={e => !gameState.saidUno && (e.currentTarget.style.transform = 'rotate(-10deg) scale(1.1)')}
                        onMouseLeave={e => !gameState.saidUno && (e.currentTarget.style.transform = 'rotate(-10deg) scale(1)')}
                    >
                        <span style={{
                            fontFamily: "'Arial Black', 'Impact', sans-serif",
                            fontSize: '2rem',
                            color: '#ffd700', // Yellow text
                            fontStyle: 'italic',
                            textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 3px 3px 5px rgba(0,0,0,0.5)',
                            letterSpacing: '2px',
                            transform: 'skewX(-10deg)'
                        }}>
                            {gameState.saidUno ? 'SAID' : 'UNO!'}
                        </span>
                    </button>
                )}

                {/* Global Catch */}
                {gameState.opponents.some(op => op.cards === 1 && !op.saidUno) && (
                    <button onClick={() => {
                        const target = gameState.opponents.find(op => op.cards === 1 && !op.saidUno);
                        if (target) catchUno(target.id);
                    }} style={{
                        background: '#ff0000', color: 'white', border: '3px solid white',
                        borderRadius: '30px', padding: '10px 20px', fontWeight: 'bold',
                        animation: 'bounce 0.8s infinite', cursor: 'pointer'
                    }}>
                        CATCH UNO!
                    </button>
                )}
            </div>

            {/* My Hand - Fanned Out 3D */}
            <div className="my-hand-container" style={{
                position: 'fixed', bottom: '-40px', left: '50%', transform: 'translateX(-50%)',
                height: '250px', width: '80%',
                display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
                perspective: '1000px',
                zIndex: 50
            }}>
                {gameState.hand.map((card, index) => {
                    const total = gameState.hand.length;
                    const midpoint = (total - 1) / 2;
                    const rotate = (index - midpoint) * 5; // Fan spread
                    const translateY = Math.abs(index - midpoint) * 10; // Arch effect

                    const top = gameState.topCard;
                    let playable = false;
                    if (myTurn) {
                        if (card.color === 'black') playable = true;
                        else if (card.color === gameState.currentColor) playable = true;
                        else if (card.value === top.value) playable = true;
                    }

                    return (
                        <div key={index}
                            onClick={() => handleCardClick(card, index)}
                            style={{
                                marginLeft: index === 0 ? 0 : '-50px',
                                transform: `rotate(${rotate}deg) translateY(${translateY}px) translateY(${playable ? '-20px' : '0'})`,
                                transition: 'transform 0.2s',
                                cursor: playable ? 'pointer' : 'default',
                                zIndex: index
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = `rotate(${rotate}deg) translateY(-40px) scale(1.1) zIndex(100)`}
                            onMouseLeave={e => e.currentTarget.style.transform = `rotate(${rotate}deg) translateY(${translateY}px) translateY(${playable ? '-20px' : '0'})`}
                        >
                            <Card card={card} isPlayable={playable} style={{ boxShadow: '-5px 5px 10px rgba(0,0,0,0.3)' }} />
                        </div>
                    )
                })}
            </div>

            {/* Color Picker Modal */}
            {showColorPicker && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 1000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div className="glass" style={{ padding: '20px', textAlign: 'center', background: '#222', border: '2px solid white' }}>
                        <h3 style={{ color: 'white', marginBottom: '20px' }}>Choose Next Color</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            {['red', 'blue', 'green', 'yellow'].map(c => (
                                <button key={c} onClick={() => handleColorPick(c)} style={{
                                    width: '100px', height: '100px', background: `var(--uno-${c})`,
                                    border: '4px solid white', borderRadius: '15px',
                                    cursor: 'pointer', transform: 'scale(1)', transition: 'transform 0.1s'
                                }}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {/* Chat Box - Bottom Left */}
            <button className="chat-toggle-btn" onClick={() => setIsChatOpen(!isChatOpen)}>💬</button>
            <div className={`glass chat-container ${isChatOpen ? 'open' : ''}`}>
                {/* Messages Area */}
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '10px',
                    display: 'flex', flexDirection: 'column', gap: '5px',
                    fontSize: '0.9rem'
                }}>
                    {messages.map((msg, i) => (
                        <div key={i}>
                            <span style={{ fontWeight: 'bold', color: msg.sender === 'System' ? '#aaa' : 'var(--uno-yellow)' }}>
                                {msg.sender}:
                            </span> <span style={{ color: '#fff' }}>{msg.text}</span>
                        </div>
                    ))}
                    {/* Auto scroll stub */}
                    <div ref={el => el?.scrollIntoView({ behavior: "smooth" })}></div>
                </div>
                {/* Input Area */}
                <form onSubmit={sendMessage} style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        placeholder="Say something..."
                        style={{
                            flex: 1, background: 'transparent',
                            border: 'none', color: 'white', padding: '10px',
                            outline: 'none'
                        }}
                    />
                    <button type="submit" style={{
                        background: 'transparent', border: 'none',
                        color: 'var(--uno-yellow)', fontWeight: 'bold',
                        padding: '0 15px', cursor: 'pointer'
                    }}>Send</button>
                </form>
            </div>
        </div>
    );
}
