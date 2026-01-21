import React from 'react';

const COLORS = {
    red: '#ff5555',
    blue: '#5555ff',
    green: '#55aa55',
    yellow: '#ffaa00',
    black: '#2d2d2d'
};

const getDisplayValue = (val) => {
    if (val === 'reverse') return '⇄';
    if (val === 'skip') return '⊘';
    if (val === 'wild') return '🌈'; // Or just keep 'wild' if preferred, but icon is nice
    return val;
};

export default function Card({ card, onClick, isPlayable, style }) {
    // If no card (e.g. back of card), show back design
    if (!card) {
        return (
            <div
                className="card-back"
                style={{
                    width: '100px',
                    height: '150px',
                    background: '#111',
                    borderRadius: '12px',
                    border: '4px solid white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    ...style
                }}
            >
                <div style={{
                    width: '80%', height: '80%',
                    background: 'radial-gradient(ellipse at center, #ff5555 0%, #ff5555 50%, #111 51%)',
                    transform: 'rotate(45deg)',
                    borderRadius: '50%'
                }}>
                    <span style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)',
                        color: 'white', fontWeight: 'bold', fontSize: '1.2rem', textShadow: '1px 1px 2px black'
                    }}>UNO</span>
                </div>
            </div>
        );
    }

    // Front of card
    const bgColor = COLORS[card.color] || '#333';

    return (
        <div
            onClick={isPlayable ? onClick : undefined}
            className={`card-animation ${isPlayable ? 'cursor-pointer' : ''}`}
            style={{
                width: '100px',
                height: '150px',
                background: bgColor,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                border: '4px solid white',
                userSelect: 'none',
                // opacity: isPlayable ? 1 : 0.6, // Removed transparency
                ...style // Allow overriding (e.g. for rotation or absolute positioning)
            }}
        >
            <span style={{
                fontSize: card.value === 'reverse' || card.value === 'skip' ? '4rem' : '3rem', // Larger for symbols
                fontWeight: '900',
                color: 'white',
                textShadow: '2px 2px 0px rgba(0,0,0,0.2)'
            }}>
                {getDisplayValue(card.value)}
            </span>

            {/* Small corner values */}
            <span style={{ position: 'absolute', top: '5px', left: '5px', fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>
                {getDisplayValue(card.value)}
            </span>
            <span style={{ position: 'absolute', bottom: '5px', right: '5px', fontSize: '1.2rem', fontWeight: 'bold', color: 'white', transform: 'rotate(180deg)' }}>
                {getDisplayValue(card.value)}
            </span>

            {/* Center Oval */}
            <div style={{
                position: 'absolute',
                width: '80%',
                height: '60%',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.2)',
                transform: 'rotate(-45deg)',
                pointerEvents: 'none'
            }}></div>
        </div>
    );
}
