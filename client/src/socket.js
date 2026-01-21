import { io } from "socket.io-client";

// In production, this should be the deployed server URL.
// For local dev, it's localhost:3000
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || (window.location.hostname === 'localhost'
    ? "http://localhost:4000"
    : `http://${window.location.hostname}:4000`);

export const socket = io(SERVER_URL, {
    autoConnect: false
});
