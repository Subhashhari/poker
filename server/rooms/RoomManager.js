import { Game } from '../gameLogic/Game.js';

/**
 * RoomManager — in-memory room management.
 * Creates, joins, finds, and cleans up rooms.
 */
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId → Room
  }

  /**
   * Generate a 6-character uppercase alphanumeric room code.
   */
  _generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id;
    do {
      id = '';
      for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(id)); // ensure uniqueness
    return id;
  }

  /**
   * Create a new room.
   * @returns {{ room: object } | { error: string }}
   */
  createRoom(hostUUID, hostName, socketId) {
    const roomId = this._generateRoomId();

    const host = {
      uuid: hostUUID,
      name: hostName,
      chipStack: 1000,
      hand: null,
      status: 'active',
      socketId,
    };

    const room = {
      id: roomId,
      hostUUID,
      players: [host],
      game: null,
      status: 'waiting',
    };

    this.rooms.set(roomId, room);
    return { room };
  }

  /**
   * Join an existing room.
   * @returns {{ room: object } | { error: string }}
   */
  joinRoom(roomId, playerUUID, playerName, socketId) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return { error: 'Room not found' };
    }

    if (room.status !== 'waiting') {
      return { error: 'Game already in progress' };
    }

    if (room.players.length >= 6) {
      return { error: 'Room is full (max 6 players)' };
    }

    // Check if player is already in the room
    const existing = room.players.find(p => p.uuid === playerUUID);
    if (existing) {
      // Update socket ID for reconnection
      existing.socketId = socketId;
      existing.name = playerName;
      return { room };
    }

    const player = {
      uuid: playerUUID,
      name: playerName,
      chipStack: 1000,
      hand: null,
      status: 'active',
      socketId,
    };

    room.players.push(player);
    return { room };
  }

  /**
   * Start the game in a room.
   * @returns {{ game: Game } | { error: string }}
   */
  startGame(roomId, requestingUUID) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return { error: 'Room not found' };
    }

    if (room.hostUUID !== requestingUUID) {
      return { error: 'Only the host can start the game' };
    }

    if (room.status !== 'waiting') {
      return { error: 'Game already started' };
    }

    if (room.players.length < 2) {
      return { error: 'Need at least 2 players to start' };
    }

    const game = new Game(room.players);
    room.game = game;
    room.status = 'in-progress';
    game.startGame();

    return { game };
  }

  /**
   * Get a room by ID.
   */
  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Find a room by player UUID.
   */
  getRoomByPlayerUUID(uuid) {
    for (const room of this.rooms.values()) {
      if (room.players.find(p => p.uuid === uuid)) {
        return room;
      }
    }
    return null;
  }

  /**
   * Find a room by socket ID.
   */
  getRoomBySocketId(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.find(p => p.socketId === socketId)) {
        return room;
      }
    }
    return null;
  }

  /**
   * Remove a player from their room. Cleans up empty rooms.
   */
  removePlayer(socketId) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) return null;

    // If game is in progress, handle as disconnect (don't remove from players array)
    if (room.status === 'in-progress' && room.game) {
      return { room, player, action: 'disconnect' };
    }

    // In waiting state, remove the player
    room.players = room.players.filter(p => p.socketId !== socketId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(room.id);
      return { room, player, action: 'deleted' };
    }

    // If the host left, assign new host
    if (player.uuid === room.hostUUID) {
      room.hostUUID = room.players[0].uuid;
    }

    return { room, player, action: 'removed' };
  }

  /**
   * Get all rooms (for debugging).
   */
  getAllRooms() {
    return [...this.rooms.values()].map(r => ({
      id: r.id,
      playerCount: r.players.length,
      status: r.status,
    }));
  }
}

export { RoomManager };
