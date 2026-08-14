// ─────────────────────────────────────────────
// CONFIG — edit here to update pricing or markup
// Pricing last verified: 2026-08-13 against Anthropic's published API pricing.
// Cache rates follow the standard multipliers: write = 1.25 × input (5-min TTL),
// read = 0.1 × input.
//
// Matching is longest-pattern-first (sorted at load), so a new specific entry
// can be added anywhere in the list — 'opus-4-8' always beats 'opus-4', which
// always beats 'opus'. After editing, run `npm run check:pricing`.
// ─────────────────────────────────────────────
export const CONFIG_DEFAULT_MARKUP = 1;  // multiplier on top of Anthropic base cost (1 = no markup)

export const PRICING = [
  { match: 'fable',       input: 10.00, output: 50.00, cacheWrite: 12.50, cacheRead: 1.00 },
  { match: 'mythos',      input: 10.00, output: 50.00, cacheWrite: 12.50, cacheRead: 1.00 },
  { match: 'opus-5',      input:  5.00, output: 25.00, cacheWrite:  6.25, cacheRead: 0.50 },
  // opus-4 covers 4.5 through 4.8 ($5/$25); the dated opus-4 snapshot and 4.1/4.0
  // were the older $15/$75 generation, as was opus-3 (caught by generic 'opus')
  { match: 'opus-4',      input:  5.00, output: 25.00, cacheWrite:  6.25, cacheRead: 0.50 },
  { match: 'opus-4-1',    input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  { match: 'opus-4-0',    input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  { match: 'opus-4-2025', input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  { match: 'opus',        input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  // sonnet-5 is at introductory pricing through 2026-08-31; sticker is $3/$15 —
  // bump this entry when the intro period ends
  { match: 'sonnet-5',    input:  2.00, output: 10.00, cacheWrite:  2.50, cacheRead: 0.20 },
  { match: 'sonnet',      input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  { match: 'haiku-4-5',   input:  1.00, output:  5.00, cacheWrite:  1.25, cacheRead: 0.10 },
  { match: 'haiku',       input:  0.80, output:  4.00, cacheWrite:  1.00, cacheRead: 0.08 },
];
export const PRICING_DEFAULT = { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 };

// Longest pattern wins regardless of list order — insertion order can't
// silently shadow a more specific entry (the bug class behind v1.12.1)
const PRICING_SORTED = [...PRICING].sort((a, b) => b.match.length - a.match.length);

export function getPricing(model) {
  const m = (model || '').toLowerCase();
  for (const p of PRICING_SORTED) { if (m.includes(p.match)) return p; }
  return PRICING_DEFAULT;
}

// Models with no PRICING entry silently get PRICING_DEFAULT — surface them so
// a new Claude model shows up as a visible warning instead of a wrong number
export function getUnknownModels(models) {
  const unknown = new Set();
  for (const model of new Set(models)) {
    if (!model || model === 'unknown' || model === '<synthetic>') continue;
    if (getPricing(model) === PRICING_DEFAULT) unknown.add(model);
  }
  return [...unknown].sort();
}

export function calcCost(usage, model) {
  const p = getPricing(model);
  const inp   = (usage.input_tokens || 0)                * p.input      / 1_000_000;
  const out   = (usage.output_tokens || 0)               * p.output     / 1_000_000;
  const cw    = (usage.cache_creation_input_tokens || 0) * p.cacheWrite / 1_000_000;
  const cr    = (usage.cache_read_input_tokens || 0)     * p.cacheRead  / 1_000_000;
  return inp + out + cw + cr;
}
