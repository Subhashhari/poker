import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import { RoomManager } from './rooms/RoomManager.js';
import { registerHandlers } from './socket/eventHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Serve React build in production
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Initialize room manager and register socket handlers
const roomManager = new RoomManager();
registerHandlers(io, roomManager);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Poker server running on http://localhost:${PORT}`);
});

export { io, app, server };
