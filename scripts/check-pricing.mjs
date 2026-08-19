import { PRICING, PRICING_DEFAULT, getPricing, getUnknownModels } from '../src/core/config.js';

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) { console.log(`  ok  ${label}`); }
  else    { console.error(`FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

const EXPECTED = {
  'claude-fable-5':              [10.00, 50.00],
  'claude-mythos-5':             [10.00, 50.00],
  'claude-opus-5':               [ 5.00, 25.00],
  'claude-opus-4-8':             [ 5.00, 25.00],
  'claude-opus-4-7':             [ 5.00, 25.00],
  'claude-opus-4-6':             [ 5.00, 25.00],
  'claude-opus-4-5-20251101':    [ 5.00, 25.00],
  'claude-opus-4-1-20250805':    [15.00, 75.00],
  'claude-opus-4-20250514':      [15.00, 75.00],
  'claude-3-opus-20240229':      [15.00, 75.00],
  'claude-sonnet-5':             [ 2.00, 10.00],
  'claude-sonnet-4-6':           [ 3.00, 15.00],
  'claude-sonnet-4-5-20250929':  [ 3.00, 15.00],
  'claude-sonnet-4-20250514':    [ 3.00, 15.00],
  'claude-3-5-sonnet-20241022':  [ 3.00, 15.00],
  'claude-haiku-4-5-20251001':   [ 1.00,  5.00],
  'claude-3-5-haiku-20241022':   [ 0.80,  4.00],
};

console.log('Model resolution:');
for (const [model, [input, output]] of Object.entries(EXPECTED)) {
  const p = getPricing(model);
  check(model, p !== PRICING_DEFAULT && p.input === input && p.output === output,
    p === PRICING_DEFAULT ? 'fell back to PRICING_DEFAULT' : `resolved to $${p.input}/$${p.output}`);
}

console.log('Cache rate multipliers (write = 1.25 × input, read = 0.1 × input):');
for (const p of PRICING) {
  const okW = Math.abs(p.cacheWrite - p.input * 1.25) < 1e-9;
  const okR = Math.abs(p.cacheRead - p.input * 0.1) < 1e-9;
  check(`'${p.match}'`, okW && okR, `write ${p.cacheWrite} vs ${p.input * 1.25}, read ${p.cacheRead} vs ${p.input * 0.1}`);
}

console.log('Unknown-model detection:');
check("hypothetical 'claude-next-9' is flagged",
  getUnknownModels(['claude-next-9', 'claude-opus-5']).join(',') === 'claude-next-9');
check("'unknown' placeholder is not flagged", getUnknownModels(['unknown']).length === 0);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll pricing checks passed.');
