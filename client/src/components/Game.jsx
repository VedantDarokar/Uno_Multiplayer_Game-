import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import Card from './Card';

export default function Game() {
    const params = useParams();
    const roomCode = params.roomCode.toUpperCase(); // Ensure room code is handled in uppercase
    const navigate = useNavigate();
    const [gameState, setGameState] = useState(null);
    const [waiting, setWaiting] = useState(true);
    const [players, setPlayers] = useState([]);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [pendingCardIndex, setPendingCardIndex] = useState(null);

    // New State for direct join (link access)
    const [needsToJoin, setNeedsToJoin] = useState(false);
    const [joinName, setJoinName] = useState('');

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
            setGameState(state);
            setWaiting(false);
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

        socket.on('gameOver', ({ winner }) => {
            alert(`${winner} Won!`);
            navigate('/');
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
    };

    const sayUno = () => {
        socket.emit('sayUno', { roomCode });
    };

    const catchUno = (targetId) => {
        socket.emit('catchUno', { roomCode, targetId });
    };

    // Render: Join Form for Newcomers
    if (needsToJoin) {
        return (
            <div className="full-screen flex-center" style={{
                background: 'radial-gradient(circle at center, #2e2e3a 0%, #1a1a1a 100%)',
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
                        <button className="btn-primary" onClick={startGame}>Start Game ({players.length}/4)</button>
                    ) : (
                        <div style={{ opacity: 0.7, marginTop: '20px' }}>
                            <p>{players.length < 2 ? 'Waiting for more players...' : 'Waiting for host to start...'}</p>
                            <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>{players.length}/4 Players</p>
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

    return (
        <div className="full-screen" style={{
            position: 'relative',
            background: 'radial-gradient(circle, #2b4532 0%, #1a1a1a 100%)', // Green table feel
            overflow: 'hidden'
        }}>
            {/* Opponents Area */}
            <div style={{
                position: 'absolute', top: '20px', left: 0, right: 0,
                display: 'flex', justifyContent: 'center', gap: '40px'
            }}>
                {gameState.opponents.map((op, i) => {
                    return (
                        <div key={i} style={{ textAlign: 'center', color: 'white', position: 'relative' }}>
                            <div style={{
                                width: '60px', height: '60px', borderRadius: '50%', background: '#555',
                                margin: '0 auto 10px', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                            }}>
                                👤
                            </div>
                            <div style={{ fontWeight: 'bold' }}>{op.name}</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{op.cards} Cards</div>

                            {/* Catch UNO Button */}
                            {op.cards === 1 && !op.saidUno && (
                                <button
                                    onClick={() => catchUno(op.id)}
                                    style={{
                                        position: 'absolute', top: '0', right: '-40px',
                                        background: 'red', color: 'white', border: 'none', borderRadius: '5px',
                                        fontSize: '0.7rem', padding: '2px 5px', cursor: 'pointer',
                                        animation: 'pulse 1s infinite'
                                    }}
                                >
                                    CATCH!
                                </button>
                            )}

                            {/* Tiny Cards Representation */}
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '5px', height: '20px' }}>
                                {Array.from({ length: Math.min(op.cards, 5) }).map((_, idx) => (
                                    <div key={idx} style={{
                                        width: '10px', height: '15px', background: 'var(--uno-red)', margin: '0 1px', borderRadius: '2px', border: '1px solid white'
                                    }}></div>
                                ))}
                                {op.cards > 5 && <span>...</span>}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Center Area: Deck & Discard */}
            <div className="flex-center" style={{
                position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)',
                gap: '40px'
            }}>
                {/* Draw Pile */}
                <div onClick={drawCard} style={{ cursor: myTurn ? 'pointer' : 'default' }}>
                    <Card /> {/* Renders back */}
                </div>

                {/* Discard Pile */}
                <div>
                    {gameState.topCard && <Card card={gameState.topCard} isPlayable={false} />}
                </div>

                {/* Current Color Indicator */}
                <div style={{
                    position: 'absolute', top: '-70px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.6)', padding: '5px 20px', borderRadius: '20px',
                    border: `2px solid ${gameState.currentColor}`, color: 'white',
                    whiteSpace: 'nowrap'
                }}>
                    Current Color: <span style={{ color: gameState.currentColor, fontWeight: 'bold' }}>{gameState.currentColor?.toUpperCase()}</span>
                </div>

                {/* Turn Indicator */}
                <div style={{
                    position: 'absolute', bottom: '-100px', left: '50%', transform: 'translateX(-50%)',
                    fontSize: '1.5rem', fontWeight: 'bold',
                    color: myTurn ? '#4ade80' : '#ffffff',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    whiteSpace: 'nowrap'
                }}>
                    {myTurn ? "YOUR TURN" : `${gameState.currentPlayerName}'s Turn`}
                </div>
                {/* UNO Button for Me */}
                {myHandLength <= 2 && (
                    <button
                        onClick={sayUno}
                        style={{
                            position: 'absolute', right: '-160px', top: '0',
                            width: '80px', height: '80px', borderRadius: '50%',
                            background: 'linear-gradient(45deg, #ff0000, #ffaa00)',
                            color: 'white', fontWeight: 'bold', fontSize: '1.2rem',
                            border: '4px solid white', cursor: 'pointer',
                            boxShadow: '0 0 20px rgba(255, 170, 0, 0.6)'
                        }}
                    >
                        UNO!
                    </button>
                )}
                {/* Direction */}
                <div style={{
                    position: 'absolute', right: '-120px', bottom: '20px',
                    fontSize: '2rem',
                    transform: gameState.direction === 1 ? 'none' : 'scaleX(-1)'
                }}>
                    🔄
                </div>
            </div>

            {/* My Hand */}
            <div style={{
                position: 'absolute', bottom: '20px', left: 0, right: 0,
                display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
                marginBottom: '20px', height: '180px',
                padding: '0 20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                    {gameState.hand.map((card, index) => {
                        // Check playability
                        const top = gameState.topCard;
                        let playable = false;
                        if (myTurn) {
                            if (card.color === 'black') playable = true;
                            else if (card.color === gameState.currentColor) playable = true;
                            else if (card.value === top.value) playable = true;
                        }

                        return (
                            <div key={index} style={{
                                marginLeft: index === 0 ? 0 : '-40px',
                                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                zIndex: index,
                                transformOrigin: 'bottom center',
                            }}
                                className="card-wrapper"
                            >
                                <div style={{
                                    transform: `translateY(${playable ? '-10px' : '0'})`,
                                    cursor: playable ? 'pointer' : 'default',
                                    opacity: (myTurn && !playable) ? 0.6 : 1
                                }}>
                                    <Card
                                        card={card}
                                        isPlayable={playable}
                                        onClick={() => handleCardClick(card, index)}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Color Picker Modal */}
            {showColorPicker && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 100,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div className="glass" style={{ padding: '20px', textAlign: 'center' }}>
                        <h3 style={{ color: 'white', marginBottom: '20px' }}>Choose Color</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            {['red', 'blue', 'green', 'yellow'].map(c => (
                                <button key={c} onClick={() => handleColorPick(c)} style={{
                                    width: '80px', height: '80px', background: `var(--uno-${c})`,
                                    border: '2px solid white', borderRadius: '12px',
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
        </div>
    );
}
