/**
 * Simulation headless de l'économie (PNJ seuls, sans navigateur, sans réseau).
 *
 *   npm run sim                         # 120 jours, 3 graines
 *   npm run sim -- --days=200 --seeds=5 --every=20
 *   npm run sim -- --json               # sortie JSON (pour comparer avant/après)
 *
 * Mesure jour par jour : niveau des prix (moyenne des prix / prix de base), masse monétaire
 * (joueur + PNJ + fonds bloqués + Comptoir municipal + caisse des contrats), stock PNJ,
 * offres actives, volume de transactions.
 */

import { runSimulation } from './simCore.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const DAYS = Number(args.days || 120);
const SEEDS = Number(args.seeds || 3);
const EVERY = Number(args.every || 20);
const JSON_OUT = !!args.json;
const QUIET = !!args.quiet;

// Les erreurs de sauvegarde (pas de vrai localStorage) n'ont pas d'intérêt ici
const realError = console.error;
console.error = (...a) => { if (!String(a[0] || '').includes('sauvegarde')) realError(...a); };

const { summary, runs } = await runSimulation({ days: DAYS, seeds: SEEDS });

if (JSON_OUT) {
  console.log(JSON.stringify({ summary, runs: runs.map(r => ({ seed: r.seed, reserveStats: r.reserveStats, series: r.series.filter(p => p.day % EVERY === 0 || p.day === 1) })) }, null, 2));
} else {
  if (!QUIET) {
    for (const r of runs) {
      console.log(`\n=== Graine ${r.seed} ===`);
      console.log('jour | prix moy. | min–max      | infl. | masse monét. | cash PNJ | Comptoir | stock | offres | tx/j');
      r.series.filter(p => p.day === 1 || p.day % EVERY === 0).forEach(p => {
        console.log(
          `${String(p.day).padStart(4)} | ${p.price.toFixed(3).padStart(9)} | ${p.priceMin.toFixed(2)}–${p.priceMax.toFixed(2).padEnd(6)} | ${p.inflation.toFixed(3)} | ${String(p.money).padStart(12)} | ${String(p.npcCash).padStart(8)} | ${String(p.treasury).padStart(8)} | ${String(p.stock).padStart(5)} | ${String(p.offers).padStart(6)} | ${String(p.tx).padStart(4)}`
        );
      });
      if (r.reserveStats) console.log('Comptoir :', r.reserveStats);
    }
  }
  console.log('\n=== Synthèse ===');
  console.log(summary);
}
