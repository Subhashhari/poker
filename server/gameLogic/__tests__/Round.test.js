/**
 * Round.js — Test Suite
 * Run: node server/gameLogic/__tests__/Round.test.js
 */
import { Round } from '../Round.js';

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

function makePlayers(n) {
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push({ uuid: `p${i}`, name: `Player${i}`, chipStack: 1000, hand: null, status: 'active', socketId: `s${i}` });
  }
  return players;
}

console.log('=== Round Tests ===\n');

// ─── Construction ───

console.log('1. Construction — 3 players');
{
  const players = makePlayers(3);
  const round = new Round(1, players, 0, { smallBlind: 10, bigBlind: 20 });

  assert(round.dealerIndex === 0, 'Dealer is p0');
  assert(round.smallBlindIndex === 1, 'SB is p1');
  assert(round.bigBlindIndex === 2, 'BB is p2');

  // Blinds deducted
  assert(players[1].chipStack === 990, 'SB chipStack deducted by 10');
  assert(players[2].chipStack === 980, 'BB chipStack deducted by 20');
  assert(players[0].chipStack === 1000, 'Dealer chipStack untouched');

  // Pot has blinds
  assert(round.potManager.getTotal() === 30, 'Pot has 30 (10+20)');

  // Each player has hole cards
  for (const p of players) {
    assert(p.hand && p.hand.length === 2, `${p.uuid} has 2 hole cards`);
  }

  // Current street is preflop
  assert(round.getCurrentStreet().name === 'preflop', 'Current street is preflop');

  // First to act is UTG (p0 in 3-player with dealer at 0)
  assert(round.getCurrentStreet().getCurrentPlayerUUID() === 'p0', 'UTG (p0) acts first');
}

// ─── Construction — heads-up ───

console.log('\n2. Construction — heads-up');
{
  const players = makePlayers(2);
  const round = new Round(1, players, 0, { smallBlind: 10, bigBlind: 20 });

  assert(round.smallBlindIndex === 0, 'Heads-up: dealer is SB');
  assert(round.bigBlindIndex === 1, 'Heads-up: other player is BB');
  assert(players[0].chipStack === 990, 'SB deducted');
  assert(players[1].chipStack === 980, 'BB deducted');
  assert(round.getCurrentStreet().getCurrentPlayerUUID() === 'p0', 'SB/dealer acts first preflop in heads-up');
}

// ─── Full hand: preflop all call/check → flop → turn → river → showdown ───

console.log('\n3. Full hand — all streets to showdown');
{
  const players = makePlayers(3);
  const round = new Round(1, players, 0, { smallBlind: 10, bigBlind: 20 });

  // Preflop: UTG (p0) calls, SB (p1) calls, BB (p2) checks
  let r = round.processAction('p0', { type: 'call' });
  assert(r.valid, 'p0 call valid');
  assert(players[0].chipStack === 980, 'p0 chipStack after call (1000 - 20)');

  r = round.processAction('p1', { type: 'call' });
  assert(r.valid, 'p1 call valid');
  assert(players[1].chipStack === 980, 'p1 chipStack after call (990 - 10)');

  r = round.processAction('p2', { type: 'check' });
  assert(r.valid, 'p2 check valid');
  assert(r.streetAdvanced, 'Street advanced to flop');

  // Verify pot and street
  assert(round.potManager.getTotal() === 60, 'Pot is 60 after preflop (20*3)');
  assert(round.getCurrentStreet().name === 'flop', 'Now on flop');
  assert(round.communityCards.length === 3, '3 community cards after flop');

  // Flop: all check
  // First to act post-flop: first active player left of dealer
  round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  r = round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  assert(r.streetAdvanced, 'Street advanced to turn');
  assert(round.getCurrentStreet().name === 'turn', 'Now on turn');
  assert(round.communityCards.length === 4, '4 community cards after turn');

  // Turn: all check
  round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  r = round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  assert(r.streetAdvanced, 'Street advanced to river');
  assert(round.getCurrentStreet().name === 'river', 'Now on river');
  assert(round.communityCards.length === 5, '5 community cards after river');

  // River: all check → showdown
  round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  r = round.processAction(round.getCurrentStreet().getCurrentPlayerUUID(), { type: 'check' });
  assert(r.roundComplete, 'Round complete after river');
  assert(round.isFinished, 'Round is finished');
  assert(round.result !== null, 'Result is set');
  assert(round.result.reason === 'showdown' || round.result.reason === 'showdown-tie', 'Ended via showdown');
  assert(round.result.pot === 60, 'Pot was 60');

  // Winner got the pot
  const totalChips = players.reduce((sum, p) => sum + p.chipStack, 0);
  assert(totalChips === 3000, 'Total chips conserved (3000)');
  console.log(`  → Winner: ${round.result.winnerUUID} with ${round.result.handName}`);
}

// ─── Immediate win: all fold ───

console.log('\n4. All fold — immediate win');
{
  const players = makePlayers(3);
  const round = new Round(1, players, 0, { smallBlind: 10, bigBlind: 20 });

  // p0 raises
  round.processAction('p0', { type: 'raise', amount: 100 });
  // p1 folds
  round.processAction('p1', { type: 'fold' });
  // p2 folds
  let r = round.processAction('p2', { type: 'fold' });

  assert(r.roundComplete, 'Round complete when all fold');
  assert(round.result.reason === 'last-standing', 'Won by last standing');
  assert(round.result.winnerUUID === 'p0', 'p0 wins');
  assert(round.result.handName === null, 'No hand shown (no showdown)');

  // p0 gets the pot
  assert(players[0].chipStack === 1000 - 100 + round.result.pot, 'p0 gets pot');
  const totalChips = players.reduce((sum, p) => sum + p.chipStack, 0);
  assert(totalChips === 3000, 'Total chips conserved');
}

// ─── Betting across streets ───

console.log('\n5. Betting across streets');
{
  const players = makePlayers(2);
  const round = new Round(1, players, 0, { smallBlind: 10, bigBlind: 20 });

  // Preflop: SB/dealer calls, BB checks
  round.processAction('p0', { type: 'call' });
  let r = round.processAction('p1', { type: 'check' });
  assert(r.streetAdvanced, 'Advanced to flop');

  // Flop: p1 bets, p0 calls
  const flopFirstPlayer = round.getCurrentStreet().getCurrentPlayerUUID();
  round.processAction(flopFirstPlayer, { type: 'bet', amount: 50 });
  const flopSecondPlayer = round.getCurrentStreet().getCurrentPlayerUUID();
  r = round.processAction(flopSecondPlayer, { type: 'call' });
  assert(r.streetAdvanced, 'Advanced to turn');
  assert(round.potManager.getTotal() === 140, 'Pot is 140 (40 preflop + 100 flop)');
}

// ─── Auto-fold ───

console.log('\n6. Auto-fold');
{
  const players = makePlayers(3);
  const round = new Round(1, players, 0, { smallBlind: 10, bigBlind: 20 });

  // It's p0's turn — auto-fold should work
  const r = round.autoFold('p0');
  assert(r.valid, 'Auto-fold valid when it is their turn');
  assert(players[0].status === 'folded', 'Player marked as folded');
}

// ─── Serialize ───

console.log('\n7. Serialize');
{
  const players = makePlayers(3);
  const round = new Round(1, players, 0, { smallBlind: 10, bigBlind: 20 });
  const s = round.serialize();

  assert(s.roundNumber === 1, 'Serialized roundNumber');
  assert(s.dealerIndex === 0, 'Serialized dealerIndex');
  assert(s.potTotal === 30, 'Serialized potTotal');
  assert(s.currentStreet.name === 'preflop', 'Serialized current street');
  assert(Array.isArray(s.pots), 'Serialized pots is array');
}

// ─── Round refuses actions after completion ───

console.log('\n8. No actions after round complete');
{
  const players = makePlayers(2);
  const round = new Round(1, players, 0, { smallBlind: 10, bigBlind: 20 });

  // Quick end: fold
  round.processAction('p0', { type: 'fold' });
  const r = round.processAction('p1', { type: 'check' });
  assert(!r.valid || round.isFinished, 'No more actions after round ends');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
