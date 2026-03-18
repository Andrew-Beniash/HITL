import { io, type Socket } from "socket.io-client";

const COLLAB_URL =
  typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_COLLAB_URL
    ? (import.meta as any).env.VITE_COLLAB_URL
    : "http://localhost:3004";

let _socket: Socket | null = null;

export function initSocket(token: string): Socket {
  if (_socket?.connected) return _socket;

  // Disconnect any stale disconnected socket before creating a new one
  _socket?.disconnect();

  _socket = io(COLLAB_URL, {
    auth: { token },
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  return _socket;
}

export function getSocket(): Socket | null {
  return _socket;
}

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
