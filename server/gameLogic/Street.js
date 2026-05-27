/**
 * Street — owns all betting logic for a single street.
 *
 * Tracks turns, validates actions, detects betting round completion
 * using a `needsToAct` set.
 */
class Street {
  /**
   * @param {string} name — 'preflop' | 'flop' | 'turn' | 'river'
   * @param {Array} communityCards — cards visible on this street
   * @param {Array<{uuid: string}>} activePlayers — ordered list of active players
   * @param {number} firstToActIndex — index into activePlayers for who acts first
   */
  constructor(name, communityCards, activePlayers, firstToActIndex) {
    this.name = name;
    this.communityCards = [...communityCards];
    this.actions = [];
    this.currentBet = 0;
    this.activePlayers = activePlayers; // reference — ordered, may include players who fold during this street
    this.currentPlayerIndex = firstToActIndex;
    this.playerContributions = new Map(); // uuid → amount contributed THIS street
    this.needsToAct = new Set(activePlayers.map(p => p.uuid));
    this.foldedThisStreet = new Set(); // track who folded during this street
  }

  /**
   * Get the UUID of the player whose turn it is.
   */
  getCurrentPlayerUUID() {
    if (this.isComplete()) return null;
    return this.activePlayers[this.currentPlayerIndex].uuid;
  }

  /**
   * Get how much a player needs to call.
   */
  getCallAmount(playerUUID) {
    const contributed = this.playerContributions.get(playerUUID) || 0;
    return this.currentBet - contributed;
  }

  /**
   * Determine what actions are valid for a player.
   */
  getValidActions(playerUUID) {
    if (this.getCurrentPlayerUUID() !== playerUUID) return [];

    const callAmount = this.getCallAmount(playerUUID);
    const actions = ['fold'];

    if (callAmount === 0) {
      actions.push('check');
      actions.push('bet'); // opening bet when no one has bet yet
    } else {
      actions.push('call');
    }

    // Raise is always available when there's a current bet
    // Bet is the opening action (currentBet is 0 or player has matched)
    if (callAmount > 0) {
      actions.push('raise');
    } else if (this.currentBet > 0) {
      // Someone bet/raised, player has already matched — they can raise
      actions.push('raise');
    }

    return actions;
  }

  /**
   * Process a player's action.
   * @param {string} playerUUID
   * @param {{ type: string, amount?: number }} action
   * @returns {{ valid: boolean, error?: string, action?: object }}
   */
  processAction(playerUUID, action) {
    // Blinds bypass turn validation — they're posted programmatically
    if (action.type !== 'blind') {
      // Validate it's this player's turn
      if (this.getCurrentPlayerUUID() !== playerUUID) {
        return { valid: false, error: 'Not your turn' };
      }
    }

    const callAmount = this.getCallAmount(playerUUID);
    const contributed = this.playerContributions.get(playerUUID) || 0;

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
        recordedAction = { playerUUID, type: 'call', amount: callAmount, chipsDelta: callAmount };
        this.playerContributions.set(playerUUID, contributed + callAmount);
        this.needsToAct.delete(playerUUID);
        break;
      }

      case 'bet': {
        if (this.currentBet > 0) {
          return { valid: false, error: 'Cannot open bet — there is already a bet. Use raise.' };
        }
        const betAmount = action.amount;
        if (!betAmount || betAmount <= 0) {
          return { valid: false, error: 'Bet amount must be positive' };
        }
        recordedAction = { playerUUID, type: 'bet', amount: betAmount, chipsDelta: betAmount };
        this.currentBet = betAmount;
        this.playerContributions.set(playerUUID, contributed + betAmount);

        // Everyone else needs to act again
        this._resetNeedsToActExcept(playerUUID);
        break;
      }

      case 'raise': {
        if (this.currentBet <= 0 && callAmount <= 0) {
          return { valid: false, error: 'Cannot raise — no bet to raise. Use bet.' };
        }
        const raiseAmount = action.amount;
        if (!raiseAmount || raiseAmount <= this.currentBet) {
          return { valid: false, error: `Raise must be above current bet (${this.currentBet})` };
        }
        const chipsDelta = raiseAmount - contributed;
        recordedAction = { playerUUID, type: 'raise', amount: raiseAmount, chipsDelta };
        this.currentBet = raiseAmount;
        this.playerContributions.set(playerUUID, raiseAmount);

        // Everyone else needs to act again
        this._resetNeedsToActExcept(playerUUID);
        break;
      }

      case 'blind': {
        // Blinds are posted programmatically, not by player action
        const blindAmount = action.amount;
        recordedAction = { playerUUID, type: 'blind', amount: blindAmount, chipsDelta: blindAmount };
        this.playerContributions.set(playerUUID, contributed + blindAmount);
        if (blindAmount > this.currentBet) {
          this.currentBet = blindAmount;
        }
        // Don't remove from needsToAct — blind poster still gets to act
        break;
      }

      default:
        return { valid: false, error: `Unknown action type: ${action.type}` };
    }

    this.actions.push(recordedAction);

    // Advance to next player (skip folded and already-acted)
    if (action.type !== 'blind') {
      this._advanceToNextPlayer();
    }

    return { valid: true, action: recordedAction };
  }

  /**
   * Is the betting round complete?
   */
  isComplete() {
    return this.needsToAct.size === 0;
  }

  /**
   * Get count of players still active (not folded) in this street.
   */
  getActivePlayerCount() {
    return this.activePlayers.filter(p => !this.foldedThisStreet.has(p.uuid)).length;
  }

  /**
   * Get the players who haven't folded this street.
   */
  getActivePlayers() {
    return this.activePlayers.filter(p => !this.foldedThisStreet.has(p.uuid));
  }

  /**
   * Advance currentPlayerIndex to the next player who needs to act.
   * Skips folded players.
   */
  _advanceToNextPlayer() {
    if (this.isComplete()) return;

    const n = this.activePlayers.length;
    let attempts = 0;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % n;
      attempts++;
      const uuid = this.activePlayers[this.currentPlayerIndex].uuid;
      if (this.needsToAct.has(uuid) && !this.foldedThisStreet.has(uuid)) {
        return;
      }
    } while (attempts < n);
  }

  /**
   * Reset needsToAct to all non-folded players except the given UUID.
   */
  _resetNeedsToActExcept(excludeUUID) {
    this.needsToAct.clear();
    for (const p of this.activePlayers) {
      if (p.uuid !== excludeUUID && !this.foldedThisStreet.has(p.uuid)) {
        this.needsToAct.add(p.uuid);
      }
    }
  }

  /**
   * Serialize for client.
   */
  serialize() {
    return {
      name: this.name,
      communityCards: this.communityCards,
      actions: this.actions,
      currentBet: this.currentBet,
      currentPlayerUUID: this.getCurrentPlayerUUID(),
      playerContributions: Object.fromEntries(this.playerContributions),
    };
  }
}

export { Street };
