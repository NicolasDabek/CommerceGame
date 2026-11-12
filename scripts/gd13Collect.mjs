/**
 * GD passe 13 — collecte d'un robot sur un lot de graines appariées (lot A : graines des tests ; lot B : 20 autres graines).
 *   node scripts/gd13Collect.mjs --bot=trader --batch=A [--no-charter] [--days=120] --out=/tmp/x.json
 * bot « none » : PNJ seuls. --no-charter : rang 5 désactivé (mesure de son apport).
 * Écrit un JSON (une entrée par graine) que scripts/gd13Report.mjs agrège.
 */
import { writeFileSync } from 'node:fs';
import { pairedBotRuns, runSimulation, PAIRED_SEED_BASES } from './simCore.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DAYS = Number(args.days) || 120;
const BATCH_B = Array.from({ length: 20 }, (_, i) => 1000 + (20 + i) * 7919);
const seeds = args.batch === 'B' ? BATCH_B : PAIRED_SEED_BASES;
const bot = args.bot || 'none';
if (args['no-charter']) {
  const R = await import('../js/core/Ranks.js');
  if (R.HOUSE_CHARTER) R.HOUSE_CHARTER.revenue = Infinity;
}
const quiet = console.error; console.error = () => {};
let out;
try {
  if (bot === 'none') {
    out = [];
    for (const seedBase of seeds) {
      const { summary, runs } = await runSimulation({ days: DAYS, seeds: 1, seedBase });
      const r = runs[0];
      out.push({ seed: seedBase, shortageLongest: summary.shortageLongest, procMax: r.reserveStats?.procureMaxDay || 0, subsidies: r.reserveStats?.subsidies || 0, moneyBand: summary.moneyBand });
    }
  } else {
    out = (await pairedBotRuns({ bot, days: DAYS, seedBases: seeds })).map(x => ({
      seed: x.seed, gain: x.gain, loans: x.loans, haggleDealsPerDay: x.haggleDealsPerDay, haggleGainPerDeal: x.haggleGainPerDeal,
      discounts: x.discounts, shortageLongest: x.shortageLongest, procMax: x.procMax, subsidies: x.subsidies, moneyBand: x.moneyBand,
      rankDays: x.rankDays, bigContracts: x.diag?.bigContracts || 0, bigFail: x.diag?.bigFail || 0
    }));
  }
} finally { console.error = quiet; }
writeFileSync(args.out, JSON.stringify({ bot, batch: args.batch || 'A', noCharter: !!args['no-charter'], days: DAYS, runs: out }));
console.log(`${bot} ${args.batch || 'A'}${args['no-charter'] ? ' sans charte' : ''} : ${out.length} graines → ${args.out}`);
