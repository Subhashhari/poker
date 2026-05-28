/**
 * eventHandlers.js — Socket.io event handlers.
 *
 * The sole bridge between networking (socket.io) and game logic.
 * Includes a 20-second turn timer that auto-folds on timeout.
 */

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

      for (const player of room.game.players) {
        if (!player.socketId) continue;
        io.to(player.socketId).emit('game-over', { finalStandings });
      }

      room.status = 'waiting';
      room.game = null;
      return;
    }
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

export function registerHandlers(io, roomManager) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // ─── Create Room ───
    socket.on('create-room', ({ name, uuid }) => {
      const result = roomManager.createRoom(uuid, name, socket.id);

      if (result.error) {
        socket.emit('room-error', { message: result.error });
        return;
      }

      const room = result.room;
      socket.join(room.id);
      socket.emit('room-created', { roomId: room.id });
      broadcastRoomUpdate(io, room);

      console.log(`Room ${room.id} created by ${name} (${uuid})`);
    });

    // ─── Join Room ───
    socket.on('join-room', ({ name, uuid, roomId }) => {
      const result = roomManager.joinRoom(roomId, uuid, name, socket.id);

      if (result.error) {
        socket.emit('room-error', { message: result.error });
        return;
      }

      const room = result.room;
      socket.join(room.id);
      socket.emit('room-joined', { roomId: room.id });
      broadcastRoomUpdate(io, room);

      console.log(`${name} (${uuid}) joined room ${roomId}`);
    });

    // ─── Start Game ───
    socket.on('start-game', ({ roomId, uuid }) => {
      const result = roomManager.startGame(roomId, uuid);

      if (result.error) {
        socket.emit('room-error', { message: result.error });
        return;
      }

      const room = roomManager.getRoom(roomId);
      broadcastGameUpdate(io, room);
      startTurnTimer(io, room, roomManager);

      console.log(`Game started in room ${roomId}`);
    });

    // ─── Player Action ───
    socket.on('player-action', ({ roomId, uuid, action }) => {
      const room = roomManager.getRoom(roomId);

      if (!room) {
        socket.emit('action-error', { message: 'Room not found' });
        return;
      }

      if (!room.game || room.game.status !== 'in-progress') {
        socket.emit('action-error', { message: 'No active game' });
        return;
      }

      const result = room.game.processAction(uuid, action);

      if (!result.valid) {
        socket.emit('action-error', { message: result.error });
        return;
      }

      handlePostAction(io, room, result, roomManager);
    });

    // ─── Reconnect ───
    socket.on('reconnect-attempt', ({ roomId, uuid }) => {
      const room = roomManager.getRoom(roomId);

      if (!room) {
        socket.emit('room-error', { message: 'Room not found' });
        return;
      }

      const player = room.players.find(p => p.uuid === uuid);
      if (!player) {
        socket.emit('room-error', { message: 'Player not found in room' });
        return;
      }

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

      const playerName = player.name;

      if (room.game && room.game.status === 'in-progress') {
        const foldResult = room.game.handleDisconnect(uuid);
        player.status = 'disconnected';
        player.socketId = null;

        for (const p of room.players) {
          if (!p.socketId || p.uuid === uuid) continue;
          io.to(p.socketId).emit('player-left', { name: playerName });
        }

        if (foldResult && foldResult.roundComplete) {
          clearTurnTimer(room.id);

          for (const p of room.game.players) {
            if (!p.socketId || p.status === 'disconnected') continue;
            io.to(p.socketId).emit('round-over', { result: foldResult.result });
          }

          if (room.game.status === 'finished') {
            const finalStandings = room.game.players
              .map(p => ({ uuid: p.uuid, name: p.name, chipStack: p.chipStack }))
              .sort((a, b) => b.chipStack - a.chipStack);
            for (const p of room.game.players) {
              if (!p.socketId) continue;
              io.to(p.socketId).emit('game-over', { finalStandings });
            }
            room.status = 'waiting';
            room.game = null;
          } else {
            broadcastGameUpdate(io, room);
            startTurnTimer(io, room, roomManager);
          }
        } else {
          broadcastGameUpdate(io, room);
          startTurnTimer(io, room, roomManager);
        }
      } else {
        room.players = room.players.filter(p => p.uuid !== uuid);

        for (const p of room.players) {
          if (!p.socketId) continue;
          io.to(p.socketId).emit('player-left', { name: playerName });
        }

        if (room.players.length === 0) {
          clearTurnTimer(room.id);
          roomManager.rooms.delete(room.id);
        } else {
          if (uuid === room.hostUUID) {
            room.hostUUID = room.players[0].uuid;
          }
          broadcastRoomUpdate(io, room);
        }
      }

      socket.leave(roomId);
      console.log(`${playerName} left room ${roomId}`);
    });

    // ─── Disconnect ───
    socket.on('disconnect', () => {
      const result = roomManager.removePlayer(socket.id);
      if (!result) return;

      const { room, player, action } = result;

      if (action === 'disconnect' && room.game) {
        const foldResult = room.game.handleDisconnect(player.uuid);

        if (foldResult && foldResult.roundComplete) {
          clearTurnTimer(room.id);

          for (const p of room.game.players) {
            if (!p.socketId || p.status === 'disconnected') continue;
            io.to(p.socketId).emit('round-over', { result: foldResult.result });
          }

          if (room.game.status === 'finished') {
            const finalStandings = room.game.players
              .map(p => ({ uuid: p.uuid, name: p.name, chipStack: p.chipStack }))
              .sort((a, b) => b.chipStack - a.chipStack);

            for (const p of room.game.players) {
              if (!p.socketId) continue;
              io.to(p.socketId).emit('game-over', { finalStandings });
            }

            room.status = 'waiting';
            room.game = null;
            return;
          }
        }

        broadcastGameUpdate(io, room);
        startTurnTimer(io, room, roomManager);
        console.log(`${player.name} disconnected from active game in room ${room.id} — auto-folded`);
      } else if (action === 'removed') {
        broadcastRoomUpdate(io, room);
        console.log(`${player.name} left room ${room.id} (lobby)`);
      } else if (action === 'deleted') {
        clearTurnTimer(room.id);
        console.log(`Room ${room.id} deleted (empty)`);
      }
    });
  });
}
