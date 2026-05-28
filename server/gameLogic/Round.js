import { Deck } from './Deck.js';
import { Street } from './Street.js';
import { PotManager } from './PotManager.js';
import { evaluateBestHand, compareHands, handRankName } from './HandEvaluator.js';

/**
 * Round — manages streets within a single hand.
 *
 * Orchestrates: blinds → preflop → flop → turn → river → showdown.
 * Handles all-in and side-pot resolution.
 */
class Round {
  /**
   * @param {number} roundNumber
   * @param {Array<{uuid, name, chipStack, hand?, status}>} players
   * @param {number} dealerIndex
   * @param {{ smallBlind: number, bigBlind: number }} config
   */
  constructor(roundNumber, players, dealerIndex, config) {
    this.roundNumber = roundNumber;
    this.players = players;
    this.dealerIndex = dealerIndex;
    this.config = config;
    this.potManager = new PotManager();
    this.communityCards = [];
    this.isFinished = false;
    this.result = null;
    this.allInUUIDs = new Set(); // tracks who is all-in across streets

    const n = players.length;

    if (n === 2) {
      this.smallBlindIndex = dealerIndex;
      this.bigBlindIndex = (dealerIndex + 1) % n;
    } else {
      this.smallBlindIndex = (dealerIndex + 1) % n;
      this.bigBlindIndex = (dealerIndex + 2) % n;
    }

    this.deck = new Deck();
    this.deck.shuffle();

    for (const player of this.players) {
      player.hand = this.deck.deal(2);
      player.status = 'active';
    }

    let firstToActIndex;
    if (n === 2) {
      firstToActIndex = this.smallBlindIndex;
    } else {
      firstToActIndex = (this.bigBlindIndex + 1) % n;
    }

    const preflopStreet = new Street('preflop', [], this.players, firstToActIndex);

    this._postBlind(preflopStreet, this.smallBlindIndex, config.smallBlind);
    this._postBlind(preflopStreet, this.bigBlindIndex, config.bigBlind);

    // Carry any blinds-induced all-ins into our tracking
    for (const uuid of preflopStreet.allInUUIDs) {
      this.allInUUIDs.add(uuid);
    }

    this.streets = [preflopStreet];
    this.currentStreetIndex = 0;
  }

  _postBlind(street, playerIndex, amount) {
    const player = this.players[playerIndex];
    const blindAmount = Math.min(amount, player.chipStack);
    const result = street.processAction(player.uuid, { type: 'blind', amount: blindAmount });
    if (result.valid) {
      player.chipStack -= result.action.chipsDelta;
      this.potManager.contribute(player.uuid, result.action.chipsDelta);
    }
  }

  getCurrentStreet() {
    return this.streets[this.currentStreetIndex];
  }

  getActivePlayers() {
    return this.players.filter(p => p.status === 'active');
  }

  /**
   * Players who can still act (active and not all-in).
   */
  getActingPlayers() {
    return this.players.filter(p => p.status === 'active' && !this.allInUUIDs.has(p.uuid));
  }

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

    // Track all-in
    if (result.action.type === 'all-in') {
      this.allInUUIDs.add(playerUUID);
    }

    // If player folded, update status and pot eligibility
    if (action.type === 'fold') {
      const player = this.players.find(p => p.uuid === playerUUID);
      if (player.status !== 'disconnected') {
        player.status = 'folded';
      }
      this.potManager.removeEligibility(playerUUID);
    }

    // Check if only one player remains (not folded)
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      winner.chipStack += this.potManager.getTotal();
      this._endRound('last-standing', [{ winnerUUIDs: [winner.uuid], amount: this.potManager.getTotal() }]);
      return { valid: true, action: result.action, roundComplete: true, result: this.result };
    }

    // Check if street is complete
    if (street.isComplete()) {
      // If all remaining players are all-in (or only 1 can act), run out community cards
      const actingPlayers = this.getActingPlayers();
      if (actingPlayers.length <= 1) {
        // Run out remaining streets without betting
        this._runOutBoard();
        this._handleShowdown();
        return { valid: true, action: result.action, roundComplete: true, result: this.result };
      }

      const advanced = this._advanceStreet();
      if (!advanced) {
        this._handleShowdown();
        return { valid: true, action: result.action, roundComplete: true, result: this.result };
      }
      return { valid: true, action: result.action, streetAdvanced: true };
    }

    return { valid: true, action: result.action };
  }

  /**
   * Deal remaining community cards when all players are all-in.
   */
  _runOutBoard() {
    const streetOrder = ['preflop', 'flop', 'turn', 'river'];
    const currentName = this.getCurrentStreet().name;
    let idx = streetOrder.indexOf(currentName);

    while (idx < streetOrder.length - 1) {
      idx++;
      const nextName = streetOrder[idx];
      const count = nextName === 'flop' ? 3 : 1;
      this.communityCards.push(...this.deck.deal(count));
    }
  }

  _advanceStreet() {
    const streetOrder = ['preflop', 'flop', 'turn', 'river'];
    const currentName = this.getCurrentStreet().name;
    const currentIdx = streetOrder.indexOf(currentName);

    if (currentIdx >= streetOrder.length - 1) return false;

    const nextStreetName = streetOrder[currentIdx + 1];

    let newCards;
    if (nextStreetName === 'flop') {
      newCards = this.deck.deal(3);
    } else {
      newCards = this.deck.deal(1);
    }
    this.communityCards.push(...newCards);

    const activePlayers = this.getActivePlayers();
    const n = this.players.length;
    let firstToActIndex = -1;
    for (let offset = 1; offset <= n; offset++) {
      const idx = (this.dealerIndex + offset) % n;
      if (this.players[idx].status === 'active') {
        firstToActIndex = activePlayers.indexOf(this.players[idx]);
        break;
      }
    }

    const newStreet = new Street(
      nextStreetName,
      [...this.communityCards],
      activePlayers,
      firstToActIndex >= 0 ? firstToActIndex : 0,
      this.allInUUIDs // pass existing all-in players
    );

    this.streets.push(newStreet);
    this.currentStreetIndex++;
    return true;
  }

  /**
   * Handle showdown — uses PotManager.resolvePots for proper side-pot resolution.
   */
  _handleShowdown() {
    const activePlayers = this.getActivePlayers();

    const results = this.potManager.resolvePots((eligibleUUIDs) => {
      // Find the best hand(s) among eligible players
      const eligible = activePlayers.filter(p => eligibleUUIDs.includes(p.uuid));
      if (eligible.length === 0) return { winnerUUIDs: eligibleUUIDs, isTie: false };
      if (eligible.length === 1) return { winnerUUIDs: [eligible[0].uuid], isTie: false };

      // Evaluate each player's best hand
      const evaluated = eligible.map(p => ({
        uuid: p.uuid,
        hand: evaluateBestHand(p.hand, this.communityCards),
      }));

      // Sort by hand strength (descending)
      evaluated.sort((a, b) => {
        const cmp = compareHands(a.hand, b.hand);
        return -cmp; // descending: best first
      });

      // Check for ties with the best hand
      const bestHandResult = evaluated[0].hand;
      const winners = evaluated.filter(e => compareHands(e.hand, bestHandResult) === 0);

      return {
        winnerUUIDs: winners.map(w => w.uuid),
        isTie: winners.length > 1,
      };
    });

    // Award each pot
    const potAwards = [];
    for (const potResult of results) {
      const share = Math.floor(potResult.amount / potResult.winnerUUIDs.length);
      const remainder = potResult.amount % potResult.winnerUUIDs.length;

      for (let i = 0; i < potResult.winnerUUIDs.length; i++) {
        const player = this.players.find(p => p.uuid === potResult.winnerUUIDs[i]);
        player.chipStack += share + (i === 0 ? remainder : 0);
      }

      potAwards.push({
        winnerUUIDs: potResult.winnerUUIDs,
        amount: potResult.amount,
      });
    }

    // Determine overall winner for result reporting
    const mainPotWinner = potAwards[0]?.winnerUUIDs[0];
    const mainWinnerPlayer = activePlayers.find(p => p.uuid === mainPotWinner);
    const mainHand = mainWinnerPlayer ? evaluateBestHand(mainWinnerPlayer.hand, this.communityCards) : null;

    this._endRound(
      potAwards.length > 1 ? 'showdown-sidepots' : potAwards[0]?.winnerUUIDs.length > 1 ? 'showdown-tie' : 'showdown',
      potAwards,
      mainHand
    );
  }

  _endRound(reason, potAwards, hand = null) {
    this.isFinished = true;
    this.result = {
      winnerUUID: potAwards[0]?.winnerUUIDs[0] || null,
      hand,
      handName: hand ? handRankName(hand.handRank) : null,
      reason,
      pot: this.potManager.getTotal(),
      potAwards,
      updatedStacks: this.players.map(p => ({ uuid: p.uuid, chipStack: p.chipStack })),
    };
  }

  autoFold(playerUUID) {
    const street = this.getCurrentStreet();
    if (street.getCurrentPlayerUUID() === playerUUID) {
      return this.processAction(playerUUID, { type: 'fold' });
    }
    return { valid: false, error: "Not this player's turn" };
  }

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
