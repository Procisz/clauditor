import PRICE_LIST from './pricing.json' with { type: 'json' };

export const CONFIG_DEFAULT_MARKUP = 1;

export const RATE_KEYS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];

const round = v => Math.round(v * 1e6) / 1e6;

const derivedRates = (input, output) => ({
  input,
  output,
  cacheWrite5m: round(input * 1.25),
  cacheWrite1h: round(input * 2),
  cacheRead: round(input * 0.1),
});

export const idPattern = id => new RegExp(id + '(?:[-@]2\\d{7})?(?:-v\\d+(?::\\d+)?)?(?![-\\w])');

const pickRates = h => Object.fromEntries(RATE_KEYS.map(k => [k, h[k]]));

export function buildPricing(list) {
  return Object.entries(list.models).map(([id, m]) => ({
    id,
    name: m.name,
    aliases: new Set((m.aliases || []).map(a => a.toLowerCase())),
    match: idPattern(id),
    versions: m.history.map(h => Object.freeze({
      id,
      from: h.from || '',
      ...pickRates(h),
      tiers: Object.freeze((h.tiers || []).map(x => Object.freeze({ id, above: x.above, ...pickRates(x) }))),
    })),
  }));
}

export const FAMILIES = ['fable', 'mythos', 'opus', 'sonnet', 'haiku'];

export function modelVersion(id, familyName) {
  const modern = new RegExp(`^${familyName}-(\\d+)(?:-(\\d+))?$`).exec(id);
  const legacy = new RegExp(`^(\\d+)(?:-(\\d+))?-${familyName}$`).exec(id);
  const m = modern || legacy;
  return m ? Number(m[1]) + Number(m[2] || 0) / 100 : null;
}

export function buildFamilyFallbacks(rows) {
  return FAMILIES.map(familyName => {
    const newest = rows
      .map(r => ({ r, v: modelVersion(r.id, familyName) }))
      .filter(x => x.v !== null)
      .sort((a, b) => b.v - a.v)[0];
    const basis = newest ? newest.r.versions.at(-1) : { ...derivedRates(3.00, 15.00), tiers: [] };
    return {
      id: familyName,
      basedOn: newest ? newest.r.id : '',
      match: new RegExp(familyName),
      versions: [Object.freeze({ ...basis, id: familyName, approx: true, from: '' })],
    };
  });
}

const EXACT_ROWS = buildPricing(PRICE_LIST);
export const FAMILY_FALLBACKS = buildFamilyFallbacks(EXACT_ROWS);
export const PRICING = [...EXACT_ROWS, ...FAMILY_FALLBACKS];
export const PRICE_LIST_UPDATED = PRICE_LIST.updatedAt;
export const PRICING_DEFAULT = Object.freeze({ id: 'default', ...derivedRates(3.00, 15.00) });
export const PRICING_LOCAL = Object.freeze({ id: 'local', free: true, input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 });

const PLACEHOLDER_MODELS = ['unknown', '<synthetic>'];

export function isAnthropicModel(model) {
  const m = (model || '').toLowerCase();
  return !m || PLACEHOLDER_MODELS.includes(m) || m.includes('claude') || m.startsWith('arn:aws:bedrock:');
}

export function priceAt(versions, ts) {
  if (!ts) return versions[versions.length - 1];
  for (let i = versions.length - 1; i > 0; i--) {
    if (ts >= versions[i].from) return versions[i];
  }
  return versions[0];
}

const findRow = (rows, m) => rows.find(r => r.aliases && r.aliases.has(m)) || rows.find(r => r.match.test(m));

export function resolvePrice(rows, model, ts) {
  const m = (model || '').toLowerCase();
  const row = findRow(rows, m);
  if (row) return priceAt(row.versions, ts);
  return isAnthropicModel(m) ? PRICING_DEFAULT : PRICING_LOCAL;
}

export function promptTokens(e) {
  return (e.input || 0) + (e.cacheRead || 0) + (e.cacheWrite || 0);
}

export function tierAt(price, prompt) {
  const tiers = price.tiers;
  if (!tiers || !tiers.length) return price;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (prompt > tiers[i].above) return tiers[i];
  }
  return price;
}

const rowCache = new Map();

export function getPricing(model, ts) {
  const m = (model || '').toLowerCase();
  if (!rowCache.has(m)) rowCache.set(m, findRow(PRICING, m) || null);
  const row = rowCache.get(m);
  if (row) return priceAt(row.versions, ts);
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

export function costByType(p, e) {
  return {
    input:        (e.input || 0)     * p.input        / 1_000_000,
    output:       (e.output || 0)    * p.output       / 1_000_000,
    cacheWrite5m: cacheWrite5m(e)    * p.cacheWrite5m / 1_000_000,
    cacheWrite1h: cacheWrite1h(e)    * p.cacheWrite1h / 1_000_000,
    cacheRead:    (e.cacheRead || 0) * p.cacheRead    / 1_000_000,
  };
}

export function entryCostByType(e) {
  return costByType(tierAt(getPricing(e.model, e.ts), promptTokens(e)), e);
}

export function entryCost(e) {
  const c = entryCostByType(e);
  return c.input + c.output + c.cacheWrite5m + c.cacheWrite1h + c.cacheRead;
}
