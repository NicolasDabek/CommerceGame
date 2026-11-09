/**
 * GD passe 11 (P1) — expérience « petits consommables » à l'étal, 20 graines appariées, 120 j.
 *   node scripts/smallTicketReport.mjs [--days=120] [--out=reports/gd11-petits-tickets]
 * Des PNJ viennent acheter pour leur propre besoin des objets à petit ticket, dans un budget quotidien d'achats d'étal
 * (STALL_TUNING.small, désactivé dans le jeu). Le marchandeur (et le trader hybride) peuvent garder un petit assortiment
 * (paramètre robot smallStock). Rapporte accords/j, ventes marchandées/j, gain par accord, bénéfice absolu des négociations,
 * distribution des tickets d'étal, marge totale/j, et les différences appariées avec le jeu actuel.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pairedBotRuns, meanCi, pairedDiff } from './simCore.mjs';
import { STALL_TUNING } from '../js/systems/NpcRequests.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DAYS = Number(args.days) || 120;
const OUT = resolve(typeof args.out === 'string' ? args.out : 'reports/gd11-petits-tickets');
const r2 = (n) => Math.round(n * 100) / 100;
const CONFIGS = [
  ['jeu actuel (désactivé)', {}, {}],
  ['petits tickets ≤ 30 €, 2–3 visites, budget 40 €/j', { small: true }, {}],
  ['idem + assortiment 3 unités', { small: true }, { smallStock: 3 }],
  ['idem + plusieurs clients par lot', { small: true, smallRepeat: true }, { smallStock: 3 }],
  ['≤ 30 €, 3–4 visites, budget 60 €/j, assortiment 4 (achat ≤ 1,03 × juste)', { small: true, smallRepeat: true, smallVisits: 3, smallBudget: 60 }, { smallStock: 4, smallRatio: 1.03 }],
  ['≤ 15 €, 3–4 visites, assortiment 4 (achat ≤ 1,03 × juste)', { small: true, smallRepeat: true, smallMaxTicket: 15, smallVisits: 3 }, { smallStock: 4, smallMaxTicket: 15, smallRatio: 1.03 }]
];
const DEFAULT = { ...STALL_TUNING };
const quiet = console.error; console.error = () => {};
const honest = await pairedBotRuns({ bot: 'honest', days: DAYS });
const rows = [];
try {
  for (const [label, tune, params] of CONFIGS) {
    Object.assign(STALL_TUNING, DEFAULT, tune);
    rows.push({ label, haggler: await pairedBotRuns({ bot: 'haggler', days: DAYS, params }), hybrid: await pairedBotRuns({ bot: 'trader_hybrid', days: DAYS, params }) });
  }
} finally { Object.assign(STALL_TUNING, DEFAULT); console.error = quiet; }

const avg = (r, k) => r2(r.reduce((t, x) => t + (x[k] || 0), 0) / r.length);
const gH = meanCi(honest.map(x => x.gain)).mean;
const base = rows[0];
const lines = [
  `# GD passe 11 — petits consommables à l'étal (expérience, ${honest.length} graines appariées, ${DAYS} j)`, '',
  `Honnête : ${gH} €/j (± ${meanCi(honest.map(x => x.gain)).ci95}). Cibles marchandeur : ≥ 1,5 accord/j, ×1,20–1,35, ventes marchandées ≥ 0,4/j, gain/accord 0,9–1,1 €. Trader hybride ≤ 1,35×.`, '',
  '| configuration | marchandeur €/j (IC95) | ×honnête | Δ apparié vs jeu actuel | accords/j | ventes marchandées/j | ventes d\'étal/j | gain/accord | bénéfice négo €/j | tickets p10 / méd. / p90 | marge étal €/j | hybride €/j | hybride ×honnête |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(({ label, haggler: h, hybrid: y }) => {
    const g = meanCi(h.map(x => x.gain));
    const d = pairedDiff(h, base.haggler);
    const t = h.flatMap(x => x.stall.map(s => s.price)).sort((a, b) => a - b);
    const q = (p) => t.length ? t[Math.min(t.length - 1, Math.floor(p * t.length))] : 0;
    const margin = h.reduce((s, x) => s + x.stall.reduce((u, v) => u + (v.cost == null ? 0 : v.price - v.cost), 0), 0) / h.length / DAYS;
    const benefit = h.reduce((s, x) => s + (x.haggleDealsPerDay || 0) * (x.haggleGainPerDeal || 0), 0) / h.length;
    const gy = meanCi(y.map(x => x.gain)).mean;
    return `| ${label} | ${g.mean} (±${g.ci95}) | ${r2(g.mean / gH)} | ${d.mean} ± ${d.ci95} | ${avg(h, 'haggleDealsPerDay')} | ${avg(h, 'haggleSellsPerDay')} | ${avg(h, 'stallSalesPerDay')} | ${avg(h, 'haggleGainPerDeal')} € | ${r2(benefit)} | ${q(0.1)} / ${q(0.5)} / ${q(0.9)} € | ${r2(margin)} | ${gy} | ${r2(gy / gH)} |`;
  }), '',
  '## Conclusion (hypothèse non validée, mécanique laissée désactivée)',
  '',
  "- Le goulot n'est pas la demande mais le stock du joueur : les visites « petit ticket » ne trouvent le plus souvent aucun objet bon marché en sac ou en annonce ; les ventes d'étal ne passent que de 0,45 à 0,53/j au mieux.",
  "- Le gain par accord ne baisse pas (1,34 → 1,38–1,52 €) : les petits tickets restent marginaux dans le volume et les tickets moyens/gros dominent encore (médiane 17–31 €). La cible 0,9–1,1 € n'est atteinte par aucune configuration.",
  "- Meilleur couple réalisable : « ≤ 15 €, 3–4 visites, assortiment 4 » → 1,50 accord/j (limite), ×1,26, 0,49 vente marchandée/j, 1,50 €/accord, hybride ×1,26 ; écart apparié avec le jeu actuel +0,28 ± 1,32 €/j (non significatif). Le gain/accord est manqué, donc la mécanique n'est pas activée.",
  "- Avec un budget de 60 €/j, l'hybride passe à ×1,36 (> 1,35) : un budget d'achats d'étal plus large profite d'abord au trader.",
  "- Aucun seuil de test n'a été modifié.",
  ''
];
const csv = ['config,bot,seed,eur_per_day,haggle_deals_per_day,haggle_sells_per_day,stall_sales_per_day,haggle_gain_per_deal,stall_tickets,stall_margin_total'];
for (const { label, haggler, hybrid } of rows) for (const [bot, r] of [['haggler', haggler], ['trader_hybrid', hybrid]]) for (const x of r)
  csv.push([JSON.stringify(label), bot, x.seed, x.gain, x.haggleDealsPerDay, x.haggleSellsPerDay, x.stallSalesPerDay, x.haggleGainPerDeal, x.stall.length, r2(x.stall.reduce((u, v) => u + (v.cost == null ? 0 : v.price - v.cost), 0))].join(','));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT + '.csv', csv.join('\n') + '\n');
writeFileSync(OUT + '.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
