/**
 * Street — owns all betting logic for a single street.
 *
 * Tracks turns, validates actions, detects betting round completion
 * using a `needsToAct` set. Handles all-in: when a player commits
 * all remaining chips, they're marked all-in and skip future actions.
 */
class Street {
  /**
   * @param {string} name — 'preflop' | 'flop' | 'turn' | 'river'
   * @param {Array} communityCards — cards visible on this street
   * @param {Array<{uuid: string, chipStack: number}>} activePlayers — ordered list
   * @param {number} firstToActIndex — index into activePlayers for who acts first
   * @param {Set<string>} [allInUUIDs] — players already all-in from prior streets
   */
  constructor(name, communityCards, activePlayers, firstToActIndex, allInUUIDs = new Set()) {
    this.name = name;
    this.communityCards = [...communityCards];
    this.actions = [];
    this.currentBet = 0;
    this.activePlayers = activePlayers;
    this.currentPlayerIndex = firstToActIndex;
    this.playerContributions = new Map(); // uuid → amount contributed THIS street
    this.foldedThisStreet = new Set();
    this.allInUUIDs = new Set(allInUUIDs); // players who are all-in (can't act)

    // needsToAct: everyone except folded and all-in
    this.needsToAct = new Set();
    for (const p of activePlayers) {
      if (!this.allInUUIDs.has(p.uuid)) {
        this.needsToAct.add(p.uuid);
      }
    }

    // If the initial player is all-in, advance to the next acting player
    if (this.allInUUIDs.has(activePlayers[firstToActIndex]?.uuid)) {
      this._advanceToNextActingPlayer();
    }
  }

  /**
   * Advance currentPlayerIndex to next player who needs to act (not folded, not all-in).
   */
  _advanceToNextActingPlayer() {
    const n = this.activePlayers.length;
    for (let i = 0; i < n; i++) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % n;
      const uuid = this.activePlayers[this.currentPlayerIndex].uuid;
      if (this.needsToAct.has(uuid) && !this.foldedThisStreet.has(uuid) && !this.allInUUIDs.has(uuid)) {
        return;
      }
    }
  }

  getCurrentPlayerUUID() {
    if (this.isComplete()) return null;
    return this.activePlayers[this.currentPlayerIndex].uuid;
  }

  getCallAmount(playerUUID) {
    const contributed = this.playerContributions.get(playerUUID) || 0;
    return this.currentBet - contributed;
  }

  /**
   * Get the chip stack of a player.
   */
  _getStack(playerUUID) {
    const p = this.activePlayers.find(p => p.uuid === playerUUID);
    return p ? p.chipStack : 0;
  }

  getValidActions(playerUUID) {
    if (this.getCurrentPlayerUUID() !== playerUUID) return [];

    const callAmount = this.getCallAmount(playerUUID);
    const stack = this._getStack(playerUUID);
    const actions = ['fold'];

    if (callAmount === 0) {
      actions.push('check');
      if (stack > 0) actions.push('bet');
    } else {
      actions.push('call'); // may be a partial call (all-in)
    }

    if (this.currentBet > 0 && stack > callAmount) {
      actions.push('raise');
    }

    return actions;
  }

  /**
   * Process a player's action.
   * Handles all-in automatically when a player commits all chips.
   */
  processAction(playerUUID, action) {
    if (action.type !== 'blind') {
      if (this.getCurrentPlayerUUID() !== playerUUID) {
        return { valid: false, error: 'Not your turn' };
      }
    }

    const callAmount = this.getCallAmount(playerUUID);
    const contributed = this.playerContributions.get(playerUUID) || 0;
    const stack = this._getStack(playerUUID);

    let recordedAction;

    switch (action.type) {
      case 'fold': {
        recordedAction = { playerUUID, type: 'fold', amount: 0, chipsDelta: 0 };
        this.foldedThisStreet.add(playerUUID);
        this.needsToAct.delete(playerUUID);
        break;
      }

      case 'check': {
        if (callAmount > 0) {
          return { valid: false, error: `Cannot check — must call ${callAmount} or fold` };
        }
        recordedAction = { playerUUID, type: 'check', amount: 0, chipsDelta: 0 };
        this.needsToAct.delete(playerUUID);
        break;
      }

      case 'call': {
        if (callAmount <= 0) {
          return { valid: false, error: 'Nothing to call — use check' };
        }
        // All-in call: player can't afford full call
        const actualCall = Math.min(callAmount, stack);
        const isAllIn = actualCall >= stack;
        const actionType = isAllIn ? 'all-in' : 'call';

        recordedAction = { playerUUID, type: actionType, amount: actualCall, chipsDelta: actualCall };
        this.playerContributions.set(playerUUID, contributed + actualCall);
        this.needsToAct.delete(playerUUID);

        if (isAllIn) {
          this.allInUUIDs.add(playerUUID);
        }
        break;
      }

      case 'bet': {
        if (this.currentBet > 0) {
          return { valid: false, error: 'Cannot open bet — there is already a bet. Use raise.' };
        }
        let betAmount = action.amount;
        if (!betAmount || betAmount <= 0) {
          return { valid: false, error: 'Bet amount must be positive' };
        }

        // All-in bet
        const isAllIn = betAmount >= stack;
        if (isAllIn) betAmount = stack;

        recordedAction = {
          playerUUID,
          type: isAllIn ? 'all-in' : 'bet',
          amount: betAmount,
          chipsDelta: betAmount,
        };
        this.currentBet = betAmount;
        this.playerContributions.set(playerUUID, contributed + betAmount);

        if (isAllIn) {
          this.allInUUIDs.add(playerUUID);
        }

        this._resetNeedsToActExcept(playerUUID);
        break;
      }

      case 'raise': {
        if (this.currentBet <= 0 && callAmount <= 0) {
          return { valid: false, error: 'Cannot raise — no bet to raise. Use bet.' };
        }
        let raiseAmount = action.amount;
        if (!raiseAmount || raiseAmount <= this.currentBet) {
          return { valid: false, error: `Raise must be above current bet (${this.currentBet})` };
        }

        const chipsDelta = raiseAmount - contributed;
        // All-in raise
        const isAllIn = chipsDelta >= stack;
        const actualDelta = isAllIn ? stack : chipsDelta;
        const actualTotal = contributed + actualDelta;

        recordedAction = {
          playerUUID,
          type: isAllIn ? 'all-in' : 'raise',
          amount: actualTotal,
          chipsDelta: actualDelta,
        };
        this.currentBet = actualTotal;
        this.playerContributions.set(playerUUID, actualTotal);

        if (isAllIn) {
          this.allInUUIDs.add(playerUUID);
        }

        this._resetNeedsToActExcept(playerUUID);
        break;
      }

      case 'blind': {
        const blindAmount = action.amount;
        const isAllIn = blindAmount >= stack;
        const actualBlind = isAllIn ? stack : blindAmount;

        recordedAction = {
          playerUUID,
          type: isAllIn ? 'all-in' : 'blind',
          amount: actualBlind,
          chipsDelta: actualBlind,
        };
        this.playerContributions.set(playerUUID, contributed + actualBlind);
        if (actualBlind > this.currentBet) {
          this.currentBet = actualBlind;
        }
        if (isAllIn) {
          this.allInUUIDs.add(playerUUID);
          this.needsToAct.delete(playerUUID);
        }
        break;
      }

      default:
        return { valid: false, error: `Unknown action type: ${action.type}` };
    }

    this.actions.push(recordedAction);

    if (action.type !== 'blind') {
      this._advanceToNextPlayer();
    }

    return { valid: true, action: recordedAction };
  }

  isComplete() {
    return this.needsToAct.size === 0;
  }

  getActivePlayerCount() {
    return this.activePlayers.filter(p =>
      !this.foldedThisStreet.has(p.uuid)
    ).length;
  }

  getActivePlayers() {
    return this.activePlayers.filter(p => !this.foldedThisStreet.has(p.uuid));
  }

  _advanceToNextPlayer() {
    if (this.isComplete()) return;

    const n = this.activePlayers.length;
    let attempts = 0;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % n;
      attempts++;
      const uuid = this.activePlayers[this.currentPlayerIndex].uuid;
      if (this.needsToAct.has(uuid) && !this.foldedThisStreet.has(uuid) && !this.allInUUIDs.has(uuid)) {
        return;
      }
    } while (attempts < n);
  }

  _resetNeedsToActExcept(excludeUUID) {
    this.needsToAct.clear();
    for (const p of this.activePlayers) {
      if (p.uuid !== excludeUUID && !this.foldedThisStreet.has(p.uuid) && !this.allInUUIDs.has(p.uuid)) {
        this.needsToAct.add(p.uuid);
      }
    }
  }

  serialize() {
    return {
      name: this.name,
      communityCards: this.communityCards,
      actions: this.actions,
      currentBet: this.currentBet,
      currentPlayerUUID: this.getCurrentPlayerUUID(),
      playerContributions: Object.fromEntries(this.playerContributions),
      allInUUIDs: [...this.allInUUIDs],
    };
  }
}

export { Street };
