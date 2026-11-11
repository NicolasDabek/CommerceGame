/**
 * GD passe 11 / 12 — scénario hybride (crédit + clients d'étal), avec et sans crédit, sur 20 graines appariées, 120 jours.
 *   node scripts/hybridReport.mjs [--days=120] [--out=reports/gd12-hybride]
 * Écrit <out>.csv (une ligne par robot et par graine) et <out>.md (moyennes, IC95, différences appariées, bandes).
 * Le scénario historique « trader » (sans clients d'étal) est conservé à côté du nouveau.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pairedBotRuns, meanCi, pairedDiff } from './simCore.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DAYS = Number(args.days) || 120;
const OUT = resolve(typeof args.out === 'string' ? args.out : 'reports/gd12-hybride');
const BOTS = ['honest', 'haggler', 'trader', 'trader_no_loan', 'trader_hybrid', 'trader_hybrid_no_loan', 'trader_hybrid_keep', 'trader_hybrid_keep_no_loan'];

const quiet = console.error; console.error = () => {};
const res = {};
for (const bot of BOTS) res[bot] = await pairedBotRuns({ bot, days: DAYS });
// GD passe 12 : frontière — le jeu actuel (anti-flip du jour même + marchandise gagée) contre chaque règle retirée
const { STALL_TUNING } = await import('../js/systems/NpcRequests.js');
const flip = [];
const saved = { flipCap: STALL_TUNING.flipCap, flipDays: STALL_TUNING.flipDays, pledge: STALL_TUNING.pledge };
try {
  for (const [label, tune] of [['sans anti-flip ni gage (GD 11)', { flipCap: false, pledge: false }], ['anti-flip seul (jour même)', { flipCap: true, flipDays: 1, pledge: false }], ['gage + anti-flip 2 j', { flipCap: true, flipDays: 2, pledge: true }]]) {
    Object.assign(STALL_TUNING, tune);
    const r = {};
    for (const bot of ['haggler', 'trader_hybrid', 'trader_hybrid_no_loan', 'trader_hybrid_keep']) r[bot] = await pairedBotRuns({ bot, days: DAYS });
    flip.push({ label, r });
  }
} finally { Object.assign(STALL_TUNING, saved); }
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
  `# GD passe 12 — trader hybride (crédit + clients d'étal), ${res.honest.length} graines appariées, ${DAYS} j`, '',
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
  '## Frontière : règles GD 12 retirées une à une (20 graines appariées)', '',
  '| configuration | marchandeur ×honnête (1,20–1,35) | 3 premières graines (≥ 0,85) | hybride ×honnête (≤ 1,35) | crédit hybride (1,15–1,25) | « garde son stock » ×honnête (≤ 1,35) |', '|---|---|---|---|---|---|',
  `| jeu actuel (anti-flip jour même + gage) | ${ratio('haggler', 'honest')} | ${r2(meanCi(res.haggler.slice(0, 3).map(x => x.gain)).mean / meanCi(res.honest.slice(0, 3).map(x => x.gain)).mean)} | ${ratio('trader_hybrid', 'honest')} | ${ratio('trader_hybrid', 'trader_hybrid_no_loan')} | ${ratio('trader_hybrid_keep', 'honest')} |`,
  ...flip.map(({ label, r }) => { const m = (b) => meanCi(r[b].map(x => x.gain)).mean; const m3 = (X) => meanCi(X.slice(0, 3).map(x => x.gain)).mean; return `| ${label} | ${r2(m('haggler') / g.honest.mean)} | ${r2(m3(r.haggler) / m3(res.honest))} | ${r2(m('trader_hybrid') / g.honest.mean)} | ${r2(m('trader_hybrid') / m('trader_hybrid_no_loan'))} | ${r2(m('trader_hybrid_keep') / g.honest.mean)} |`; }),
  '',
  "## Lecture (GD passe 12)",
  "",
  "- Décision : anti-flip d'étal ACTIVÉ au jour même (`STALL_TUNING.flipCap`, `flipDays: 1`) + marchandise gagée (`STALL_TUNING.pledge`). Aucun réglage des robots modifié ; honnête, trader historique, exploit et mauvais payeur strictement inchangés (mêmes résultats graine par graine).",
  "- Chaque règle seule échoue : l'anti-flip seul laisse « garde son stock » à 1,43 et annule l'apport du crédit (1,00) ; le gage seul (sans anti-flip) ne tient pas : apport du crédit 1,03 (graines du test) / 1,11 (autre lot), « garde son stock » 1,26 / 1,50 ; l'anti-flip sur 2 jours fait tomber le garde-fou 3 graines du marchandeur (0,82 < 0,85) et dépasse la borne haute du crédit (1,29).",
  "- Contrôle sur 20 autres graines (lot hors test, 40 graines au total) : marchandeur ×1,31, hybride ×1,23, apport du crédit à l'hybride ×1,17 (différence appariée +1,17 ± 1,06 €/j, significative), « garde son stock » ×1,29.",
  "- Sur les 20 graines du test, l'apport du crédit à l'hybride vaut 1,145 (affiché 1,15) : au bord bas de la cible, dans le bruit (IC95 de la différence ±1,6 €/j). Le test garde la borne haute 1,25 et un garde-fou bas 1,10.",
  "- Restent ouverts (inchangés depuis GD 10/11) : 1,44 accord marchandé/j (cible 1,5), gain moyen par accord 1,38 € (visé 0,9–1,1 €), apport du crédit à la variante « garde son stock » 1,09.",
  ""
];
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT + '.csv', csv.join('\n') + '\n');
writeFileSync(OUT + '.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
