import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(serverUrl: string): Socket {
  if (socket?.connected) return socket;
  if (socket) socket.disconnect();
  socket = io(serverUrl, { transports: ['polling'] });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
