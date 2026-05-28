/**
 * Phase 3 Integration Test — Socket.io events end-to-end.
 *
 * Tests: create room → join room → start game → play actions → round completion.
 * Run: Start the server first, then run this test.
 *
 * Run: node server/gameLogic/__tests__/integration.test.js
 */
import { io as ioClient } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== Integration Tests ===\n');

  // Create 3 client sockets
  const client1 = ioClient(SERVER_URL, { transports: ['websocket'] });
  const client2 = ioClient(SERVER_URL, { transports: ['websocket'] });
  const client3 = ioClient(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise(r => client1.on('connect', r)),
    new Promise(r => client2.on('connect', r)),
    new Promise(r => client3.on('connect', r)),
  ]);

  console.log('Connected all 3 clients');

  // ─── 1. Create Room ───
  console.log('\n1. Create Room');
  client1.emit('create-room', { name: 'Alice', uuid: 'uuid-1' });
  const createResult = await waitForEvent(client1, 'room-created');
  assert(createResult.roomId && createResult.roomId.length === 6, `Room created: ${createResult.roomId}`);

  const roomId = createResult.roomId;

  // Wait for room-update
  const roomUpdate1 = await waitForEvent(client1, 'room-update');
  assert(roomUpdate1.players.length === 1, 'Room has 1 player');
  assert(roomUpdate1.players[0].name === 'Alice', 'Player is Alice');

  // ─── 2. Join Room ───
  console.log('\n2. Join Room');
  client2.emit('join-room', { name: 'Bob', uuid: 'uuid-2', roomId });
  const joinResult = await waitForEvent(client2, 'room-joined');
  assert(joinResult.roomId === roomId, 'Bob joined correct room');

  // Both should get room update
  const roomUpdate2 = await waitForEvent(client1, 'room-update');
  assert(roomUpdate2.players.length === 2, 'Room now has 2 players');

  // ─── 3. Join third player ───
  console.log('\n3. Third player joins');
  client3.emit('join-room', { name: 'Charlie', uuid: 'uuid-3', roomId });
  await waitForEvent(client3, 'room-joined');
  const roomUpdate3 = await waitForEvent(client1, 'room-update');
  assert(roomUpdate3.players.length === 3, 'Room now has 3 players');

  // ─── 4. Start Game ───
  console.log('\n4. Start Game');
  const gameUpdatePromises = [
    waitForEvent(client1, 'game-update'),
    waitForEvent(client2, 'game-update'),
    waitForEvent(client3, 'game-update'),
  ];
  client1.emit('start-game', { roomId, uuid: 'uuid-1' });

  let [state1, state2, state3] = await Promise.all(gameUpdatePromises);

  assert(state1.gameState.status === 'in-progress', 'Game is in-progress');

  // Find which client is the current player
  function getClientByUUID(uuid) {
    if (uuid === 'uuid-1') return client1;
    if (uuid === 'uuid-2') return client2;
    if (uuid === 'uuid-3') return client3;
  }

  // ─── 5. Play full hand until showdown ───
  console.log('\n5. Play full hand until showdown (everyone calls)');
  
  let roundOverResult = null;
  // Listen for round-over on client1
  client1.once('round-over', (data) => {
    roundOverResult = data;
  });

  // Loop until round-over
  let failsafe = 30;
  while (!roundOverResult && failsafe > 0) {
    const currentStreet = state1.gameState.currentRound.currentStreet;
    if (!currentStreet) break; // Should not happen

    const cpUUID = currentStreet.currentPlayerUUID;
    const currentClient = getClientByUUID(cpUUID);

    // Setup listener before emitting
    const updatePromise = waitForEvent(client1, 'game-update', 1500).catch(()=>null);

    // Make the call action
    currentClient.emit('player-action', { roomId, uuid: cpUUID, action: { type: 'call' } });

    const update = await updatePromise;

    if (roundOverResult) {
      break;
    }
    if (update && update.gameState) {
      state1 = update;
    }
    failsafe--;
  }

  assert(failsafe > 0, 'Completed hand without infinite loop');
  assert(roundOverResult !== null, 'Received round-over event');
  assert(roundOverResult.result.pot > 0, `Pot awarded: ${roundOverResult.result.pot}`);

  // ─── 6. Start Next Hand ───
  console.log('\n6. Start Next Hand');
  const nextHandPromise = waitForEvent(client1, 'game-update', 5000);
  console.log('[TEST] Emitting start-next-round');
  client1.emit('start-next-round', { roomId, uuid: 'uuid-1' });
  console.log('[TEST] Awaiting nextHandPromise');
  const nextHandState = await nextHandPromise;
  console.log('[TEST] Received nextHandState:', !!nextHandState);
  assert(nextHandState.gameState.currentRound.roundNumber === 2, 'Round number incremented to 2');

  // ─── 7. Mid-hand Disconnect ───
  console.log('\n7. Mid-hand Disconnect');
  // client3 disconnects
  client3.disconnect();
  const discState = await waitForEvent(client1, 'game-update');
  
  const p3 = discState.gameState.players.find(p => p.uuid === 'uuid-3');
  assert(p3.status === 'disconnected', 'Player 3 marked as disconnected');

  // ─── Cleanup ───
  console.log('\n--- Cleanup ---');
  client1.disconnect();
  client2.disconnect();

  await sleep(500);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
