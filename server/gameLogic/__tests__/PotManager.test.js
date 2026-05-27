/**
 * PotManager.js — Test Suite
 * Run: node server/gameLogic/__tests__/PotManager.test.js
 */
import { PotManager } from '../PotManager.js';

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

console.log('=== PotManager Tests ===\n');

console.log('1. Initial state');
{
  const pm = new PotManager();
  assert(pm.getTotal() === 0, 'Total is 0 initially');
  assert(pm.pots.length === 1, 'Has one pot');
}

console.log('2. Contribute');
{
  const pm = new PotManager();
  pm.contribute('p1', 10);
  pm.contribute('p2', 20);
  pm.contribute('p1', 10);
  assert(pm.getTotal() === 40, 'Total is 40 after contributions');
  assert(pm.pots[0].eligiblePlayerUUIDs.has('p1'), 'p1 is eligible');
  assert(pm.pots[0].eligiblePlayerUUIDs.has('p2'), 'p2 is eligible');
}

console.log('3. Contribute zero — no effect');
{
  const pm = new PotManager();
  pm.contribute('p1', 0);
  assert(pm.getTotal() === 0, 'Zero contribution has no effect');
  assert(!pm.pots[0].eligiblePlayerUUIDs.has('p1'), 'p1 not added for zero');
}

console.log('4. Remove eligibility');
{
  const pm = new PotManager();
  pm.contribute('p1', 50);
  pm.contribute('p2', 50);
  pm.removeEligibility('p1');
  assert(pm.getTotal() === 100, 'Total unchanged after removing eligibility');
  assert(!pm.pots[0].eligiblePlayerUUIDs.has('p1'), 'p1 no longer eligible');
  assert(pm.pots[0].eligiblePlayerUUIDs.has('p2'), 'p2 still eligible');
}

console.log('5. Resolve pots');
{
  const pm = new PotManager();
  pm.contribute('p1', 50);
  pm.contribute('p2', 50);
  pm.contribute('p3', 50);
  pm.removeEligibility('p3'); // p3 folded

  const results = pm.resolvePots((uuids) => {
    // Simulate: p2 wins among eligible players
    return 'p2';
  });

  assert(results.length === 1, 'One pot resolved');
  assert(results[0].amount === 150, 'Pot amount is 150');
  assert(results[0].winnerUUID === 'p2', 'p2 wins the pot');
}

console.log('6. Serialize');
{
  const pm = new PotManager();
  pm.contribute('p1', 30);
  pm.contribute('p2', 30);
  const serialized = pm.serialize();
  assert(Array.isArray(serialized), 'Serialized is an array');
  assert(serialized[0].amount === 60, 'Serialized amount correct');
  assert(Array.isArray(serialized[0].eligiblePlayerUUIDs), 'Eligible UUIDs is array (not Set)');
  assert(serialized[0].eligiblePlayerUUIDs.includes('p1'), 'p1 in serialized');
}

console.log('7. Reset');
{
  const pm = new PotManager();
  pm.contribute('p1', 100);
  pm.reset();
  assert(pm.getTotal() === 0, 'Total is 0 after reset');
  assert(pm.pots[0].eligiblePlayerUUIDs.size === 0, 'No eligible players after reset');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
