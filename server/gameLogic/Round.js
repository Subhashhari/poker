import { Deck } from './Deck.js';
import { Street } from './Street.js';
import { PotManager } from './PotManager.js';
import { findWinner, handRankName } from './HandEvaluator.js';

/**
 * Round — manages streets within a single hand.
 *
 * Orchestrates: blinds → preflop → flop → turn → river → showdown.
 * Delegates all betting logic to Street.
 * Uses chipsDelta from Street actions for clean pot/chipStack tracking.
 */
class Round {
  /**
   * @param {number} roundNumber
   * @param {Array<{uuid, name, chipStack, hand?, status}>} players — active players for this round
   * @param {number} dealerIndex — index into players for the dealer
   * @param {{ smallBlind: number, bigBlind: number }} config
   */
  constructor(roundNumber, players, dealerIndex, config) {
    this.roundNumber = roundNumber;
    this.players = players;
    this.dealerIndex = dealerIndex;
    this.config = config;
    this.potManager = new PotManager();
    this.communityCards = [];
    this.winnerId = null;
    this.winnerHand = null;
    this.isFinished = false;
    this.result = null; // set when round ends

    const n = players.length;

    // Compute SB and BB positions
    if (n === 2) {
      // Heads-up: dealer is SB, other is BB
      this.smallBlindIndex = dealerIndex;
      this.bigBlindIndex = (dealerIndex + 1) % n;
    } else {
      this.smallBlindIndex = (dealerIndex + 1) % n;
      this.bigBlindIndex = (dealerIndex + 2) % n;
    }

    // Create and shuffle deck
    this.deck = new Deck();
    this.deck.shuffle();

    // Deal hole cards
    for (const player of this.players) {
      player.hand = this.deck.deal(2);
      player.status = 'active';
    }

    // Determine first to act preflop
    let firstToActIndex;
    if (n === 2) {
      firstToActIndex = this.smallBlindIndex;
    } else {
      firstToActIndex = (this.bigBlindIndex + 1) % n;
    }

    // Create preflop street and post blinds
    const preflopStreet = new Street('preflop', [], this.players, firstToActIndex);

    this._postBlind(preflopStreet, this.smallBlindIndex, config.smallBlind);
    this._postBlind(preflopStreet, this.bigBlindIndex, config.bigBlind);

    this.streets = [preflopStreet];
    this.currentStreetIndex = 0;
  }

  /**
   * Post a blind: process blind action, deduct chips, contribute to pot.
   */
  _postBlind(street, playerIndex, amount) {
    const player = this.players[playerIndex];
    const blindAmount = Math.min(amount, player.chipStack);
    const result = street.processAction(player.uuid, { type: 'blind', amount: blindAmount });
    if (result.valid) {
      player.chipStack -= result.action.chipsDelta;
      this.potManager.contribute(player.uuid, result.action.chipsDelta);
    }
  }

  /**
   * Get the current street.
   */
  getCurrentStreet() {
    return this.streets[this.currentStreetIndex];
  }

  /**
   * Get the non-folded players across all streets in this round.
   */
  getActivePlayers() {
    return this.players.filter(p => p.status === 'active');
  }

  /**
   * Process a player action.
   * @returns {{ valid: boolean, error?: string, roundComplete?: boolean, streetAdvanced?: boolean, result?: object }}
   */
  processAction(playerUUID, action) {
    if (this.isFinished) {
      return { valid: false, error: 'Round is already finished' };
    }

    const street = this.getCurrentStreet();
    const result = street.processAction(playerUUID, action);

    if (!result.valid) return result;

    // Deduct chips and contribute to pot
    if (result.action.chipsDelta > 0) {
      const player = this.players.find(p => p.uuid === playerUUID);
      player.chipStack -= result.action.chipsDelta;
      this.potManager.contribute(playerUUID, result.action.chipsDelta);
    }

    // If player folded, update their status and pot eligibility
    if (action.type === 'fold') {
      const player = this.players.find(p => p.uuid === playerUUID);
      // Preserve 'disconnected' status — don't override with 'folded'
      if (player.status !== 'disconnected') {
        player.status = 'folded';
      }
      this.potManager.removeEligibility(playerUUID);
    }

    // Check if only one player remains — immediate win
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 1) {
      // Award pot to the last player standing
      const winner = activePlayers[0];
      winner.chipStack += this.potManager.getTotal();
      this._endRound(winner.uuid, null, 'last-standing');
      return { valid: true, action: result.action, roundComplete: true, result: this.result };
    }

    // Check if street is complete
    if (street.isComplete()) {
      // Try to advance to next street or go to showdown
      const advanced = this._advanceStreet();
      if (!advanced) {
        // Showdown
        this._handleShowdown();
        return { valid: true, action: result.action, roundComplete: true, result: this.result };
      }
      return { valid: true, action: result.action, streetAdvanced: true };
    }

    return { valid: true, action: result.action };
  }

  /**
   * Advance to the next street. Returns false if we're at showdown (river was the last).
   */
  _advanceStreet() {
    const streetOrder = ['preflop', 'flop', 'turn', 'river'];
    const currentName = this.getCurrentStreet().name;
    const currentIdx = streetOrder.indexOf(currentName);

    if (currentIdx >= streetOrder.length - 1) {
      // River is done — showdown
      return false;
    }

    const nextStreetName = streetOrder[currentIdx + 1];

    // Deal community cards
    let newCards;
    if (nextStreetName === 'flop') {
      newCards = this.deck.deal(3);
    } else {
      newCards = this.deck.deal(1); // turn or river
    }
    this.communityCards.push(...newCards);

    // Determine first to act post-flop: first active player left of dealer
    const activePlayers = this.getActivePlayers();
    const n = this.players.length;
    let firstToActIndex = -1;
    for (let offset = 1; offset <= n; offset++) {
      const idx = (this.dealerIndex + offset) % n;
      if (this.players[idx].status === 'active') {
        // Map back to activePlayers list index
        firstToActIndex = activePlayers.indexOf(this.players[idx]);
        break;
      }
    }

    // Create new street with only active players
    const newStreet = new Street(
      nextStreetName,
      [...this.communityCards],
      activePlayers,
      firstToActIndex >= 0 ? firstToActIndex : 0
    );

    this.streets.push(newStreet);
    this.currentStreetIndex++;
    return true;
  }

  /**
   * Handle showdown — evaluate hands and award pot.
   */
  _handleShowdown() {
    const activePlayers = this.getActivePlayers();
    const result = findWinner(activePlayers, this.communityCards);

    if (result.isTie) {
      // Split pot evenly among tied players
      const potResults = this.potManager.resolvePots((eligibleUUIDs) => {
        // Among eligible and tied, pick first (simplification for v1 — true split handled below)
        return result.tiedPlayerUUIDs.find(uuid => eligibleUUIDs.includes(uuid)) || eligibleUUIDs[0];
      });

      // Split pot among tied players
      const totalPot = this.potManager.getTotal();
      const splitAmount = Math.floor(totalPot / result.tiedPlayerUUIDs.length);
      const remainder = totalPot % result.tiedPlayerUUIDs.length;

      for (let i = 0; i < result.tiedPlayerUUIDs.length; i++) {
        const player = this.players.find(p => p.uuid === result.tiedPlayerUUIDs[i]);
        player.chipStack += splitAmount + (i === 0 ? remainder : 0);
      }

      this._endRound(result.tiedPlayerUUIDs[0], result.hand, 'showdown-tie', result.tiedPlayerUUIDs);
    } else {
      // Single winner — award entire pot
      const totalPot = this.potManager.getTotal();
      const winner = this.players.find(p => p.uuid === result.winnerUUID);
      winner.chipStack += totalPot;

      this._endRound(result.winnerUUID, result.hand, 'showdown');
    }
  }

  /**
   * End the round and set the result.
   */
  _endRound(winnerUUID, hand, reason, tiedPlayerUUIDs = null) {
    this.isFinished = true;
    this.winnerId = winnerUUID;
    this.winnerHand = hand;
    this.result = {
      winnerUUID,
      hand,
      handName: hand ? handRankName(hand.handRank) : null,
      reason, // 'showdown', 'showdown-tie', 'last-standing'
      pot: this.potManager.getTotal(),
      tiedPlayerUUIDs,
      updatedStacks: this.players.map(p => ({ uuid: p.uuid, chipStack: p.chipStack })),
    };
  }

  /**
   * Auto-fold for a disconnected player.
   */
  autoFold(playerUUID) {
    const street = this.getCurrentStreet();
    if (street.getCurrentPlayerUUID() === playerUUID) {
      return this.processAction(playerUUID, { type: 'fold' });
    }
    return { valid: false, error: 'Not this player\'s turn' };
  }

  /**
   * Serialize for client.
   */
  serialize() {
    return {
      roundNumber: this.roundNumber,
      dealerIndex: this.dealerIndex,
      smallBlindIndex: this.smallBlindIndex,
      bigBlindIndex: this.bigBlindIndex,
      communityCards: this.communityCards,
      pots: this.potManager.serialize(),
      potTotal: this.potManager.getTotal(),
      currentStreet: this.getCurrentStreet().serialize(),
      isFinished: this.isFinished,
      result: this.result,
    };
  }
}

export { Round };
