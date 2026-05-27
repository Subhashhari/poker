import { RANKS } from './Deck.js';

/**
 * Map rank character to numeric value for comparison.
 * 2=2 ... 9=9, T=10, J=11, Q=12, K=13, A=14
 */
const RANK_VALUES = {};
RANKS.forEach((r, i) => {
  RANK_VALUES[r] = i + 2;
});

/**
 * Hand rank constants (higher = better).
 */
const HAND_RANK = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  // Royal flush is a straight flush with high card Ace — same rank, no separate constant needed
};

/**
 * Evaluate a 5-card hand.
 * @param {Array<{suit: string, rank: string}>} cards — exactly 5 cards
 * @returns {{ handRank: number, values: number[] }}
 */
function evaluate5(cards) {
  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  // Check flush
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = values[0];

  // Normal straight: consecutive descending values
  if (
    values[0] - values[1] === 1 &&
    values[1] - values[2] === 1 &&
    values[2] - values[3] === 1 &&
    values[3] - values[4] === 1
  ) {
    isStraight = true;
    straightHigh = values[0];
  }

  // Ace-low straight (wheel): A-2-3-4-5 → values sorted = [14,5,4,3,2]
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count rank frequencies
  const freqMap = {};
  for (const v of values) {
    freqMap[v] = (freqMap[v] || 0) + 1;
  }
  // Sort by frequency desc, then by value desc
  const groups = Object.entries(freqMap)
    .map(([val, count]) => ({ val: Number(val), count }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  // Straight flush (includes royal flush)
  if (isStraight && isFlush) {
    return { handRank: HAND_RANK.STRAIGHT_FLUSH, values: [straightHigh] };
  }

  // Four of a kind
  if (groups[0].count === 4) {
    return {
      handRank: HAND_RANK.FOUR_OF_A_KIND,
      values: [groups[0].val, groups[1].val],
    };
  }

  // Full house
  if (groups[0].count === 3 && groups[1].count === 2) {
    return {
      handRank: HAND_RANK.FULL_HOUSE,
      values: [groups[0].val, groups[1].val],
    };
  }

  // Flush
  if (isFlush) {
    return { handRank: HAND_RANK.FLUSH, values };
  }

  // Straight
  if (isStraight) {
    return { handRank: HAND_RANK.STRAIGHT, values: [straightHigh] };
  }

  // Three of a kind
  if (groups[0].count === 3) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.val);
    return {
      handRank: HAND_RANK.THREE_OF_A_KIND,
      values: [groups[0].val, ...kickers],
    };
  }

  // Two pair
  if (groups[0].count === 2 && groups[1].count === 2) {
    const highPair = Math.max(groups[0].val, groups[1].val);
    const lowPair = Math.min(groups[0].val, groups[1].val);
    const kicker = groups[2].val;
    return {
      handRank: HAND_RANK.TWO_PAIR,
      values: [highPair, lowPair, kicker],
    };
  }

  // One pair
  if (groups[0].count === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.val);
    return {
      handRank: HAND_RANK.ONE_PAIR,
      values: [groups[0].val, ...kickers],
    };
  }

  // High card
  return { handRank: HAND_RANK.HIGH_CARD, values };
}

/**
 * Generate all C(n, k) combinations from an array.
 */
function combinations(arr, k) {
  const result = [];
  function backtrack(start, current) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/**
 * Compare two evaluated hands.
 * @returns negative if a < b, 0 if tie, positive if a > b
 */
function compareHands(a, b) {
  if (a.handRank !== b.handRank) return a.handRank - b.handRank;
  for (let i = 0; i < a.values.length; i++) {
    if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  }
  return 0;
}

/**
 * Evaluate the best 5-card hand from hole cards + community cards.
 * @param {Array} holeCards — 2 cards
 * @param {Array} communityCards — 3, 4, or 5 cards
 * @returns {{ handRank: number, values: number[], cards: Array }}
 */
function evaluateBestHand(holeCards, communityCards) {
  const allCards = [...holeCards, ...communityCards];
  const combos = combinations(allCards, 5);

  let best = null;
  let bestCards = null;

  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
      bestCards = combo;
    }
  }

  return { ...best, cards: bestCards };
}

/**
 * Find the winner among a set of players given community cards.
 * @param {Array<{ uuid: string, hand: Array }>} players — players with their hole cards
 * @param {Array} communityCards — 5 community cards
 * @returns {{ winnerUUID: string, hand: object, isTie: boolean, tiedPlayerUUIDs: string[] }}
 */
function findWinner(players, communityCards) {
  let bestResult = null;
  let winnerUUID = null;
  const tiedPlayerUUIDs = [];

  for (const player of players) {
    const result = evaluateBestHand(player.hand, communityCards);
    if (!bestResult) {
      bestResult = result;
      winnerUUID = player.uuid;
      tiedPlayerUUIDs.push(player.uuid);
    } else {
      const cmp = compareHands(result, bestResult);
      if (cmp > 0) {
        bestResult = result;
        winnerUUID = player.uuid;
        tiedPlayerUUIDs.length = 0;
        tiedPlayerUUIDs.push(player.uuid);
      } else if (cmp === 0) {
        tiedPlayerUUIDs.push(player.uuid);
      }
    }
  }

  return {
    winnerUUID,
    hand: bestResult,
    isTie: tiedPlayerUUIDs.length > 1,
    tiedPlayerUUIDs,
  };
}

/**
 * Get a human-readable name for a hand rank.
 */
function handRankName(handRank) {
  const names = [
    'High Card',
    'One Pair',
    'Two Pair',
    'Three of a Kind',
    'Straight',
    'Flush',
    'Full House',
    'Four of a Kind',
    'Straight Flush',
  ];
  return names[handRank] || 'Unknown';
}

export {
  evaluate5,
  evaluateBestHand,
  compareHands,
  findWinner,
  combinations,
  handRankName,
  HAND_RANK,
  RANK_VALUES,
};
