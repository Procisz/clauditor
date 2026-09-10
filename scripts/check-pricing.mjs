import { PRICING, PRICING_DEFAULT, getPricing, getUnknownModels, entryCost, cacheWrite5m, cacheWrite1h } from '../src/core/config.js';

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) { console.log(`  ok  ${label}`); }
  else    { console.error(`FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

const EXPECTED = {
  'claude-fable-5-1':            [10.00, 50.00, 12.50, 0.25,    20],
  'claude-mythos-5-1':           [10.00, 50.00, 12.50, 0.25,    20],
  'claude-fable-5':              [10.00, 50.00, 12.50, 1.00,    20],
  'claude-mythos-5':             [10.00, 50.00, 12.50, 1.00,    20],
  'claude-opus-5':               [ 5.00, 25.00,  6.25, 0.50,    10],
  'claude-opus-4-8':             [ 5.00, 25.00,  6.25, 0.50,    10],
  'claude-opus-4-8[1m]':         [ 5.00, 25.00,  6.25, 0.50,    10],
  'claude-opus-4-7':             [ 5.00, 25.00,  6.25, 0.50,    10],
  'claude-opus-4-6':             [ 5.00, 25.00,  6.25, 0.50,    10],
  'claude-opus-4-5-20251101':    [ 5.00, 25.00,  6.25, 0.50,    10],
  'claude-opus-4-1':             [15.00, 75.00, 18.75, 1.50,    30],
  'claude-opus-4-1-20250805':    [15.00, 75.00, 18.75, 1.50,    30],
  'claude-opus-4':               [15.00, 75.00, 18.75, 1.50,    30],
  'claude-opus-4-20250514':      [15.00, 75.00, 18.75, 1.50,    30],
  'claude-3-opus-20240229':      [15.00, 75.00, 18.75, 1.50,    30],
  'claude-sonnet-5':             [ 2.00, 10.00,  2.50, 0.20,     4],
  'claude-sonnet-4-6':           [ 3.00, 15.00,  3.75, 0.30,     6],
  'claude-sonnet-4-5-20250929':  [ 3.00, 15.00,  3.75, 0.30,     6],
  'claude-sonnet-4-20250514':    [ 3.00, 15.00,  3.75, 0.30,     6],
  'claude-3-7-sonnet-20250219':  [ 3.00, 15.00,  3.75, 0.30,     6],
  'claude-3-5-sonnet-20241022':  [ 3.00, 15.00,  3.75, 0.30,     6],
  'claude-3-5-sonnet-20240620':  [ 3.00, 15.00,  3.75, 0.30,     6],
  'claude-3-sonnet-20240229':    [ 3.00, 15.00,  3.75, 0.30,     6],
  'claude-haiku-4-5-20251001':   [ 1.00,  5.00,  1.25, 0.10,     2],
  'claude-3-5-haiku-20241022':   [ 0.80,  4.00,  1.00, 0.08,   1.6],
  'claude-3-haiku-20240307':     [ 0.25,  1.25,  0.3125, 0.025,   0.5],
};

console.log('Model resolution:');
for (const [model, [input, output, cacheWrite, cacheRead, cacheWrite1h]] of Object.entries(EXPECTED)) {
  const p = getPricing(model);
  const ok = p !== PRICING_DEFAULT && !p.approx
    && p.input === input && p.output === output
    && p.cacheWrite === cacheWrite && p.cacheWrite1h === cacheWrite1h && p.cacheRead === cacheRead;
  check(model, ok, p === PRICING_DEFAULT ? 'fell back to PRICING_DEFAULT'
    : `resolved to '${p.id}'${p.approx ? ' (approximate)' : ''} $${p.input}/$${p.output}/5m $${p.cacheWrite}/1h $${p.cacheWrite1h}/read $${p.cacheRead}`);
}

console.log('Cache rate multipliers (5m write = 1.25 × input; 1h write = 2 × input; read = 0.1 × input, 0.025 × on the 5.1 generation):');
for (const p of PRICING) {
  const readRatio = p.id.endsWith('-5-1') ? 0.025 : 0.1;
  const okW   = Math.abs(p.cacheWrite - p.input * 1.25) < 1e-9;
  const okW1h = Math.abs(p.cacheWrite1h - p.input * 2) < 1e-9;
  const okR   = Math.abs(p.cacheRead - p.input * readRatio) < 1e-9;
  check(`'${p.id}'`, okW && okW1h && okR,
    `5m ${p.cacheWrite} vs ${p.input * 1.25}, 1h ${p.cacheWrite1h} vs ${p.input * 2}, read ${p.cacheRead} vs ${p.input * readRatio}`);
}

console.log('Pattern anchoring (a version pattern must not swallow a longer version):');
const ANCHORING = {
  'claude-opus-4-10':  'opus-4-1',
  'claude-opus-4-11':  'opus-4-1',
  'claude-fable-5-10': 'fable-5-1',
  'claude-sonnet-4-60': 'sonnet-4-6',
};
for (const [model, mustNotMatch] of Object.entries(ANCHORING)) {
  const p = getPricing(model);
  check(`${model} does not resolve to '${mustNotMatch}'`, p.id !== mustNotMatch, `resolved to '${p.id}'`);
}

console.log('Row ordering (every exact row must precede the family fallbacks):');
const firstFamily = PRICING.findIndex(p => p.approx);
check('no exact row sits below a family row',
  firstFamily === -1 || PRICING.slice(firstFamily).every(p => p.approx),
  'a family fallback shadows an exact model row');

console.log('Unpriced-model detection:');
const MUST_FLAG = ['claude-next-9', 'claude-opus-6', 'claude-sonnet-6', 'claude-haiku-5', 'claude-fable-6', 'claude-mythos-preview'];
for (const model of MUST_FLAG) {
  check(`'${model}' is flagged`, getUnknownModels([model]).length === 1, `getPricing → '${getPricing(model).id || 'default'}'`);
}
check("'unknown' placeholder is not flagged", getUnknownModels(['unknown']).length === 0);
check("'<synthetic>' placeholder is not flagged", getUnknownModels(['<synthetic>']).length === 0);
check('a fully priced model is not flagged', getUnknownModels(['claude-opus-5', 'claude-fable-5-1']).length === 0);

console.log('Cache-write TTL split (1h billed at 2 × input, 5m at 1.25 ×):');
const M = 1_000_000;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const legacy = { model: 'claude-opus-5', input: 0, output: 0, cacheWrite: M, cacheRead: 0 };
check('an archived entry with no split prices entirely at the 5m rate', near(entryCost(legacy), 6.25),
  `got ${entryCost(legacy)}`);
check('an all-1h entry prices at 2 × input', near(entryCost({ ...legacy, cacheWrite1h: M }), 10),
  `got ${entryCost({ ...legacy, cacheWrite1h: M })}`);
check('a half-and-half entry prices at the blended rate', near(entryCost({ ...legacy, cacheWrite1h: M / 2 }), 8.125),
  `got ${entryCost({ ...legacy, cacheWrite1h: M / 2 })}`);
check('cacheWrite1h is clamped to the total, never exceeding it',
  cacheWrite1h({ cacheWrite: 10, cacheWrite1h: 999 }) === 10 && cacheWrite5m({ cacheWrite: 10, cacheWrite1h: 999 }) === 0);
check('the split always reconstructs the total',
  [[0, 0], [M, 0], [M, M], [M, M / 3], [5, 999]].every(([w, h]) => {
    const e = { cacheWrite: w, cacheWrite1h: h };
    return cacheWrite5m(e) + cacheWrite1h(e) === w && cacheWrite5m(e) >= 0;
  }));

console.log('Non-Anthropic models cost nothing:');
check("'gpt-oss:20b' is free", entryCost({ model: 'gpt-oss:20b', input: M, output: M, cacheWrite: M, cacheWrite1h: M, cacheRead: M }) === 0);
check("'gpt-oss:20b' is not reported as unpriced", getUnknownModels(['gpt-oss:20b']).length === 0);
check("an unrecognised CLAUDE model still costs money", entryCost({ model: 'claude-next-9', input: M }) > 0);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll pricing checks passed.');
