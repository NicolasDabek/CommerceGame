/**
 * GD passe 4 : `npm run test:stress` — rejoue tests/v7.test.js N fois (100 par défaut) et compte les échecs.
 * Options : --runs=N, --vary (graine différente à chaque passage, via TEST_SEED).
 */
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const runs = Number(args.runs) || 100;
const vary = !!args.vary;
const { run } = await import('../tests/v7.test.js');
const realLog = console.log, realErr = console.error;
const failures = [];
let checks = 0;
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
  if (vary) process.env.TEST_SEED = String(1234 + i * 7919);
  const lines = [];
  console.log = () => {};
  console.error = (...a) => lines.push(a.join(' '));
  let res;
  try { res = await run(); } finally { console.log = realLog; console.error = realErr; }
  checks += (res.passed || 0) + (res.failed || 0);
  if (res.failed > 0) failures.push({ run: i + 1, seed: process.env.TEST_SEED || 1234, lines });
}
console.log(`test:stress — tests/v7.test.js × ${runs}${vary ? ' (graines variées)' : ''} : ${runs - failures.length} verts, ${failures.length} en échec — ${checks} tests exécutés (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
failures.slice(0, 5).forEach(f => console.log(`  passage ${f.run} (graine ${f.seed}) :\n    ${f.lines.join('\n    ')}`));
process.exit(failures.length ? 1 : 0);
