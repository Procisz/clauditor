// ─────────────────────────────────────────────
// CONFIG — edit here to update pricing or markup
// Pricing last verified: 2026-08 against https://docs.claude.com/en/docs/about-claude/pricing (sonnet-5/opus-5 added)
// ─────────────────────────────────────────────
export const CONFIG_DEFAULT_MARKUP = 1.35;  // multiplier on top of Anthropic base cost

export const PRICING = [
  // More specific patterns must come before less specific ones
  { match: 'opus-5',     input:  5.00, output: 25.00, cacheWrite:  6.25, cacheRead: 0.50 },
  { match: 'opus-4-8',   input:  5.00, output: 25.00, cacheWrite:  6.25, cacheRead: 0.50 },
  { match: 'opus-4',     input:  5.00, output: 25.00, cacheWrite:  6.25, cacheRead: 0.50 },
  { match: 'opus',       input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  { match: 'sonnet-5',   input:  2.00, output: 10.00, cacheWrite:  2.50, cacheRead: 0.20 },
  { match: 'sonnet-4',   input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  { match: 'sonnet-3-5', input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  { match: 'sonnet',     input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  { match: 'haiku-4-5',  input:  1.00, output:  5.00, cacheWrite:  1.25, cacheRead: 0.10 },
  { match: 'haiku-3-5',  input:  0.80, output:  4.00, cacheWrite:  1.00, cacheRead: 0.08 },
  { match: 'haiku',      input:  0.80, output:  4.00, cacheWrite:  1.00, cacheRead: 0.08 },
];
export const PRICING_DEFAULT = { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 };

export function getPricing(model) {
  const m = (model || '').toLowerCase();
  for (const p of PRICING) { if (m.includes(p.match)) return p; }
  return PRICING_DEFAULT;
}

export function calcCost(usage, model) {
  const p = getPricing(model);
  const inp   = (usage.input_tokens || 0)                * p.input      / 1_000_000;
  const out   = (usage.output_tokens || 0)               * p.output     / 1_000_000;
  const cw    = (usage.cache_creation_input_tokens || 0) * p.cacheWrite / 1_000_000;
  const cr    = (usage.cache_read_input_tokens || 0)     * p.cacheRead  / 1_000_000;
  return inp + out + cw + cr;
}
