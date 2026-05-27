/**
 * Deck.js — Test Suite
 * Run: node server/gameLogic/__tests__/Deck.test.js
 */
import { Deck, SUITS, RANKS } from '../Deck.js';

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

console.log('=== Deck Tests ===\n');

// Test 1: Deck has 52 cards
console.log('1. Construction');
{
  const deck = new Deck();
  assert(deck.remaining === 52, 'New deck has 52 cards');
}

// Test 2: All 52 cards are unique
console.log('2. Uniqueness');
{
  const deck = new Deck();
  const keys = deck.cards.map(c => `${c.rank}${c.suit}`);
  const unique = new Set(keys);
  assert(unique.size === 52, 'All 52 cards are unique');
}

// Test 3: Every suit × rank combination exists
console.log('3. Completeness');
{
  const deck = new Deck();
  let allPresent = true;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (!deck.cards.find(c => c.suit === suit && c.rank === rank)) {
        allPresent = false;
        break;
      }
    }
  }
  assert(allPresent, 'Every suit × rank combination is present');
}

// Test 4: Shuffle changes card order (probabilistic — run 5 shuffles, at least one should differ)
console.log('4. Shuffle');
{
  const original = new Deck();
  const originalOrder = original.cards.map(c => `${c.rank}${c.suit}`).join(',');
  let anyDifferent = false;
  for (let i = 0; i < 5; i++) {
    const deck = new Deck();
    deck.shuffle();
    const shuffledOrder = deck.cards.map(c => `${c.rank}${c.suit}`).join(',');
    if (shuffledOrder !== originalOrder) {
      anyDifferent = true;
      break;
    }
  }
  assert(anyDifferent, 'Shuffle changes card order');
}

// Test 5: Shuffle preserves all 52 cards
console.log('5. Shuffle preserves cards');
{
  const deck = new Deck();
  deck.shuffle();
  assert(deck.remaining === 52, 'Shuffled deck still has 52 cards');
  const keys = deck.cards.map(c => `${c.rank}${c.suit}`);
  const unique = new Set(keys);
  assert(unique.size === 52, 'All 52 are still unique after shuffle');
}

// Test 6: Deal returns correct number and removes from deck
console.log('6. Deal');
{
  const deck = new Deck();
  deck.shuffle();
  const hand = deck.deal(2);
  assert(hand.length === 2, 'deal(2) returns 2 cards');
  assert(deck.remaining === 50, 'Deck has 50 remaining after dealing 2');

  const flop = deck.deal(3);
  assert(flop.length === 3, 'deal(3) returns 3 cards');
  assert(deck.remaining === 47, 'Deck has 47 remaining after dealing 2+3');
}

// Test 7: Dealt cards are not duplicated
console.log('7. No duplicates across deals');
{
  const deck = new Deck();
  deck.shuffle();
  const all = [];
  all.push(...deck.deal(2));
  all.push(...deck.deal(2));
  all.push(...deck.deal(3));
  all.push(...deck.deal(1));
  all.push(...deck.deal(1));
  const keys = all.map(c => `${c.rank}${c.suit}`);
  const unique = new Set(keys);
  assert(unique.size === keys.length, 'No duplicate cards across multiple deals');
}

// Test 8: Deal more than remaining throws
console.log('8. Over-deal error');
{
  const deck = new Deck();
  deck.deal(50);
  let threw = false;
  try {
    deck.deal(5);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Dealing more than remaining throws an error');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
