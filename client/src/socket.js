import { io } from "socket.io-client";

// PRODUCTION SETUP (Vercel):
// 1. You MUST set the environment variable 'VITE_SERVER_URL' in your Vercel Project Settings.
// 2. This variable should point to your deploy backend URL (e.g., https://your-app-api.onrender.com).
// 3. If you do not set this, it defaults to "/", which only works if you configured Vercel Rewrites to proxy /socket.io.

const isDev = import.meta.env.DEV;
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || (isDev ? "http://localhost:4000" : "/");

console.log(`[Socket] Target Server: ${SERVER_URL}`);

export const socket = io(SERVER_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'], // Try WebSocket first for better performance on Vercel/mobile
    withCredentials: true
});
