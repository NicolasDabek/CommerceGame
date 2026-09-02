import { run as runMatching } from './matching.test.js';
import { run as runEconomy } from './economy.test.js';
import { run as runInventory } from './inventory.test.js';
import { run as runAuction } from './auction.test.js';

const suites = [runMatching, runEconomy, runInventory, runAuction];
let failed = 0;

for (const suite of suites) {
  const result = await suite();
  failed += result.failed;
}

if (failed > 0) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}

console.log('\nTous les tests sont verts.');
