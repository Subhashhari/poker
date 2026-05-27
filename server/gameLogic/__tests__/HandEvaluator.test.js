/**
 * HandEvaluator.js — Test Suite
 * Run: node server/gameLogic/__tests__/HandEvaluator.test.js
 */
import {
  evaluate5,
  evaluateBestHand,
  compareHands,
  findWinner,
  handRankName,
  HAND_RANK,
} from '../HandEvaluator.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// Helper: create card from shorthand, e.g. 'As' = Ace of spades
function c(str) {
  const rankMap = {
    '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', 'T': 'T', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
  };
  const suitMap = { 'h': 'hearts', 'd': 'diamonds', 'c': 'clubs', 's': 'spades' };
  return { rank: rankMap[str[0]], suit: suitMap[str[1]] };
}

console.log('=== HandEvaluator Tests ===\n');

// ─── 5-card evaluation tests ───

console.log('1. High Card');
{
  const hand = [c('2h'), c('5d'), c('9c'), c('Js'), c('Ah')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.HIGH_CARD, `Rank is HIGH_CARD (${result.handRank})`);
  assert(result.values[0] === 14, 'High card is Ace (14)');
}

console.log('2. One Pair');
{
  const hand = [c('7h'), c('7d'), c('3c'), c('9s'), c('Kh')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.ONE_PAIR, `Rank is ONE_PAIR (${result.handRank})`);
  assert(result.values[0] === 7, 'Pair of 7s');
}

console.log('3. Two Pair');
{
  const hand = [c('Ah'), c('Ad'), c('Kc'), c('Ks'), c('3h')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.TWO_PAIR, `Rank is TWO_PAIR (${result.handRank})`);
  assert(result.values[0] === 14, 'High pair is Aces');
  assert(result.values[1] === 13, 'Low pair is Kings');
  assert(result.values[2] === 3, 'Kicker is 3');
}

console.log('4. Three of a Kind');
{
  const hand = [c('Qh'), c('Qd'), c('Qc'), c('5s'), c('2h')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.THREE_OF_A_KIND, `Rank is THREE_OF_A_KIND (${result.handRank})`);
  assert(result.values[0] === 12, 'Trip Queens (12)');
}

console.log('5. Straight (normal)');
{
  const hand = [c('5h'), c('6d'), c('7c'), c('8s'), c('9h')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.STRAIGHT, `Rank is STRAIGHT (${result.handRank})`);
  assert(result.values[0] === 9, '9-high straight');
}

console.log('6. Straight (Ace-low / wheel)');
{
  const hand = [c('Ah'), c('2d'), c('3c'), c('4s'), c('5h')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.STRAIGHT, `Rank is STRAIGHT (${result.handRank})`);
  assert(result.values[0] === 5, '5-high straight (wheel)');
}

console.log('7. Straight (Ace-high / broadway)');
{
  const hand = [c('Th'), c('Jd'), c('Qc'), c('Ks'), c('Ah')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.STRAIGHT, `Rank is STRAIGHT (${result.handRank})`);
  assert(result.values[0] === 14, 'Ace-high straight');
}

console.log('8. Flush');
{
  const hand = [c('2h'), c('5h'), c('8h'), c('Jh'), c('Ah')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.FLUSH, `Rank is FLUSH (${result.handRank})`);
  assert(result.values[0] === 14, 'Ace-high flush');
}

console.log('9. Full House');
{
  const hand = [c('Th'), c('Td'), c('Tc'), c('4s'), c('4h')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.FULL_HOUSE, `Rank is FULL_HOUSE (${result.handRank})`);
  assert(result.values[0] === 10, 'Tens full');
  assert(result.values[1] === 4, '...of Fours');
}

console.log('10. Four of a Kind');
{
  const hand = [c('8h'), c('8d'), c('8c'), c('8s'), c('Ah')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.FOUR_OF_A_KIND, `Rank is FOUR_OF_A_KIND (${result.handRank})`);
  assert(result.values[0] === 8, 'Quad 8s');
  assert(result.values[1] === 14, 'Ace kicker');
}

console.log('11. Straight Flush');
{
  const hand = [c('5d'), c('6d'), c('7d'), c('8d'), c('9d')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.STRAIGHT_FLUSH, `Rank is STRAIGHT_FLUSH (${result.handRank})`);
  assert(result.values[0] === 9, '9-high straight flush');
}

console.log('12. Royal Flush (Straight Flush, Ace-high)');
{
  const hand = [c('Ts'), c('Js'), c('Qs'), c('Ks'), c('As')];
  const result = evaluate5(hand);
  assert(result.handRank === HAND_RANK.STRAIGHT_FLUSH, `Rank is STRAIGHT_FLUSH (${result.handRank})`);
  assert(result.values[0] === 14, 'Ace-high (royal)');
}

// ─── Hand comparison tests ───

console.log('\n13. Compare: Flush beats Straight');
{
  const flush = evaluate5([c('2h'), c('5h'), c('8h'), c('Jh'), c('Ah')]);
  const straight = evaluate5([c('5h'), c('6d'), c('7c'), c('8s'), c('9h')]);
  assert(compareHands(flush, straight) > 0, 'Flush > Straight');
}

console.log('14. Compare: Higher pair wins');
{
  const pairK = evaluate5([c('Kh'), c('Kd'), c('3c'), c('5s'), c('7h')]);
  const pair9 = evaluate5([c('9h'), c('9d'), c('Ac'), c('Ks'), c('Qh')]);
  assert(compareHands(pairK, pair9) > 0, 'Pair K > Pair 9');
}

console.log('15. Compare: Same pair, kicker decides');
{
  const pairAK = evaluate5([c('Ah'), c('Ad'), c('Kc'), c('5s'), c('3h')]);
  const pairAQ = evaluate5([c('Ah'), c('Ac'), c('Qd'), c('5s'), c('3h')]);
  assert(compareHands(pairAK, pairAQ) > 0, 'Pair A, K kicker > Pair A, Q kicker');
}

console.log('16. Compare: Identical hands tie');
{
  const a = evaluate5([c('Ah'), c('Kd'), c('Qc'), c('Js'), c('9h')]);
  const b = evaluate5([c('As'), c('Kc'), c('Qh'), c('Jd'), c('9c')]);
  assert(compareHands(a, b) === 0, 'Identical high-card hands tie');
}

// ─── Best hand from 7 cards ───

console.log('\n17. Best hand from 7 cards');
{
  const hole = [c('Ah'), c('Kh')];
  const community = [c('Qh'), c('Jh'), c('Th'), c('2d'), c('3c')];
  const result = evaluateBestHand(hole, community);
  assert(result.handRank === HAND_RANK.STRAIGHT_FLUSH, 'Finds royal flush from 7 cards');
  assert(result.values[0] === 14, 'Ace-high');
}

console.log('18. Best hand selects the stronger combo');
{
  const hole = [c('Ah'), c('As')];
  const community = [c('Ad'), c('Kh'), c('Kd'), c('7c'), c('2s')];
  const result = evaluateBestHand(hole, community);
  assert(result.handRank === HAND_RANK.FULL_HOUSE, 'Full house (Aces full of Kings)');
  assert(result.values[0] === 14, 'Trips Aces');
  assert(result.values[1] === 13, 'Pair Kings');
}

// ─── findWinner tests ───

console.log('\n19. findWinner — clear winner');
{
  const players = [
    { uuid: 'p1', hand: [c('Ah'), c('Kh')] },
    { uuid: 'p2', hand: [c('2d'), c('7c')] },
  ];
  const community = [c('Qh'), c('Jh'), c('Th'), c('3d'), c('5c')];
  const result = findWinner(players, community);
  assert(result.winnerUUID === 'p1', 'p1 wins with royal flush');
  assert(!result.isTie, 'Not a tie');
}

console.log('20. findWinner — tie');
{
  const players = [
    { uuid: 'p1', hand: [c('2h'), c('3d')] },
    { uuid: 'p2', hand: [c('2d'), c('3c')] },
  ];
  // Community makes the best hand for both
  const community = [c('As'), c('Kh'), c('Qd'), c('Jc'), c('Ts')];
  const result = findWinner(players, community);
  assert(result.isTie, 'Detects tie');
  assert(result.tiedPlayerUUIDs.length === 2, 'Both players tied');
}

console.log('21. handRankName');
{
  assert(handRankName(HAND_RANK.STRAIGHT_FLUSH) === 'Straight Flush', 'Straight Flush name');
  assert(handRankName(HAND_RANK.TWO_PAIR) === 'Two Pair', 'Two Pair name');
  assert(handRankName(HAND_RANK.HIGH_CARD) === 'High Card', 'High Card name');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
