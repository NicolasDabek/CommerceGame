export function assert(cond, message) {
  if (!cond) throw new Error(message || 'Assertion failed');
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual'} — obtenu ${actual}, attendu ${expected}`);
  }
}

export async function runSuite(name, tests) {
  let failed = 0;
  let passed = 0;
  for (const [title, fn] of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name} — ${title}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name} — ${title}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }
  return { failed, passed };
}
