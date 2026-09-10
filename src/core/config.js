export const CONFIG_DEFAULT_MARKUP = 1;

const CACHE_WRITE_RATIO = 1.25;
const CACHE_WRITE_1H_RATIO = 2;
const CACHE_READ_RATIO = 0.1;
const CACHE_READ_RATIO_5_1 = 0.025;

const round = v => Math.round(v * 1e6) / 1e6;

const rates = (input, output, readRatio) => ({
  input,
  output,
  cacheWrite: round(input * CACHE_WRITE_RATIO),
  cacheWrite1h: round(input * CACHE_WRITE_1H_RATIO),
  cacheRead: round(input * readRatio),
});

const model = (id, input, output, readRatio = CACHE_READ_RATIO) => ({
  id,
  match: new RegExp(id + '(?:-2\\d{7})?(?![-\\w])'),
  ...rates(input, output, readRatio),
});

const family = (id, input, output) => ({
  id,
  match: new RegExp(id),
  approx: true,
  ...rates(input, output, CACHE_READ_RATIO),
});

export const PRICING = [
  model('fable-5-1',  10.00, 50.00, CACHE_READ_RATIO_5_1),
  model('mythos-5-1', 10.00, 50.00, CACHE_READ_RATIO_5_1),
  model('fable-5',    10.00, 50.00),
  model('mythos-5',   10.00, 50.00),

  model('opus-5',      5.00, 25.00),
  model('opus-4-8',    5.00, 25.00),
  model('opus-4-7',    5.00, 25.00),
  model('opus-4-6',    5.00, 25.00),
  model('opus-4-5',    5.00, 25.00),
  model('opus-4-1',   15.00, 75.00),
  model('opus-4',     15.00, 75.00),
  model('3-opus',     15.00, 75.00),

  model('sonnet-5',    2.00, 10.00),
  model('sonnet-4-6',  3.00, 15.00),
  model('sonnet-4-5',  3.00, 15.00),
  model('sonnet-4',    3.00, 15.00),
  model('3-7-sonnet',  3.00, 15.00),
  model('3-5-sonnet',  3.00, 15.00),
  model('3-sonnet',    3.00, 15.00),

  model('haiku-4-5',   1.00,  5.00),
  model('3-5-haiku',   0.80,  4.00),
  model('3-haiku',     0.25,  1.25),

  family('fable',     10.00, 50.00),
  family('mythos',    10.00, 50.00),
  family('opus',       5.00, 25.00),
  family('sonnet',     2.00, 10.00),
  family('haiku',      1.00,  5.00),
];
export const PRICING_DEFAULT = { id: 'default', ...rates(3.00, 15.00, CACHE_READ_RATIO) };
export const PRICING_LOCAL = { id: 'local', free: true, input: 0, output: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0 };

const PLACEHOLDER_MODELS = ['unknown', '<synthetic>'];

export function isAnthropicModel(model) {
  const m = (model || '').toLowerCase();
  return !m || PLACEHOLDER_MODELS.includes(m) || m.includes('claude');
}

export function getPricing(model) {
  const m = (model || '').toLowerCase();
  for (const p of PRICING) { if (p.match.test(m)) return p; }
  return isAnthropicModel(m) ? PRICING_DEFAULT : PRICING_LOCAL;
}

export function getUnknownModels(models) {
  const unknown = new Set();
  for (const model of new Set(models)) {
    if (!model || PLACEHOLDER_MODELS.includes(model)) continue;
    const p = getPricing(model);
    if (p.free) continue;
    if (p === PRICING_DEFAULT || p.approx) unknown.add(model);
  }
  return [...unknown].sort();
}

export function cacheWrite1h(e) { return Math.min(e.cacheWrite1h || 0, e.cacheWrite || 0); }
export function cacheWrite5m(e) { return (e.cacheWrite || 0) - cacheWrite1h(e); }

export function entryCost(e) {
  const p = getPricing(e.model);
  return ((e.input || 0)     * p.input
        + (e.output || 0)    * p.output
        + cacheWrite5m(e)    * p.cacheWrite
        + cacheWrite1h(e)    * p.cacheWrite1h
        + (e.cacheRead || 0) * p.cacheRead) / 1_000_000;
}
