/**
 * Street.js — Test Suite
 * Run: node server/gameLogic/__tests__/Street.test.js
 */
import { Street } from '../Street.js';

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

const players = [
  { uuid: 'p0', chipStack: 1000 },
  { uuid: 'p1', chipStack: 1000 },
  { uuid: 'p2', chipStack: 1000 },
];

console.log('=== Street Tests ===\n');

console.log('1. Construction');
{
  const street = new Street('flop', [{ suit: 'hearts', rank: 'A' }], players, 0);
  assert(street.name === 'flop', 'Name is flop');
  assert(street.communityCards.length === 1, 'Has 1 community card');
  assert(street.currentBet === 0, 'Current bet is 0');
  assert(street.getCurrentPlayerUUID() === 'p0', 'First to act is p0');
  assert(!street.isComplete(), 'Street is not complete');
  assert(street.needsToAct.size === 3, 'All 3 players need to act');
}

console.log('2. All check — round completes');
{
  const street = new Street('flop', [], players, 0);
  let r = street.processAction('p0', { type: 'check' });
  assert(r.valid, 'p0 check valid');
  assert(street.getCurrentPlayerUUID() === 'p1', 'Turn moves to p1');

  r = street.processAction('p1', { type: 'check' });
  assert(r.valid, 'p1 check valid');
  assert(street.getCurrentPlayerUUID() === 'p2', 'Turn moves to p2');

  r = street.processAction('p2', { type: 'check' });
  assert(r.valid, 'p2 check valid');
  assert(street.isComplete(), 'Street is complete after all check');
  assert(street.actions.length === 3, '3 actions recorded');
}

console.log('3. Bet → Call → Call');
{
  const street = new Street('turn', [], players, 0);
  let r = street.processAction('p0', { type: 'bet', amount: 50 });
  assert(r.valid, 'p0 bet valid');
  assert(street.currentBet === 50, 'Current bet is 50');

  r = street.processAction('p1', { type: 'call' });
  assert(r.valid, 'p1 call valid');
  assert(r.action.amount === 50, 'p1 calls 50');

  r = street.processAction('p2', { type: 'call' });
  assert(r.valid, 'p2 call valid');
  assert(street.isComplete(), 'Street complete after all match');
}

console.log('4. Bet → Raise → re-action required');
{
  const street = new Street('flop', [], players, 0);
  street.processAction('p0', { type: 'bet', amount: 50 });
  street.processAction('p1', { type: 'raise', amount: 100 });

  assert(street.currentBet === 100, 'Current bet raised to 100');
  assert(street.getCurrentPlayerUUID() === 'p2', 'Turn moves to p2');

  let r = street.processAction('p2', { type: 'call' });
  assert(r.valid, 'p2 call valid');
  assert(r.action.amount === 100, 'p2 calls 100');
  assert(!street.isComplete(), 'Street NOT complete — p0 still needs to act');

  assert(street.getCurrentPlayerUUID() === 'p0', 'Turn back to p0');
  r = street.processAction('p0', { type: 'call' });
  assert(r.valid, 'p0 call valid');
  assert(r.action.amount === 50, 'p0 calls remaining 50');
  assert(street.isComplete(), 'Street complete now');
}

console.log('5. Fold');
{
  const street = new Street('flop', [], players, 0);
  let r = street.processAction('p0', { type: 'fold' });
  assert(r.valid, 'p0 fold valid');
  assert(street.getActivePlayerCount() === 2, '2 active after fold');

  r = street.processAction('p1', { type: 'check' });
  assert(r.valid, 'p1 check valid');

  r = street.processAction('p2', { type: 'check' });
  assert(r.valid, 'p2 check valid');
  assert(street.isComplete(), 'Street complete');
}

console.log('6. Wrong player error');
{
  const street = new Street('flop', [], players, 0);
  const r = street.processAction('p1', { type: 'check' });
  assert(!r.valid, 'p1 acting out of turn is invalid');
  assert(r.error === 'Not your turn', 'Correct error message');
}

console.log('7. Cannot check when bet exists');
{
  const street = new Street('flop', [], players, 0);
  street.processAction('p0', { type: 'bet', amount: 50 });
  const r = street.processAction('p1', { type: 'check' });
  assert(!r.valid, 'Cannot check when there is a bet');
}

console.log('8. Cannot call when no bet');
{
  const street = new Street('flop', [], players, 0);
  const r = street.processAction('p0', { type: 'call' });
  assert(!r.valid, 'Cannot call when there is no bet');
}

console.log('9. Raise validation');
{
  const street = new Street('flop', [], players, 0);
  street.processAction('p0', { type: 'bet', amount: 50 });

  let r = street.processAction('p1', { type: 'raise', amount: 30 });
  assert(!r.valid, 'Raise below current bet is invalid');

  r = street.processAction('p1', { type: 'raise', amount: 50 });
  assert(!r.valid, 'Raise equal to current bet is invalid');

  r = street.processAction('p1', { type: 'raise', amount: 100 });
  assert(r.valid, 'Raise above current bet is valid');
}

console.log('10. Preflop with blinds');
{
  const street = new Street('preflop', [], players, 0);
  street.processAction('p1', { type: 'blind', amount: 10 });
  street.processAction('p2', { type: 'blind', amount: 20 });

  assert(street.currentBet === 20, 'Current bet is 20 (big blind)');
  assert(street.getCurrentPlayerUUID() === 'p0', 'UTG (p0) acts first');

  street.processAction('p0', { type: 'call' });
  assert(street.getCurrentPlayerUUID() === 'p1', 'SB acts next');

  let r = street.processAction('p1', { type: 'call' });
  assert(r.valid, 'SB call valid');
  assert(r.action.amount === 10, 'SB pays 10 more');
  assert(street.getCurrentPlayerUUID() === 'p2', 'BB acts last');

  r = street.processAction('p2', { type: 'check' });
  assert(r.valid, 'BB check valid');
  assert(street.isComplete(), 'Preflop complete');
}

console.log('11. Preflop — BB raises');
{
  const street = new Street('preflop', [], players, 0);
  street.processAction('p1', { type: 'blind', amount: 10 });
  street.processAction('p2', { type: 'blind', amount: 20 });

  street.processAction('p0', { type: 'call' });
  street.processAction('p1', { type: 'call' });
  street.processAction('p2', { type: 'raise', amount: 60 });

  assert(!street.isComplete(), 'Street not complete after BB raise');
  assert(street.currentBet === 60, 'Current bet is 60');

  street.processAction('p0', { type: 'call' });
  street.processAction('p1', { type: 'call' });
  assert(street.isComplete(), 'Complete after everyone matches BB raise');
}

console.log('12. All fold to last player');
{
  const street = new Street('flop', [], players, 0);
  street.processAction('p0', { type: 'bet', amount: 100 });
  street.processAction('p1', { type: 'fold' });
  street.processAction('p2', { type: 'fold' });
  assert(street.isComplete(), 'Street complete when all fold');
  assert(street.getActivePlayerCount() === 1, 'One player remains');
  assert(street.getActivePlayers()[0].uuid === 'p0', 'p0 is the remaining player');
}

console.log('13. Serialize');
{
  const street = new Street('river', [{ suit: 'hearts', rank: 'K' }], players, 1);
  street.processAction('p1', { type: 'bet', amount: 25 });
  const s = street.serialize();
  assert(s.name === 'river', 'Serialized name');
  assert(s.currentBet === 25, 'Serialized currentBet');
  assert(s.currentPlayerUUID === 'p2', 'Serialized current player');
  assert(s.actions.length === 1, 'Serialized actions');
  assert(s.communityCards.length === 1, 'Serialized community cards');
}

console.log('14. getValidActions');
{
  const street = new Street('flop', [], players, 0);
  let valid = street.getValidActions('p0');
  assert(valid.includes('check'), 'Can check when no bet');
  assert(valid.includes('bet'), 'Can bet when no bet');
  assert(valid.includes('fold'), 'Can always fold');
  assert(!valid.includes('call'), 'Cannot call when no bet');

  street.processAction('p0', { type: 'bet', amount: 50 });
  valid = street.getValidActions('p1');
  assert(valid.includes('call'), 'Can call when there is a bet');
  assert(valid.includes('raise'), 'Can raise when there is a bet');
  assert(valid.includes('fold'), 'Can fold');
  assert(!valid.includes('check'), 'Cannot check when there is a bet');
}

console.log('15. Heads-up — 2 players');
{
  const headsUp = [{ uuid: 'a', chipStack: 500 }, { uuid: 'b', chipStack: 500 }];
  const street = new Street('flop', [], headsUp, 0);
  street.processAction('a', { type: 'bet', amount: 30 });
  street.processAction('b', { type: 'call' });
  assert(street.isComplete(), 'Heads-up completes after bet + call');
}

// ─── ALL-IN TESTS ───

console.log('\n16. All-in call — partial call');
{
  const p = [
    { uuid: 'rich', chipStack: 1000 },
    { uuid: 'poor', chipStack: 50 },
  ];
  const street = new Street('flop', [], p, 0);
  street.processAction('rich', { type: 'bet', amount: 200 });

  const r = street.processAction('poor', { type: 'call' });
  assert(r.valid, 'Partial call valid');
  assert(r.action.type === 'all-in', `Action type is all-in (got ${r.action.type})`);
  assert(r.action.chipsDelta === 50, `chipsDelta is 50 (got ${r.action.chipsDelta})`);
  assert(street.allInUUIDs.has('poor'), 'poor is all-in');
  assert(street.isComplete(), 'Street complete (only 2 players, both acted)');
}

console.log('17. All-in bet');
{
  const p = [
    { uuid: 'x', chipStack: 80 },
    { uuid: 'y', chipStack: 500 },
  ];
  const street = new Street('flop', [], p, 0);
  const r = street.processAction('x', { type: 'bet', amount: 200 }); // wants 200 but only has 80
  assert(r.valid, 'All-in bet valid');
  assert(r.action.type === 'all-in', 'Type is all-in');
  assert(r.action.chipsDelta === 80, `Delta is 80 (stack) — got ${r.action.chipsDelta}`);
  assert(street.currentBet === 80, `Current bet is 80 (got ${street.currentBet})`);
}

console.log('18. All-in raise');
{
  const p = [
    { uuid: 'a', chipStack: 1000 },
    { uuid: 'b', chipStack: 120 },
    { uuid: 'c', chipStack: 1000 },
  ];
  const street = new Street('flop', [], p, 0);
  street.processAction('a', { type: 'bet', amount: 100 });

  // b wants to raise to 200, but only has 120
  const r = street.processAction('b', { type: 'raise', amount: 200 });
  assert(r.valid, 'All-in raise valid');
  assert(r.action.type === 'all-in', 'Type is all-in');
  assert(r.action.chipsDelta === 120, `Delta is 120 (got ${r.action.chipsDelta})`);
  assert(street.allInUUIDs.has('b'), 'b is all-in');
}

console.log('19. All-in player skipped in next actions');
{
  const p = [
    { uuid: 'a', chipStack: 100 },
    { uuid: 'b', chipStack: 100 },
    { uuid: 'c', chipStack: 500 },
  ];
  const street = new Street('flop', [], p, 0, new Set(['a'])); // a is already all-in
  assert(street.needsToAct.size === 2, 'Only b and c need to act');
  assert(!street.needsToAct.has('a'), 'a does not need to act');

  street.processAction('b', { type: 'check' });
  street.processAction('c', { type: 'check' });
  assert(street.isComplete(), 'Complete without a acting');
}

console.log('20. All-in blind');
{
  const p = [
    { uuid: 'a', chipStack: 5 }, // less than blind
    { uuid: 'b', chipStack: 1000 },
  ];
  const street = new Street('preflop', [], p, 0);
  const r = street.processAction('a', { type: 'blind', amount: 10 });
  assert(r.valid, 'Blind with insufficient chips valid');
  assert(r.action.type === 'all-in', 'Type is all-in');
  assert(r.action.chipsDelta === 5, `Delta is 5 (got ${r.action.chipsDelta})`);
  assert(street.allInUUIDs.has('a'), 'a is all-in');
  assert(!street.needsToAct.has('a'), 'a removed from needsToAct');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
