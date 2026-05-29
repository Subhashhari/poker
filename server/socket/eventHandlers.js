/**
 * eventHandlers.js — Socket.io event handlers.
 *
 * The sole bridge between networking (socket.io) and game logic.
 * Includes a 20-second turn timer that auto-folds on timeout.
 */

import db from '../db/index.js';

const TURN_TIMEOUT_MS = 20_000;

/** Per-room turn timers. Key = roomId */
const turnTimers = new Map();

/**
 * Start (or restart) the turn timer for a room.
 * When it fires, auto-folds the current player.
 */
function startTurnTimer(io, room, roomManager) {
  clearTurnTimer(room.id);

  const game = room.game;
  if (!game || game.status !== 'in-progress') return;

  const round = game.getCurrentRound();
  if (!round || round.isFinished) return;

  const street = round.getCurrentStreet();
  const currentUUID = street.getCurrentPlayerUUID();
  if (!currentUUID) return;

  const startedAt = Date.now();

  // Broadcast timer start to all clients
  for (const p of game.players) {
    if (!p.socketId || p.status === 'disconnected') continue;
    io.to(p.socketId).emit('turn-timer', {
      playerUUID: currentUUID,
      timeoutMs: TURN_TIMEOUT_MS,
      startedAt,
    });
  }

  const timer = setTimeout(() => {
    turnTimers.delete(room.id);

    // Re-validate state hasn't changed
    if (!room.game || room.game.status !== 'in-progress') return;
    const currentRound = room.game.getCurrentRound();
    if (!currentRound || currentRound.isFinished) return;
    const currentStreet = currentRound.getCurrentStreet();
    if (currentStreet.getCurrentPlayerUUID() !== currentUUID) return;

    // Auto-fold
    const result = room.game.processAction(currentUUID, { type: 'fold' });
    if (!result.valid) return;

    handlePostAction(io, room, result, roomManager);
  }, TURN_TIMEOUT_MS);

  turnTimers.set(room.id, timer);
}

function clearTurnTimer(roomId) {
  const timer = turnTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomId);
  }
}

/**
 * Common post-action handling: round-over, game-over, broadcast, restart timer.
 */
function handlePostAction(io, room, result, roomManager) {
  if (result.roundComplete) {
    clearTurnTimer(room.id);

    for (const player of room.game.players) {
      if (!player.socketId || player.status === 'disconnected') continue;
      io.to(player.socketId).emit('round-over', { result: result.result });
    }

    if (room.game.status === 'finished') {
      const finalStandings = room.game.players
        .map(p => ({ uuid: p.uuid, name: p.name, chipStack: p.chipStack }))
        .sort((a, b) => b.chipStack - a.chipStack);

      if (room.game.dbGameId) {
        const gameId = room.game.dbGameId;
        db.query('UPDATE games SET finished_at = NOW() WHERE id = $1', [gameId]).catch(console.error);
        const queries = finalStandings.map((p, idx) => 
          db.query(
            'UPDATE game_players SET final_stack = $1, placement = $2 WHERE game_id = $3 AND user_uuid = $4',
            [p.chipStack, idx + 1, gameId, p.uuid]
          )
        );
        Promise.all(queries).catch(console.error);
      }

      for (const player of room.game.players) {
        if (!player.socketId) continue;
        io.to(player.socketId).emit('game-over', { finalStandings });
      }

      room.status = 'waiting';
      room.game = null;
      return;
    }
    
    // Broadcast showdown state, but DO NOT start the turn timer.
    // Waiting for host to send 'start-next-round'.
    broadcastGameUpdate(io, room);
    return;
  }

  broadcastGameUpdate(io, room);
  startTurnTimer(io, room, roomManager);
}

function broadcastGameUpdate(io, room) {
  const game = room.game;
  if (!game) return;

  for (const player of game.players) {
    if (!player.socketId || player.status === 'disconnected') continue;
    const sanitized = game.sanitizeForPlayer(player.uuid);
    io.to(player.socketId).emit('game-update', { gameState: sanitized });
  }
}

function broadcastRoomUpdate(io, room) {
  const payload = {
    roomId: room.id,
    hostUUID: room.hostUUID,
    players: room.players.map(p => ({
      uuid: p.uuid,
      name: p.name,
      chipStack: p.chipStack,
    })),
    status: room.status,
  };

  for (const player of room.players) {
    if (player.socketId) {
      io.to(player.socketId).emit('room-update', payload);
    }
  }
}

function handlePlayerExit(io, room, player, action, roomManager) {
  const playerName = player.name;
  
  if (room.game && room.game.status === 'in-progress') {
    const foldResult = room.game.handleDisconnect(player.uuid);
    
    // Broadcast player-left (for leave-room) or just let game update handle disconnected status
    if (action === 'leave') {
      for (const p of room.players) {
        if (!p.socketId || p.uuid === player.uuid) continue;
        io.to(p.socketId).emit('player-left', { name: playerName });
      }
    }

    if (foldResult && foldResult.roundComplete) {
      handlePostAction(io, room, foldResult, roomManager);
    } else {
      broadcastGameUpdate(io, room);
      startTurnTimer(io, room, roomManager);
    }
  } else {
    // Not in progress - handled by RoomManager (players array updated)
    if (action === 'leave' || action === 'removed') {
      for (const p of room.players) {
        if (!p.socketId) continue;
        io.to(p.socketId).emit('player-left', { name: playerName });
      }
      broadcastRoomUpdate(io, room);
    } else if (action === 'deleted') {
      clearTurnTimer(room.id);
    }
  }
}

export function registerHandlers(io, roomManager) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // ─── Create Room ───
    socket.on('create-room', ({ name, uuid }) => {
      const result = roomManager.createRoom(uuid, name, socket.id);
      if (result.error) return socket.emit('room-error', { message: result.error });

      const room = result.room;
      socket.join(room.id);
      socket.emit('room-created', { roomId: room.id });
      broadcastRoomUpdate(io, room);
      console.log(`Room ${room.id} created by ${name} (${uuid})`);
    });

    // ─── Join Room ───
    socket.on('join-room', ({ name, uuid, roomId }) => {
      const result = roomManager.joinRoom(roomId, uuid, name, socket.id);
      if (result.error) return socket.emit('room-error', { message: result.error });

      const room = result.room;
      socket.join(room.id);
      socket.emit('room-joined', { roomId: room.id });
      broadcastRoomUpdate(io, room);
      console.log(`${name} (${uuid}) joined room ${roomId}`);
    });

    // ─── Start Game ───
    socket.on('start-game', async ({ roomId, uuid }) => {
      const result = await roomManager.startGame(roomId, uuid);
      if (result.error) return socket.emit('room-error', { message: result.error });

      const room = roomManager.getRoom(roomId);
      broadcastGameUpdate(io, room);
      startTurnTimer(io, room, roomManager);
      console.log(`Game started in room ${roomId}`);
    });

    // ─── Start Next Round ───
    socket.on('start-next-round', ({ roomId, uuid }) => {
      console.log(`[TEST] start-next-round received for ${roomId} by ${uuid}`);
      const room = roomManager.getRoom(roomId);
      if (!room || !room.game || room.game.status !== 'in-progress') {
        console.log(`[TEST] Failed: Room state invalid`, room?.game?.status);
        return;
      }
      if (room.hostUUID !== uuid) {
        console.log(`[TEST] Failed: Not host. Host is ${room.hostUUID}, received ${uuid}`);
        return;
      }

      const result = room.game.startNextRound();
      console.log(`[TEST] startNextRound result:`, result);
      if (result.success) {
        broadcastGameUpdate(io, room);
        startTurnTimer(io, room, roomManager);
      }
    });

    // ─── Player Action ───
    socket.on('player-action', ({ roomId, uuid, action }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return socket.emit('action-error', { message: 'Room not found' });
      if (!room.game || room.game.status !== 'in-progress') return socket.emit('action-error', { message: 'No active game' });

      const result = room.game.processAction(uuid, action);
      if (!result.valid) return socket.emit('action-error', { message: result.error });

      if (action.type === 'all-in' && room.game.dbGameId) {
        db.query('UPDATE game_players SET went_all_in = went_all_in + 1 WHERE game_id = $1 AND user_uuid = $2', [room.game.dbGameId, uuid])
          .catch(console.error);
      }

      handlePostAction(io, room, result, roomManager);
    });

    // ─── Rebuy Request ───
    socket.on('rebuy-request', async ({ roomId, uuid }) => {
      const room = roomManager.getRoom(roomId);
      if (!room || !room.game) return socket.emit('rebuy-denied', { message: 'Room/Game not found' });

      const result = await room.game.handleRebuy(uuid);
      if (!result.success) {
        socket.emit('rebuy-denied', { message: result.error });
      } else {
        socket.emit('rebuy-accepted', { uuid, newStack: result.newStack });
        broadcastRoomUpdate(io, room);
        broadcastGameUpdate(io, room);
      }
    });

    // ─── Reconnect ───
    socket.on('reconnect-attempt', ({ roomId, uuid }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return socket.emit('room-error', { message: 'Room not found' });

      const player = room.players.find(p => p.uuid === uuid);
      if (!player) return socket.emit('room-error', { message: 'Player not found in room' });

      player.socketId = socket.id;
      socket.join(roomId);

      if (room.game) {
        room.game.handleReconnect(uuid, socket.id);
        const sanitized = room.game.sanitizeForPlayer(uuid);
        socket.emit('game-update', { gameState: sanitized });
      } else {
        broadcastRoomUpdate(io, room);
      }
      console.log(`${player.name} (${uuid}) reconnected to room ${roomId}`);
    });

    // ─── Leave Room (explicit) ───
    socket.on('leave-room', ({ roomId, uuid }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const player = room.players.find(p => p.uuid === uuid);
      if (!player) return;
      
      const socketId = player.socketId;

      const result = roomManager.removePlayer(socketId || 'dummy', uuid);
      if (!result) return;
      
      socket.leave(roomId);
      handlePlayerExit(io, result.room, result.player, result.action === 'disconnect' ? 'leave' : result.action, roomManager);
      console.log(`${result.player.name} left room ${roomId}`);
    });

    // ─── Disconnect ───
    socket.on('disconnect', () => {
      const result = roomManager.removePlayer(socket.id);
      if (!result) return;
      
      handlePlayerExit(io, result.room, result.player, result.action, roomManager);
      console.log(`${result.player.name} disconnected (action: ${result.action})`);
    });
  });
}
