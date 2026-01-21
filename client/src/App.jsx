import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { socket } from './socket';
import Lobby from './components/Lobby';
import Game from './components/Game';

function AppContent() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const navigate = useNavigate();

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onConnectError(err) {
      console.error("Connection Error:", err);
      // Optional: alert only if persistent or critical
      // alert("Cannot connect to game server. Is it running?");
    }

    function onRoomCreated({ roomCode }) {
      navigate(`/game/${roomCode}`);
    }

    function onRoomJoined({ roomCode }) {
      navigate(`/game/${roomCode}`);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('roomCreated', onRoomCreated);
    socket.on('roomJoined', onRoomJoined);

    // Connect immediately
    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('roomCreated', onRoomCreated);
      socket.off('roomJoined', onRoomJoined);
      socket.off('error', onError);
    };
  }, [navigate]);

  function onError({ message }) {
    alert(`Error: ${message}`);
  }

  useEffect(() => {
    socket.on('error', onError);
    return () => {
      socket.off('error', onError);
    }
  }, []);

  return (
    <div className="full-screen bg-pattern">
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/game/:roomCode" element={<Game />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
