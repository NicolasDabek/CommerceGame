/**
 * GD passe 13 — rapport avant / après sur les lots A (20 graines des tests) et B (20 autres graines), 120 jours.
 *   1) collecte : node scripts/gd13Collect.mjs --bot=… --batch=A|B [--no-charter] --out=<dir>/<before|after|nocharter>-<bot>-<A|B>.json
 *      (« before » : même collecte lancée sur une copie de travail à v1.0.0)
 *   2) node scripts/gd13Report.mjs --data=<dir> [--out=reports/gd13]
 * Écrit <out>.csv (une ligne par version, robot, lot et graine) et <out>.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { meanCi } from './simCore.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DIR = resolve(args.data || '/tmp/gd13data');
const OUT = resolve(typeof args.out === 'string' ? args.out : 'reports/gd13');
const BOTS = ['none', 'honest', 'haggler', 'trader', 'trader_no_loan', 'trader_hybrid', 'trader_hybrid_no_loan', 'trader_hybrid_keep', 'trader_hybrid_keep_no_loan', 'exploit', 'defaulter'];
const LABEL = { none: 'PNJ seuls', honest: 'honnête', haggler: 'marchandeur', trader: 'trader (historique)', trader_no_loan: 'trader sans prêt', trader_hybrid: 'hybride', trader_hybrid_no_loan: 'hybride sans prêt', trader_hybrid_keep: '« garde son stock »', trader_hybrid_keep_no_loan: '« garde » sans prêt', exploit: 'exploit', defaulter: 'mauvais payeur' };
const r2 = (n) => Math.round(n * 100) / 100;
const fr = (n, d = 2) => (n == null || Number.isNaN(n) ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace('.', ','));

const load = (ver, bot, batch) => { const f = join(DIR, `${ver}-${bot}-${batch}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).runs : null; };
const D = {};
for (const ver of ['before', 'after', 'nocharter']) { D[ver] = {}; for (const bot of BOTS) { D[ver][bot] = {}; for (const b of ['A', 'B']) D[ver][bot][b] = load(ver, bot, b); } }
const runs = (ver, bot, batch) => (batch === 'AB' ? [...(D[ver][bot].A || []), ...(D[ver][bot].B || [])] : D[ver][bot][batch] || []);
const mean = (ver, bot, batch) => meanCi(runs(ver, bot, batch).map(x => x.gain));
const ratio = (ver, a, b, batch) => r2(mean(ver, a, batch).mean / mean(ver, b, batch).mean);
const paired = (va, a, vb, b, batch) => { const A = runs(va, a, batch), B = runs(vb, b, batch); return meanCi(A.map((x, i) => x.gain - B[i].gain)); };
const median = (xs) => { const s = [...xs].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
const rankDayMed = (ver, bot, batch, k) => { const d = runs(ver, bot, batch).map(x => x.rankDays?.[k] ?? Infinity).sort((p, q) => p - q); const m = d[Math.floor((d.length - 1) / 2)]; return Number.isFinite(m) ? m : null; };
const reached = (ver, bot, batch, k) => runs(ver, bot, batch).filter(x => x.rankDays?.[k] != null).length;
const disc = (ver, bot, batch) => { const d = runs(ver, bot, batch).flatMap(x => x.discounts || []); return { n: d.length, mean: d.length ? 100 * d.reduce((t, x) => t + x, 0) / d.length : null, median: d.length ? 100 * median(d) : null }; };
const avg = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);

// CSV
const csv = ['version,bot,batch,seed,eur_per_day,loans,haggle_deals_per_day,haggle_gain_per_deal,haggle_discount_mean_pct,haggle_discount_median_pct,shortage_longest,public_orders_max_day,subsidies,money_min,money_max,rank2_day,rank3_day,rank4_day,rank5_day,big_contracts,big_contract_fail'];
for (const ver of ['before', 'after', 'nocharter']) for (const bot of BOTS) for (const b of ['A', 'B']) for (const x of D[ver][bot][b] || []) {
  const d = x.discounts || [];
  csv.push([ver, bot, b, x.seed, x.gain ?? '', x.loans ?? '', x.haggleDealsPerDay ?? '', x.haggleGainPerDeal ?? '', d.length ? r2(100 * avg(d)) : '', d.length ? r2(100 * median(d)) : '',
    x.shortageLongest, x.procMax, r2(x.subsidies || 0), x.moneyBand?.[0], x.moneyBand?.[1], ...[2, 3, 4, 5].map(k => x.rankDays?.[k] ?? ''), x.bigContracts ?? '', x.bigFail ?? ''].join(','));
}
writeFileSync(`${OUT}.csv`, csv.join('\n') + '\n');

const L = [];
L.push('# GD passe 13 — pénuries, prêt gagé, rabais marchandé, rang 5 « Maison reconnue »', '');
L.push('Avant = v1.0.0 (82621a7), après = passe GD 13. 120 jours. Lot A = les 20 graines appariées des tests (`PAIRED_SEED_BASES`),',
  'lot B = 20 autres graines (1000 + (20+i)·7919). Mêmes graines avant et après, robot par robot (différences appariées).',
  'Données : `reports/gd13.csv` (une ligne par version, robot, lot et graine) ; scripts `scripts/gd13Collect.mjs` et `scripts/gd13Report.mjs`.', '');

L.push('## Gains (€/jour) et ratios à l\'honnête', '', '| robot | avant A | avant B | après A | après B | après A+B (IC95) | ratio avant A | ratio avant B | ratio avant A+B | ratio après A | ratio après B | ratio après A+B | après − avant (A+B, apparié) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const bot of BOTS.filter(b => b !== 'none')) {
  const ab = mean('after', bot, 'AB');
  const dv = paired('after', bot, 'before', bot, 'AB');
  L.push(`| ${LABEL[bot]} | ${fr(mean('before', bot, 'A').mean)} | ${fr(mean('before', bot, 'B').mean)} | ${fr(mean('after', bot, 'A').mean)} | ${fr(mean('after', bot, 'B').mean)} | ${fr(ab.mean)} ±${fr(ab.ci95)} | ×${fr(ratio('before', bot, 'honest', 'A'))} | ×${fr(ratio('before', bot, 'honest', 'B'))} | ×${fr(ratio('before', bot, 'honest', 'AB'))} | ×${fr(ratio('after', bot, 'honest', 'A'))} | ×${fr(ratio('after', bot, 'honest', 'B'))} | ×${fr(ratio('after', bot, 'honest', 'AB'))} | ${dv.mean >= 0 ? '+' : ''}${fr(dv.mean)} ± ${fr(dv.ci95)} |`);
}
L.push('', 'Les bandes de ratios (hybride et « garde » ≤ 1,35, trader 1,29 ± 0,03, marchandeur 1,20–1,35) sont calibrées et testées sur le lot A ; le lot B dépassait déjà ces bandes en v1.0.0 (voir « ratio avant B »).', '');

L.push('## 1. Pénuries (plus longue rupture, jours) — cible ≤ 12 j pour tous les robots', '', '| robot | avant A | avant B | après A | après B | commandes publiques/j max (après) | subventions max (après, €) | masse monétaire (après) |', '|---|---|---|---|---|---|---|---|');
for (const bot of BOTS) {
  const mx = (ver, b) => { const v = runs(ver, bot, b); return v.length ? Math.max(...v.map(x => x.shortageLongest)) : null; };
  const all = runs('after', bot, 'AB');
  L.push(`| ${LABEL[bot]} | ${mx('before', 'A') ?? '—'} | ${mx('before', 'B') ?? '—'} | ${mx('after', 'A') ?? '—'} | ${mx('after', 'B') ?? '—'} | ${all.length ? Math.max(...all.map(x => x.procMax)) : '—'} | ${all.length ? Math.round(Math.max(...all.map(x => x.subsidies || 0))) : '—'} | ${all.length ? `${fr(Math.min(...all.map(x => x.moneyBand[0])), 3)}–${fr(Math.max(...all.map(x => x.moneyBand[1])), 3)}` : '—'} |`);
}
L.push('');

L.push('## 2. Apport du crédit (avec / sans prêt, mêmes graines)', '', '| scénario | lot | avant ratio | après ratio | après différence appariée (€/j, IC95) | significatif |', '|---|---|---|---|---|---|');
for (const [a, b, name] of [['trader_hybrid', 'trader_hybrid_no_loan', 'hybride'], ['trader_hybrid_keep', 'trader_hybrid_keep_no_loan', '« garde son stock »'], ['trader', 'trader_no_loan', 'trader historique']]) {
  for (const batch of ['A', 'B', 'AB']) {
    const d = paired('after', a, 'after', b, batch);
    L.push(`| ${name} | ${batch === 'AB' ? 'A+B (40)' : batch} | ${fr(ratio('before', a, b, batch))} | ${fr(ratio('after', a, b, batch))} | ${d.mean >= 0 ? '+' : ''}${fr(d.mean)} ± ${fr(d.ci95)} | ${d.mean - d.ci95 > 0 ? 'oui' : 'non'} |`);
  }
}
L.push('');

L.push('## 3. Marchandage — rabais en % du prix de référence (cible : médiane 3–6 %, ≥ 1,5 accord/jour)', '', '| robot | version | accords/j (A+B) | gain €/accord (A+B) | rabais moyen | rabais médian | accords mesurés |', '|---|---|---|---|---|---|---|');
for (const bot of ['haggler', 'trader_hybrid', 'trader_hybrid_keep', 'trader']) for (const ver of ['before', 'after']) {
  const v = runs(ver, bot, 'AB'); const ds = disc(ver, bot, 'AB');
  L.push(`| ${LABEL[bot]} | ${ver === 'before' ? 'avant' : 'après'} | ${fr(avg(v.map(x => x.haggleDealsPerDay)))} | ${fr(avg(v.map(x => x.haggleGainPerDeal)))} | ${fr(ds.mean, 1)} % | ${fr(ds.median, 1)} % | ${ds.n} |`);
}
L.push('');

L.push('## 4. Jours de rang (médiane sur 40 graines ; « — » : moins de la moitié des graines) et rang 5', '', '| robot | version | rang 2 | rang 3 | rang 4 | rang 5 | rang 4 atteint | rang 5 atteint |', '|---|---|---|---|---|---|---|---|');
for (const bot of ['honest', 'haggler', 'trader', 'trader_hybrid', 'trader_hybrid_keep', 'exploit', 'defaulter']) for (const ver of ['before', 'after']) {
  const n = runs(ver, bot, 'AB').length;
  L.push(`| ${LABEL[bot]} | ${ver === 'before' ? 'avant' : 'après'} | ${[2, 3, 4, 5].map(k => rankDayMed(ver, bot, 'AB', k) ?? '—').join(' | ')} | ${reached(ver, bot, 'AB', 4)}/${n} | ${reached(ver, bot, 'AB', 5)}/${n} |`);
}
L.push('', '### Apport du rang 5 (même code, charte désactivée, mêmes graines)', '', '| robot | rang 5 atteint (A+B) | avec charte €/j | sans charte €/j | différence appariée (€/j, IC95) |', '|---|---|---|---|---|');
for (const bot of ['honest', 'haggler', 'trader', 'trader_hybrid', 'trader_hybrid_keep']) {
  if (!runs('nocharter', bot, 'AB').length) continue;
  const d = paired('after', bot, 'nocharter', bot, 'AB');
  L.push(`| ${LABEL[bot]} | ${reached('after', bot, 'AB', 5)}/${runs('after', bot, 'AB').length} | ${fr(mean('after', bot, 'AB').mean)} | ${fr(mean('nocharter', bot, 'AB').mean)} | ${d.mean >= 0 ? '+' : ''}${fr(d.mean)} ± ${fr(d.ci95)} |`);
}
L.push('', `Ratios sans charte (A+B) : hybride ×${fr(ratio('nocharter', 'trader_hybrid', 'honest', 'AB'))}, « garde » ×${fr(ratio('nocharter', 'trader_hybrid_keep', 'honest', 'AB'))}, trader ×${fr(ratio('nocharter', 'trader', 'honest', 'AB'))}, marchandeur ×${fr(ratio('nocharter', 'haggler', 'honest', 'AB'))}.`, '');
if (args.notes && existsSync(args.notes)) L.push(readFileSync(args.notes, 'utf8'));
writeFileSync(`${OUT}.md`, L.join('\n') + '\n');
console.log(L.join('\n'));
