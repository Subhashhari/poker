/**
 * PotManager — tracks pot contributions.
 * Uses a pots[] array from day one for easy side-pot transition in v1.1.
 *
 * v1: Single main pot. All contributions go to pots[0].
 * v1.1: Add splitForAllIn() to create side pots when a player goes all-in.
 */
class PotManager {
  constructor() {
    this.pots = [{ amount: 0, eligiblePlayerUUIDs: new Set() }];
  }

  /**
   * Add a player's contribution to the main pot.
   */
  contribute(playerUUID, amount) {
    if (amount <= 0) return;
    this.pots[0].amount += amount;
    this.pots[0].eligiblePlayerUUIDs.add(playerUUID);
  }

  /**
   * Total across all pots.
   */
  getTotal() {
    return this.pots.reduce((sum, pot) => sum + pot.amount, 0);
  }

  /**
   * Resolve each pot to a winner.
   * @param {Function} findWinnerAmong - (uuids: string[]) => string (winner UUID)
   * @returns {Array<{ amount: number, winnerUUID: string }>}
   */
  resolvePots(findWinnerAmong) {
    return this.pots
      .filter(pot => pot.amount > 0)
      .map(pot => ({
        amount: pot.amount,
        winnerUUID: findWinnerAmong([...pot.eligiblePlayerUUIDs]),
      }));
  }

  /**
   * Mark a player as no longer eligible for pots (e.g., they folded).
   * In v1 with a single pot this isn't strictly required for correctness
   * (folded players aren't passed to findWinner), but keeps the data clean
   * and is essential for v1.1 side pots.
   */
  removeEligibility(playerUUID) {
    for (const pot of this.pots) {
      pot.eligiblePlayerUUIDs.delete(playerUUID);
    }
  }

  /**
   * Serialize for sending to clients.
   */
  serialize() {
    return this.pots.map(p => ({
      amount: p.amount,
      eligiblePlayerUUIDs: [...p.eligiblePlayerUUIDs],
    }));
  }

  /**
   * Reset for a new round.
   */
  reset() {
    this.pots = [{ amount: 0, eligiblePlayerUUIDs: new Set() }];
  }
}

export { PotManager };
