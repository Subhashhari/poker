import { Round } from './Round.js';

/**
 * Game — top-level state machine for a poker game.
 *
 * Manages the lifecycle across multiple rounds:
 * start game → play rounds → rotate dealer → eliminate busted players → game over.
 */
class Game {
  /**
   * @param {Array<{uuid, name, chipStack, socketId}>} players
   * @param {{ smallBlind?: number, bigBlind?: number, maxPlayers?: number }} config
   */
  constructor(players, config = {}) {
    this.players = players.map(p => ({
      uuid: p.uuid,
      name: p.name,
      chipStack: p.chipStack || 1000,
      hand: null,
      status: 'active',
      socketId: p.socketId,
    }));

    this.config = {
      smallBlind: config.smallBlind || 10,
      bigBlind: config.bigBlind || 20,
      maxPlayers: config.maxPlayers || 6,
      startingChips: config.startingChips || 1000,
    };

    this.rounds = [];
    this.currentRoundIndex = -1;
    this.dealerIndex = 0;
    this.status = 'waiting'; // 'waiting' | 'in-progress' | 'finished'
  }

  /**
   * Start the game — begins the first round.
   */
  startGame() {
    if (this.status !== 'waiting') {
      return { success: false, error: 'Game already started' };
    }
    if (this.getEligiblePlayers().length < 2) {
      return { success: false, error: 'Need at least 2 players to start' };
    }

    this.status = 'in-progress';
    // Set a random initial dealer
    const eligible = this.getEligiblePlayers();
    this.dealerIndex = Math.floor(Math.random() * eligible.length);

    return this._startNewRound();
  }

  /**
   * Start a new round.
   */
  _startNewRound() {
    const eligible = this.getEligiblePlayers();

    if (eligible.length < 2) {
      return this._endGame();
    }

    // Reset eligible players' status and hands
    for (const p of eligible) {
      p.status = 'active';
      p.hand = null;
    }

    // Mark ineligible players
    for (const p of this.players) {
      if (p.chipStack <= 0) {
        p.status = 'sitting-out';
      }
    }

    this.currentRoundIndex++;

    const dealerPlayer = this.players[this.dealerIndex];
    let dealerInEligible = eligible.findIndex(p => p.uuid === dealerPlayer?.uuid);
    if (dealerInEligible === -1) dealerInEligible = 0; // fallback if dealer dropped

    const round = new Round(
      this.currentRoundIndex + 1,
      eligible,
      dealerInEligible,
      { smallBlind: this.config.smallBlind, bigBlind: this.config.bigBlind }
    );

    this.rounds.push(round);
    return { success: true };
  }

  /**
   * Process a player action in the current round.
   */
  processAction(playerUUID, action) {
    if (this.status !== 'in-progress') {
      return { valid: false, error: 'Game is not in progress' };
    }

    const round = this.getCurrentRound();
    if (!round) {
      return { valid: false, error: 'No active round' };
    }

    const result = round.processAction(playerUUID, action);

    if (result.valid && result.roundComplete) {
      // Round is over — check for game over or start next round
      if (this._checkGameOver()) {
        const gameOverResult = this._endGame();
        result.gameOver = true;
        result.finalStandings = gameOverResult.finalStandings;
      } else {
        result.needsNextRound = true;
      }
    }

    return result;
  }

  /**
   * Get the current round.
   */
  getCurrentRound() {
    if (this.currentRoundIndex < 0 || this.currentRoundIndex >= this.rounds.length) {
      return null;
    }
    return this.rounds[this.currentRoundIndex];
  }

  /**
   * Get players eligible to play (not sitting-out).
   */
  getEligiblePlayers() {
    return this.players.filter(p => p.chipStack > 0 && p.status !== 'disconnected');
  }

  /**
   * Rotate dealer to the next eligible player and start a new round.
   */
  startNextRound() {
    const eligible = this.getEligiblePlayers();
    if (eligible.length < 2) {
      return this._endGame();
    }

    // Rotate dealer in the all-players space
    const n = this.players.length;
    let nextDealer = (this.dealerIndex + 1) % n;
    let attempts = 0;
    while (attempts < n) {
      const player = this.players[nextDealer];
      if (player.chipStack > 0 && player.status !== 'disconnected') {
        break;
      }
      nextDealer = (nextDealer + 1) % n;
      attempts++;
    }
    this.dealerIndex = nextDealer;

    return this._startNewRound();
  }

  /**
   * Check if the game is over (only 1 player has chips).
   */
  _checkGameOver() {
    return this.getEligiblePlayers().length <= 1;
  }

  /**
   * End the game.
   */
  _endGame() {
    this.status = 'finished';
    return {
      success: true,
      gameOver: true,
      finalStandings: this.players
        .map(p => ({ uuid: p.uuid, name: p.name, chipStack: p.chipStack }))
        .sort((a, b) => b.chipStack - a.chipStack),
    };
  }

  /**
   * Handle a player disconnecting.
   */
  handleDisconnect(playerUUID) {
    const player = this.players.find(p => p.uuid === playerUUID);
    if (!player) return;

    player.status = 'disconnected';

    // If it's their turn in the current round, auto-fold
    const round = this.getCurrentRound();
    if (round && !round.isFinished) {
      const result = round.autoFold(playerUUID);
      if (result.valid && result.roundComplete) {
        if (this._checkGameOver()) {
          const gameOverResult = this._endGame();
          result.gameOver = true;
          result.finalStandings = gameOverResult.finalStandings;
        } else {
          result.needsNextRound = true;
        }
      }
      return result;
    }

    return { valid: true };
  }

  /**
   * Handle a player reconnecting.
   */
  handleReconnect(playerUUID, newSocketId) {
    const player = this.players.find(p => p.uuid === playerUUID);
    if (!player) return { valid: false, error: 'Player not found' };

    player.socketId = newSocketId;
    // They'll be eligible for the next round if they have chips
    if (player.chipStack > 0) {
      player.status = 'sitting-out'; // will be set to 'active' at next round start
    }

    return { valid: true };
  }

  /**
   * Sanitize game state for a specific player.
   * Each player only sees their own hole cards.
   */
  sanitizeForPlayer(playerUUID) {
    const round = this.getCurrentRound();

    return {
      players: this.players.map(p => ({
        uuid: p.uuid,
        name: p.name,
        chipStack: p.chipStack,
        status: p.status,
        hand: p.uuid === playerUUID ? p.hand : null,
      })),
      currentRound: round ? round.serialize() : null,
      dealerIndex: this.dealerIndex,
      config: this.config,
      status: this.status,
    };
  }

  /**
   * Get a full player object by UUID.
   */
  getPlayer(playerUUID) {
    return this.players.find(p => p.uuid === playerUUID);
  }
}

export { Game };
