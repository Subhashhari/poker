import { io } from 'socket.io-client';

/**
 * Single shared socket.io instance.
 * Imported wherever needed, never instantiated inside components.
 */
const URL = import.meta.env.PROD
  ? window.location.origin
  : 'http://localhost:3001';

export const socket = io(URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});
