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
  { uuid: 'p0' },
  { uuid: 'p1' },
  { uuid: 'p2' },
];

console.log('=== Street Tests ===\n');

// ─── Basic construction ───

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

// ─── Check-around completes the street ───

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

// ─── Bet → Call → Call ───

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

// ─── Bet → Raise → Call → Call ───

console.log('4. Bet → Raise → re-action required');
{
  const street = new Street('flop', [], players, 0);

  street.processAction('p0', { type: 'bet', amount: 50 });
  street.processAction('p1', { type: 'raise', amount: 100 });

  assert(street.currentBet === 100, 'Current bet raised to 100');
  assert(street.getCurrentPlayerUUID() === 'p2', 'Turn moves to p2');

  // p2 calls
  let r = street.processAction('p2', { type: 'call' });
  assert(r.valid, 'p2 call valid');
  assert(r.action.amount === 100, 'p2 calls 100');
  assert(!street.isComplete(), 'Street NOT complete — p0 still needs to act');

  // p0 must act again (they only put in 50, raise was to 100)
  assert(street.getCurrentPlayerUUID() === 'p0', 'Turn back to p0');
  r = street.processAction('p0', { type: 'call' });
  assert(r.valid, 'p0 call valid');
  assert(r.action.amount === 50, 'p0 calls remaining 50');
  assert(street.isComplete(), 'Street complete now');
}

// ─── Fold reduces active players ───

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

// ─── Wrong player acting ───

console.log('6. Wrong player error');
{
  const street = new Street('flop', [], players, 0);
  const r = street.processAction('p1', { type: 'check' });
  assert(!r.valid, 'p1 acting out of turn is invalid');
  assert(r.error === 'Not your turn', 'Correct error message');
}

// ─── Cannot check when there's a bet ───

console.log('7. Cannot check when bet exists');
{
  const street = new Street('flop', [], players, 0);
  street.processAction('p0', { type: 'bet', amount: 50 });
  const r = street.processAction('p1', { type: 'check' });
  assert(!r.valid, 'Cannot check when there is a bet');
}

// ─── Cannot call when nothing to call ───

console.log('8. Cannot call when no bet');
{
  const street = new Street('flop', [], players, 0);
  const r = street.processAction('p0', { type: 'call' });
  assert(!r.valid, 'Cannot call when there is no bet');
}

// ─── Raise must be above current bet ───

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

// ─── Preflop with blinds ───

console.log('10. Preflop with blinds');
{
  // Simulate: p0 = dealer, p1 = SB, p2 = BB
  // firstToAct = p0 (UTG, which is left of BB, wraps around to dealer in 3-player)
  const street = new Street('preflop', [], players, 0);

  // Post blinds (done programmatically before player actions)
  street.processAction('p1', { type: 'blind', amount: 10 });
  street.processAction('p2', { type: 'blind', amount: 20 });

  assert(street.currentBet === 20, 'Current bet is 20 (big blind)');
  assert(street.getCurrentPlayerUUID() === 'p0', 'UTG (p0) acts first');

  // p0 calls
  street.processAction('p0', { type: 'call' });
  assert(street.getCurrentPlayerUUID() === 'p1', 'SB acts next');

  // p1 calls (needs 10 more, already put in 10)
  let r = street.processAction('p1', { type: 'call' });
  assert(r.valid, 'SB call valid');
  assert(r.action.amount === 10, 'SB pays 10 more');
  assert(street.getCurrentPlayerUUID() === 'p2', 'BB acts last');

  // BB checks (option)
  r = street.processAction('p2', { type: 'check' });
  assert(r.valid, 'BB check valid');
  assert(street.isComplete(), 'Preflop complete');
}

// ─── Preflop: BB raise ───

console.log('11. Preflop — BB raises');
{
  const street = new Street('preflop', [], players, 0);
  street.processAction('p1', { type: 'blind', amount: 10 });
  street.processAction('p2', { type: 'blind', amount: 20 });

  street.processAction('p0', { type: 'call' }); // UTG calls 20
  street.processAction('p1', { type: 'call' }); // SB calls 10 more
  // BB raises instead of checking
  street.processAction('p2', { type: 'raise', amount: 60 });

  assert(!street.isComplete(), 'Street not complete after BB raise');
  assert(street.currentBet === 60, 'Current bet is 60');

  // p0 and p1 need to act again
  street.processAction('p0', { type: 'call' }); // calls 40 more
  street.processAction('p1', { type: 'call' }); // calls 50 more (10+10 already in, need 60 total)
  assert(street.isComplete(), 'Complete after everyone matches BB raise');
}

// ─── All fold to one player ───

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

// ─── Serialize ───

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

// ─── getValidActions ───

console.log('14. getValidActions');
{
  const street = new Street('flop', [], players, 0);

  // No bet yet — can check, bet, fold
  let valid = street.getValidActions('p0');
  assert(valid.includes('check'), 'Can check when no bet');
  assert(valid.includes('bet'), 'Can bet when no bet');
  assert(valid.includes('fold'), 'Can always fold');
  assert(!valid.includes('call'), 'Cannot call when no bet');

  // After a bet — can call, raise, fold
  street.processAction('p0', { type: 'bet', amount: 50 });
  valid = street.getValidActions('p1');
  assert(valid.includes('call'), 'Can call when there is a bet');
  assert(valid.includes('raise'), 'Can raise when there is a bet');
  assert(valid.includes('fold'), 'Can fold');
  assert(!valid.includes('check'), 'Cannot check when there is a bet');
}

// ─── Heads-up (2 players) ───

console.log('15. Heads-up — 2 players');
{
  const headsUp = [{ uuid: 'a' }, { uuid: 'b' }];
  const street = new Street('flop', [], headsUp, 0);

  street.processAction('a', { type: 'bet', amount: 30 });
  street.processAction('b', { type: 'call' });
  assert(street.isComplete(), 'Heads-up completes after bet + call');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
