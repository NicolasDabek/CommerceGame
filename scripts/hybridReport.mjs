/**
 * GD passe 11 — scénario hybride (crédit + clients d'étal), avec et sans crédit, sur 20 graines appariées, 120 jours.
 *   node scripts/hybridReport.mjs [--days=120] [--out=reports/gd11-hybride]
 * Écrit <out>.csv (une ligne par robot et par graine) et <out>.md (moyennes, IC95, différences appariées, bandes).
 * Le scénario historique « trader » (sans clients d'étal) est conservé à côté du nouveau.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pairedBotRuns, meanCi, pairedDiff } from './simCore.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DAYS = Number(args.days) || 120;
const OUT = resolve(typeof args.out === 'string' ? args.out : 'reports/gd11-hybride');
const BOTS = ['honest', 'haggler', 'trader', 'trader_no_loan', 'trader_hybrid', 'trader_hybrid_no_loan', 'trader_hybrid_keep', 'trader_hybrid_keep_no_loan'];

const quiet = console.error; console.error = () => {};
const res = {};
for (const bot of BOTS) res[bot] = await pairedBotRuns({ bot, days: DAYS });
// Frontière anti-flip à l'étal (désactivé dans le jeu) : marchandeur avec le plafond, selon la réaction du robot
const { STALL_TUNING } = await import('../js/systems/NpcRequests.js');
const flip = [];
STALL_TUNING.flipCap = true;
try {
  for (const [label, params] of [['marge 1,05 sur revente rapide', { stallFlipMargin: 1.05 }], ['marge 1,08 (inchangée)', { stallFlipMargin: 1.08 }], ['ignore les reventes rapides', { stallFlipSkip: true }]]) {
    const r = await pairedBotRuns({ bot: 'haggler', days: DAYS, params });
    flip.push({ label, r });
  }
  for (const days of [2, 1]) {
    STALL_TUNING.flipDays = days;
    flip.push({ label: `[hybride « garde son stock »] plafond ${days} j`, r: await pairedBotRuns({ bot: 'trader_hybrid_keep', days: DAYS }) });
    if (days === 1) flip.push({ label: '[marchandeur] plafond 1 j (jour même)', r: await pairedBotRuns({ bot: 'haggler', days: DAYS }) });
  }
} finally { STALL_TUNING.flipCap = false; STALL_TUNING.flipDays = 2; }
console.error = quiet;

const r2 = (n) => Math.round(n * 100) / 100;
const csv = ['bot,seed,eur_per_day,early,late,loans,haggle_deals_per_day,haggle_sells_per_day,stall_sales_per_day,money_min,money_max,neg_npc_payments,npc_min_capital,stall_tickets,stall_margin_total'];
for (const bot of BOTS) for (const x of res[bot]) {
  const margin = x.stall.reduce((t, s) => t + (s.cost == null ? 0 : s.price - s.cost), 0);
  csv.push([bot, x.seed, x.gain, x.early, x.late, x.loans, x.haggleDealsPerDay, x.haggleSellsPerDay, x.stallSalesPerDay, x.moneyBand[0], x.moneyBand[1], x.negPayments, r2(x.minCapital), x.stall.length, r2(margin)].join(','));
}
const g = Object.fromEntries(BOTS.map(b => [b, meanCi(res[b].map(x => x.gain))]));
const band = (b) => [Math.min(...res[b].map(x => x.moneyBand[0])), Math.max(...res[b].map(x => x.moneyBand[1]))];
const ratio = (a, b) => r2(g[a].mean / g[b].mean);
const lines = [
  `# GD passe 11 — trader hybride (crédit + clients d'étal), ${res.honest.length} graines appariées, ${DAYS} j`, '',
  '| robot | €/j moyen | IC95 | masse min–max | paiements PNJ ≤ 0 | trésorerie PNJ min | ventes d\'étal/j |', '|---|---|---|---|---|---|---|',
  ...BOTS.map(b => `| ${b} | ${g[b].mean} | ±${g[b].ci95} | ${band(b).join('–')} | ${res[b].reduce((t, x) => t + x.negPayments, 0)} | ${r2(Math.min(...res[b].map(x => x.minCapital)))} | ${r2(res[b].reduce((t, x) => t + x.stallSalesPerDay, 0) / res[b].length)} |`),
  '', '## Ratios et différences appariées (par graine)', '',
  `- hybride / honnête : ${ratio('trader_hybrid', 'honest')} (cible ≤ 1,35) ; différence appariée ${pairedDiff(res.trader_hybrid, res.honest).mean} ± ${pairedDiff(res.trader_hybrid, res.honest).ci95} €/j`,
  `- crédit, hybride : ${ratio('trader_hybrid', 'trader_hybrid_no_loan')} (cible 1,15–1,25) ; différence appariée ${pairedDiff(res.trader_hybrid, res.trader_hybrid_no_loan).mean} ± ${pairedDiff(res.trader_hybrid, res.trader_hybrid_no_loan).ci95} €/j`,
  `- historique trader / honnête : ${ratio('trader', 'honest')} ; crédit historique : ${ratio('trader', 'trader_no_loan')}`,
  `- apport des clients d'étal au trader (hybride − historique) : ${pairedDiff(res.trader_hybrid, res.trader).mean} ± ${pairedDiff(res.trader_hybrid, res.trader).ci95} €/j`,
  `- hybride « garde son stock » / honnête : ${ratio('trader_hybrid_keep', 'honest')} ; crédit : ${ratio('trader_hybrid_keep', 'trader_hybrid_keep_no_loan')} ; différence appariée ${pairedDiff(res.trader_hybrid_keep, res.trader_hybrid_keep_no_loan).mean} ± ${pairedDiff(res.trader_hybrid_keep, res.trader_hybrid_keep_no_loan).ci95} €/j`,
  `- marchandeur / honnête : ${ratio('haggler', 'honest')} (cible 1,20–1,35) ; différence appariée ${pairedDiff(res.haggler, res.honest).mean} ± ${pairedDiff(res.haggler, res.honest).ci95} €/j`, '',
  '## Marchandeur : accords, tickets d\'étal', '',
  ...(() => {
    const h = res.haggler; const n = h.length;
    const tickets = h.flatMap(x => x.stall.map(s => s.price)).sort((a, b) => a - b);
    const q = (p) => tickets.length ? tickets[Math.min(tickets.length - 1, Math.floor(p * tickets.length))] : 0;
    const margin = h.reduce((t, x) => t + x.stall.reduce((u, s) => u + (s.cost == null ? 0 : s.price - s.cost), 0), 0) / n / DAYS;
    const gainDeal = h.reduce((t, x) => t + (x.haggleGainPerDeal || 0), 0) / n;
    return [
      `- accords marchandés/j : ${r2(h.reduce((t, x) => t + x.haggleDealsPerDay, 0) / n)} (cible ≥ 1,5) ; ventes marchandées/j : ${r2(h.reduce((t, x) => t + x.haggleSellsPerDay, 0) / n)} (cible ≥ 0,4)`,
      `- gain moyen par accord : ${r2(gainDeal)} € (visé 0,9–1,1 €)`,
      `- tickets d'étal (${tickets.length} ventes) : p10 ${q(0.1)} € · médiane ${q(0.5)} € · p90 ${q(0.9)} € · max ${tickets[tickets.length - 1] ?? 0} €`,
      `- marge totale des ventes d'étal : ${r2(margin)} €/j`
    ];
  })(), '',
  '## Frontière : plafond anti-flip à l\'étal (STALL_TUNING.flipCap, désactivé)', '',
  '| réaction du marchandeur | €/j (20 graines) | / honnête (cible ≥ 1,20) | / honnête, 3 premières graines (garde-fou ≥ 0,85) | ventes marchandées/j (≥ 0,4) | accords/j (≥ 1,3) |', '|---|---|---|---|---|---|',
  `| sans plafond (jeu actuel) | ${g.haggler.mean} | ${ratio('haggler', 'honest')} | ${r2(meanCi(res.haggler.slice(0, 3).map(x => x.gain)).mean / meanCi(res.honest.slice(0, 3).map(x => x.gain)).mean)} | ${r2(res.haggler.reduce((t, x) => t + x.haggleSellsPerDay, 0) / res.haggler.length)} | ${r2(res.haggler.reduce((t, x) => t + x.haggleDealsPerDay, 0) / res.haggler.length)} |`,
  ...flip.map(({ label, r }) => `| ${label} | ${meanCi(r.map(x => x.gain)).mean} | ${r2(meanCi(r.map(x => x.gain)).mean / g.honest.mean)} | ${r2(meanCi(r.slice(0, 3).map(x => x.gain)).mean / meanCi(res.honest.slice(0, 3).map(x => x.gain)).mean)} | ${r2(r.reduce((t, x) => t + x.haggleSellsPerDay, 0) / r.length)} | ${r2(r.reduce((t, x) => t + x.haggleDealsPerDay, 0) / r.length)} |`),
  ''
];
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT + '.csv', csv.join('\n') + '\n');
writeFileSync(OUT + '.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
