// load_test.mjs – Simple load test for the Poker WebSocket server (ESM)
// Usage: node scripts/load_test.mjs <numClients>
// Connects <numClients> sockets, measures the round‑trip latency of a custom ping/pong.

import { io } from 'socket.io-client';
import { performance } from 'perf_hooks';

const NUM_CLIENTS = parseInt(process.argv[2] || '100', 10);
const SERVER_URL = 'http://localhost:3001';

let connected = 0;
let completed = 0;
let latencies = [];

function createClient(id) {
  const socket = io(SERVER_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    connected++;
    const start = performance.now();
    socket.emit('test-ping', { clientId: id });
    socket.once('test-pong', () => {
      const latency = performance.now() - start;
      latencies.push(latency);
      completed++;
      socket.disconnect();
      if (completed === NUM_CLIENTS) {
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        console.log(`Clients: ${NUM_CLIENTS}, Connected: ${connected}, Avg round‑trip latency: ${avg.toFixed(2)} ms`);
      }
    });
  });

  socket.on('connect_error', (err) => {
    console.error('Connection error', err.message);
  });
}

for (let i = 0; i < NUM_CLIENTS; i++) {
  createClient(i);
}
