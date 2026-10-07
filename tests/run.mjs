import { run as runMatching } from './matching.test.js';
import { run as runEconomy } from './economy.test.js';
import { run as runInventory } from './inventory.test.js';
import { run as runAuction } from './auction.test.js';
import { run as runInsight } from './insight.test.js';
import { run as runNpc } from './npc.test.js';
import { run as runReserve } from './reserve.test.js';
import { run as runStability } from './stability.test.js';
import { run as runSupply } from './supply.test.js';
import { run as runProfessions } from './professions.test.js';
import { run as runJobs } from './jobs.test.js';
import { run as runTrading } from './trading.test.js';

const suites = [runMatching, runEconomy, runInventory, runAuction, runInsight, runNpc, runReserve, runSupply, runProfessions, runJobs, runTrading, runStability];
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
