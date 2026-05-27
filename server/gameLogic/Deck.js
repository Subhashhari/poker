const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

class Deck {
  constructor() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push({ suit, rank });
      }
    }
  }

  /**
   * Fisher-Yates shuffle — O(n) in-place.
   */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  /**
   * Deal n cards off the top of the deck. Removes them from the deck.
   * @param {number} n
   * @returns {Array<{suit: string, rank: string}>}
   */
  deal(n) {
    if (n > this.cards.length) {
      throw new Error(`Cannot deal ${n} cards — only ${this.cards.length} remain`);
    }
    return this.cards.splice(0, n);
  }

  /**
   * Number of cards remaining in the deck.
   */
  get remaining() {
    return this.cards.length;
  }
}

export { Deck, SUITS, RANKS };
