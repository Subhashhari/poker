/**
 * eventHandlers.js — Socket.io event handlers.
 *
 * The sole bridge between networking (socket.io) and game logic.
 * Translates socket events into game method calls,
 * sanitizes state per player, and broadcasts updates.
 */

/**
 * Broadcast sanitized game state to all players in a room.
 * Each player receives a different payload (only their own hole cards).
 */
function broadcastGameUpdate(io, room) {
  const game = room.game;
  if (!game) return;

  for (const player of game.players) {
    if (!player.socketId || player.status === 'disconnected') continue;
    const sanitized = game.sanitizeForPlayer(player.uuid);
    io.to(player.socketId).emit('game-update', { gameState: sanitized });
  }
}

/**
 * Broadcast room info (lobby) to all players in the room.
 */
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

/**
 * Register all socket.io event handlers.
 */
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

      // If the round just completed, send round-over event
      if (result.roundComplete) {
        for (const player of room.game.players) {
          if (!player.socketId || player.status === 'disconnected') continue;
          io.to(player.socketId).emit('round-over', {
            result: result.result,
          });
        }

        // Check if game is over
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

      // Always broadcast updated game state after a valid action
      broadcastGameUpdate(io, room);
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

      // Update socket ID
      player.socketId = socket.id;
      socket.join(roomId);

      if (room.game) {
        room.game.handleReconnect(uuid, socket.id);
        // Send current game state to reconnecting player
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

      // If game is in progress, handle as disconnect (auto-fold)
      if (room.game && room.game.status === 'in-progress') {
        const foldResult = room.game.handleDisconnect(uuid);
        player.status = 'disconnected';
        player.socketId = null;

        // Notify remaining players
        for (const p of room.players) {
          if (!p.socketId || p.uuid === uuid) continue;
          io.to(p.socketId).emit('player-left', { name: playerName });
        }

        if (foldResult && foldResult.roundComplete) {
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
          }
        } else {
          broadcastGameUpdate(io, room);
        }
      } else {
        // Lobby — remove player from array
        room.players = room.players.filter(p => p.uuid !== uuid);

        // Notify remaining players
        for (const p of room.players) {
          if (!p.socketId) continue;
          io.to(p.socketId).emit('player-left', { name: playerName });
        }

        if (room.players.length === 0) {
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
        // In-game disconnect: auto-fold
        const foldResult = room.game.handleDisconnect(player.uuid);

        if (foldResult && foldResult.roundComplete) {
          // Round ended due to disconnect
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
        console.log(`${player.name} disconnected from active game in room ${room.id} — auto-folded`);
      } else if (action === 'removed') {
        broadcastRoomUpdate(io, room);
        console.log(`${player.name} left room ${room.id} (lobby)`);
      } else if (action === 'deleted') {
        console.log(`Room ${room.id} deleted (empty)`);
      }
    });
  });
}
