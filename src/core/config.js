export const CONFIG_DEFAULT_MARKUP = 1;

export const PRICING = [
  { match: 'fable',       input: 10.00, output: 50.00, cacheWrite: 12.50, cacheRead: 1.00 },
  { match: 'mythos',      input: 10.00, output: 50.00, cacheWrite: 12.50, cacheRead: 1.00 },
  { match: 'opus-5',      input:  5.00, output: 25.00, cacheWrite:  6.25, cacheRead: 0.50 },

  { match: 'opus-4',      input:  5.00, output: 25.00, cacheWrite:  6.25, cacheRead: 0.50 },
  { match: 'opus-4-1',    input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  { match: 'opus-4-0',    input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  { match: 'opus-4-2025', input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  { match: 'opus',        input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },

  { match: 'sonnet-5',    input:  2.00, output: 10.00, cacheWrite:  2.50, cacheRead: 0.20 },
  { match: 'sonnet',      input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  { match: 'haiku-4-5',   input:  1.00, output:  5.00, cacheWrite:  1.25, cacheRead: 0.10 },
  { match: 'haiku',       input:  0.80, output:  4.00, cacheWrite:  1.00, cacheRead: 0.08 },
];
export const PRICING_DEFAULT = { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 };

const PRICING_SORTED = [...PRICING].sort((a, b) => b.match.length - a.match.length);

export function getPricing(model) {
  const m = (model || '').toLowerCase();
  for (const p of PRICING_SORTED) { if (m.includes(p.match)) return p; }
  return PRICING_DEFAULT;
}

export function getUnknownModels(models) {
  const unknown = new Set();
  for (const model of new Set(models)) {
    if (!model || model === 'unknown' || model === '<synthetic>') continue;
    if (getPricing(model) === PRICING_DEFAULT) unknown.add(model);
  }
  return [...unknown].sort();
}

export function entryCost(e) {
  return calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model);
}

export function calcCost(usage, model) {
  const p = getPricing(model);
  const inp   = (usage.input_tokens || 0)                * p.input      / 1_000_000;
  const out   = (usage.output_tokens || 0)               * p.output     / 1_000_000;
  const cw    = (usage.cache_creation_input_tokens || 0) * p.cacheWrite / 1_000_000;
  const cr    = (usage.cache_read_input_tokens || 0)     * p.cacheRead  / 1_000_000;
  return inp + out + cw + cr;
}
