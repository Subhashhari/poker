import { PotManager } from '../PotManager.js';

let passed = 0, failed = 0;
function assert(c, m) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }

console.log('=== PotManager Tests ===\n');

// 1. Basic contributions
console.log('1. Basic contributions');
{
  const pm = new PotManager();
  pm.contribute('p1', 20);
  pm.contribute('p2', 20);
  assert(pm.getTotal() === 40, 'Total is 40');
  const pots = pm.buildPots();
  assert(pots.length === 1, 'One pot');
  assert(pots[0].amount === 40, 'Pot amount is 40');
  assert(pots[0].eligibleUUIDs.includes('p1'), 'p1 eligible');
  assert(pots[0].eligibleUUIDs.includes('p2'), 'p2 eligible');
}

// 2. Zero contribution ignored
console.log('\n2. Zero contribution');
{
  const pm = new PotManager();
  pm.contribute('p1', 0);
  assert(pm.getTotal() === 0, 'Zero is ignored');
}

// 3. Fold removes eligibility
console.log('\n3. Fold removes eligibility');
{
  const pm = new PotManager();
  pm.contribute('p1', 50);
  pm.contribute('p2', 50);
  pm.removeEligibility('p1');
  const pots = pm.buildPots();
  assert(pots[0].eligibleUUIDs.length === 1, 'Only 1 eligible');
  assert(pots[0].eligibleUUIDs[0] === 'p2', 'p2 is eligible');
}

// 4. Side pot — basic
console.log('\n4. Side pot — basic all-in');
{
  const pm = new PotManager();
  // p1 has 100 chips (all-in), p2 has 300, p3 has 300
  pm.contribute('p1', 100);
  pm.contribute('p2', 300);
  pm.contribute('p3', 300);

  const pots = pm.buildPots();
  assert(pots.length === 2, `Two pots (got ${pots.length})`);

  // Main pot: 100 * 3 = 300
  assert(pots[0].amount === 300, `Main pot 300 (got ${pots[0].amount})`);
  assert(pots[0].eligibleUUIDs.length === 3, 'All 3 eligible for main');

  // Side pot: (300-100) * 2 = 400
  assert(pots[1].amount === 400, `Side pot 400 (got ${pots[1].amount})`);
  assert(pots[1].eligibleUUIDs.length === 2, '2 eligible for side');
  assert(!pots[1].eligibleUUIDs.includes('p1'), 'p1 not eligible for side');
}

// 5. Side pot — 3 tiers
console.log('\n5. Side pot — 3 tiers');
{
  const pm = new PotManager();
  pm.contribute('p1', 50);   // all-in
  pm.contribute('p2', 150);  // all-in
  pm.contribute('p3', 300);
  pm.contribute('p4', 300);

  const pots = pm.buildPots();
  assert(pots.length === 3, `Three pots (got ${pots.length})`);

  // Pot 1: 50 * 4 = 200
  assert(pots[0].amount === 200, `Pot 1: 200 (got ${pots[0].amount})`);
  assert(pots[0].eligibleUUIDs.length === 4, '4 eligible');

  // Pot 2: (150-50) * 3 = 300
  assert(pots[1].amount === 300, `Pot 2: 300 (got ${pots[1].amount})`);
  assert(pots[1].eligibleUUIDs.length === 3, '3 eligible (no p1)');

  // Pot 3: (300-150) * 2 = 300
  assert(pots[2].amount === 300, `Pot 3: 300 (got ${pots[2].amount})`);
  assert(pots[2].eligibleUUIDs.length === 2, '2 eligible (no p1, p2)');

  // Total should be 800
  assert(pm.getTotal() === 800, `Total 800 (got ${pm.getTotal()})`);
}

// 6. Side pot with folds
console.log('\n6. Side pot with folds');
{
  const pm = new PotManager();
  pm.contribute('p1', 100);
  pm.contribute('p2', 100);
  pm.contribute('p3', 50);
  pm.removeEligibility('p3'); // p3 folded after putting in 50

  const pots = pm.buildPots();
  // p3 contributed 50 but folded. pot tiers: 50 (3 contributed, 2 eligible), 100 (2 contributed, 2 eligible)
  assert(pots[0].amount === 150, `Pot 1: 150 (got ${pots[0].amount})`);
  assert(pots[0].eligibleUUIDs.length === 2, 'p3 not eligible');
  assert(pots[1].amount === 100, `Pot 2: 100 (got ${pots[1].amount})`);
}

// 7. resolvePots
console.log('\n7. resolvePots');
{
  const pm = new PotManager();
  pm.contribute('p1', 100);
  pm.contribute('p2', 200);
  pm.contribute('p3', 200);

  const results = pm.resolvePots((eligibleUUIDs) => {
    // Simulate: p1 has the best hand
    if (eligibleUUIDs.includes('p1')) return { winnerUUIDs: ['p1'], isTie: false };
    return { winnerUUIDs: [eligibleUUIDs[0]], isTie: false };
  });

  assert(results.length === 2, 'Two pot results');
  assert(results[0].winnerUUIDs[0] === 'p1', 'p1 wins main pot');
  assert(results[0].amount === 300, `Main pot 300 (got ${results[0].amount})`);
  // Side pot: p1 not eligible, so p2 wins
  assert(results[1].winnerUUIDs[0] === 'p2', 'p2 wins side pot');
  assert(results[1].amount === 200, `Side pot 200 (got ${results[1].amount})`);
}

// 8. Serialize
console.log('\n8. Serialize');
{
  const pm = new PotManager();
  pm.contribute('p1', 50);
  pm.contribute('p2', 100);
  const ser = pm.serialize();
  assert(Array.isArray(ser), 'Serialized is array');
  assert(ser.length === 2, 'Two serialized pots');
}

// 9. Reset
console.log('\n9. Reset');
{
  const pm = new PotManager();
  pm.contribute('p1', 100);
  pm.reset();
  assert(pm.getTotal() === 0, 'Total 0 after reset');
  assert(pm.buildPots().length === 0, 'No pots after reset');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
