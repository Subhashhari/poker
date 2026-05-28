/**
 * PotManager — tracks per-player contributions and computes side pots.
 *
 * Stores cumulative contributions per player. At showdown, `buildPots()`
 * calculates the correct main pot + side pots based on contribution tiers.
 */
class PotManager {
  constructor() {
    /** @type {Map<string, number>} uuid → total chips contributed */
    this.contributions = new Map();
    /** @type {Set<string>} players who folded (contributed but can't win) */
    this.foldedUUIDs = new Set();
  }

  /**
   * Add a player's contribution.
   */
  contribute(playerUUID, amount) {
    if (amount <= 0) return;
    this.contributions.set(
      playerUUID,
      (this.contributions.get(playerUUID) || 0) + amount
    );
  }

  /**
   * Mark a player as folded — they can't win any pot.
   */
  removeEligibility(playerUUID) {
    this.foldedUUIDs.add(playerUUID);
  }

  /**
   * Total across all contributions.
   */
  getTotal() {
    let sum = 0;
    for (const v of this.contributions.values()) sum += v;
    return sum;
  }

  /**
   * Build side pots from contribution tiers.
   *
   * Algorithm:
   * 1. Gather unique contribution levels, sorted ascending.
   * 2. For each tier, the pot slice is (tier - prevTier) × players who contributed ≥ tier.
   * 3. Eligible = contributed ≥ tier AND not folded.
   *
   * @returns {Array<{amount: number, eligibleUUIDs: string[]}>}
   */
  buildPots() {
    const entries = [...this.contributions.entries()]; // [uuid, totalContrib]

    // Get sorted unique contribution levels
    const levels = [...new Set(entries.map(([, amt]) => amt))].sort((a, b) => a - b);

    const pots = [];
    let prevLevel = 0;

    for (const level of levels) {
      if (level <= prevLevel) continue;
      const diff = level - prevLevel;

      // Players who contributed at least this level
      const contributors = entries.filter(([, amt]) => amt >= level);
      const potAmount = diff * contributors.length;

      // Eligible = contributed enough AND not folded
      const eligible = contributors
        .map(([uuid]) => uuid)
        .filter(uuid => !this.foldedUUIDs.has(uuid));

      if (potAmount > 0) {
        pots.push({ amount: potAmount, eligibleUUIDs: eligible });
      }

      prevLevel = level;
    }

    return pots;
  }

  /**
   * Resolve each pot to a winner using the provided callback.
   * @param {(eligibleUUIDs: string[]) => { winnerUUIDs: string[], isTie: boolean }} findWinnerAmong
   * @returns {Array<{amount: number, winnerUUIDs: string[]}>}
   */
  resolvePots(findWinnerAmong) {
    const pots = this.buildPots();
    return pots
      .filter(pot => pot.eligibleUUIDs.length > 0)
      .map(pot => {
        const result = findWinnerAmong(pot.eligibleUUIDs);
        return { amount: pot.amount, winnerUUIDs: result.winnerUUIDs };
      });
  }

  /**
   * Serialize for sending to clients.
   */
  serialize() {
    return this.buildPots().map(p => ({
      amount: p.amount,
      eligiblePlayerUUIDs: p.eligibleUUIDs,
    }));
  }

  /**
   * Reset for a new round.
   */
  reset() {
    this.contributions = new Map();
    this.foldedUUIDs = new Set();
  }
}

export { PotManager };
