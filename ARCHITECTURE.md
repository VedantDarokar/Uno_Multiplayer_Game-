# UNO Online - System Architecture

## Overview
This is a real-time multiplayer implementation of the exciting UNO card game, built using the **MERN** stack (MongoDB, Express, React, Node.js) and **Socket.IO** for bidirectional event-based communication.

## Tech Stack
- **Frontend**: React.js (Vite), CSS3 (Variables, Glassmorphism), Socket.IO Client.
- **Backend**: Node.js, Express.js, Socket.IO Server.
- **Database**: MongoDB (Mongoose) for persisting game history and player stats.

## Folder Structure
```
UNO/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/     # UI Components (Game, Lobby, Card)
│   │   ├── socket.js       # Socket connection instance
│   │   ├── App.jsx         # Main router and event listeners
│   │   └── index.css       # Global styles and variables
│   └── package.json
└── server/                 # Node.js Backend
    ├── models/             # Database Schemas
    │   ├── User.js         # Player stats (wins, matches)
    │   └── Game.js         # Game history archive
    ├── index.js            # Main server entry (Socket logic + API)
    └── package.json
```

## Data Flow
1.  **Connection**: Client connects to `ws://localhost:4000`.
2.  **Lobby**:
    -   `createRoom`: Generates a random 6-char code.
    -   `joinRoom`: Validates code and adds player to in-memory `rooms` object.
    -   `playerListUpdate`: Broadcasts new player list to room.
3.  **Gameplay**:
    -   **State**: Server maintains the "Source of Truth" (deck, hands, turn index).
    -   **Events**:
        -   `playCard`: Client sends index. Server validates move (color/value match).
        -   `gameStateUpdate`: Server sends sanitized state (opponent hands hidden) to all clients.
        -   `drawCard`, `sayUno`, `catchUno`: Specialized actions updating server state.
4.  **Persistence**:
    -   On `gameOver`, the server saves the match details to MongoDB and increments winner/player stats in `User` collection.
    -   Leaderboard fetches `User` stats sorted by wins.

## Key Features
-   **Real-time Interaction**: Instant card plays and turn updates.
-   **UNO Rules Engine**: Enforces valid moves, turn order, reversals, and skips server-side.
-   **Anti-Cheat**: Clients only receive their own full hand; opponents' hands are just counts.
-   **UNO Mechanic**: Players must say "UNO" buttons or risk being "Caught" by opponents.

## Testing Instructions
1.  **Start DB**: Ensure MongoDB is running (`mongod`).
2.  **Start Server**: `cd server && npm start` (Runs on port 4000).
3.  **Start Client**: `cd client && npm run dev` (Runs on port 5173).
4.  **Play**:
    -   Open two different browser windows (Incognito recommended).
    -   Create a room in one.
    -   Copy code and join from the other.
    -   Start game!
