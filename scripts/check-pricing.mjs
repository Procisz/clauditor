import PRICE_LIST from '../src/core/pricing.json' with { type: 'json' };
import {
  PRICING, PRICING_DEFAULT, RATE_KEYS, buildPricing, getPricing, getUnknownModels, priceAt, resolvePrice,
  tierAt, promptTokens, costByType, entryCost, entryCostByType, cacheWrite5m, cacheWrite1h,
} from '../src/core/config.js';
import {
  modelId, cleanModelName, normalizeCell, parsePrice, tierQualifier, parsePricingTable, validateRows, mergePriceList, PricingError,
} from './update-pricing.mjs';

let failures = 0;
let warnings = 0;
function check(label, ok, detail = '') {
  if (ok) { console.log(`  ok  ${label}`); }
  else    { console.error(`FAIL  ${label}${detail ? ': ' + detail : ''}`); failures++; }
}
function warn(label) { console.warn(`WARN  ${label}`); warnings++; }
const near = (a, b) => Math.abs(a - b) < 1e-9;
const M = 1_000_000;
const rates = (input, output, cacheRead = input * 0.1) =>
  ({ input, output, cacheWrite5m: input * 1.25, cacheWrite1h: input * 2, cacheRead });

console.log('Price list structure (src/core/pricing.json):');
const ids = Object.keys(PRICE_LIST.models);
check('the list has models and an updatedAt date', ids.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(PRICE_LIST.updatedAt || ''));
for (const id of ids) {
  const m = PRICE_LIST.models[id];
  const problems = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) problems.push('invalid id');
  if (typeof m.name !== 'string' || !m.name) problems.push('missing name');
  if (!Array.isArray(m.history) || !m.history.length) problems.push('empty history');
  (m.history || []).forEach((h, i) => {
    if (i > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(h.from || '')) problems.push(`version ${i} has no valid "from" date`);
    if (i > 0 && h.from <= (m.history[i - 1].from || '')) problems.push(`version ${i} "from" is not after the previous one`);
    const levels = [h, ...(h.tiers || [])];
    levels.forEach((r, level) => {
      if (level > 0 && !(Number.isInteger(r.above) && r.above > (levels[level - 1].above || 0))) problems.push(`version ${i} tier ${level} threshold is not ascending`);
      if (!RATE_KEYS.every(k => Number.isFinite(r[k]) && r[k] > 0)) problems.push(`version ${i} level ${level} has a non-positive rate`);
      if (!(r.output > r.input)) problems.push(`version ${i} level ${level}: output not above input`);
      if (!(r.cacheRead < r.input && r.input < r.cacheWrite5m && r.cacheWrite5m < r.cacheWrite1h)) problems.push(`version ${i} level ${level}: rates out of order`);
      if (!near(r.cacheWrite5m, r.input * 1.25) || !near(r.cacheWrite1h, r.input * 2) || ![0.1, 0.05, 0.025].some(x => near(r.cacheRead, r.input * x))) {
        warn(`${id} version ${i} level ${level}: cache rates are not a documented multiple of input`);
      }
    });
  });
  check(`'${id}' is well formed`, problems.length === 0, problems.join('; '));
}

console.log('Every listed model resolves to its own entry:');
for (const id of ids) {
  const latest = PRICE_LIST.models[id].history.at(-1);
  const plain = getPricing(`claude-${id}`);
  const dated = getPricing(`claude-${id}-20250101`);
  check(`claude-${id} (and its dated snapshot)`, plain.id === id && dated.id === id && RATE_KEYS.every(k => near(plain[k], latest[k])),
    `resolved to '${plain.id}' / '${dated.id}'`);
}

console.log('Real log model strings resolve to the right entry:');
const LOG_IDS = {
  'claude-opus-4-20250514': 'opus-4',      'claude-opus-4-1-20250805': 'opus-4-1', 'claude-opus-4-8[1m]': 'opus-4-8',
  'claude-haiku-4-5-20251001': 'haiku-4-5', 'claude-3-5-haiku-20241022': '3-5-haiku', 'claude-3-haiku-20240307': '3-haiku',
  'claude-3-5-sonnet-20240620': '3-5-sonnet', 'claude-3-7-sonnet-20250219': '3-7-sonnet', 'claude-3-sonnet-20240229': '3-sonnet',
  'claude-3-opus-20240229': '3-opus',      'claude-fable-5-1': 'fable-5-1',          'claude-fable-5': 'fable-5',
};
for (const [model, want] of Object.entries(LOG_IDS)) {
  const got = getPricing(model).id;
  check(`${model} -> ${want}`, got === want, `resolved to '${got}'`);
}

console.log('Pattern anchoring (a version pattern must not swallow a longer version):');
for (const [model, mustNot] of Object.entries({ 'claude-opus-4-10': 'opus-4-1', 'claude-opus-4-11': 'opus-4-1', 'claude-fable-5-10': 'fable-5-1', 'claude-sonnet-4-60': 'sonnet-4-6' })) {
  check(`${model} does not resolve to '${mustNot}'`, getPricing(model).id !== mustNot, `resolved to '${getPricing(model).id}'`);
}
const firstFamily = PRICING.findIndex(r => r.versions[0].approx);
check('every exact entry precedes the family fallbacks',
  firstFamily !== -1 && PRICING.slice(firstFamily).every(r => r.versions[0].approx) && PRICING.slice(0, firstFamily).every(r => !r.versions[0].approx));

console.log('Unpriced-model detection:');
for (const model of ['claude-next-9', 'claude-opus-999', 'claude-sonnet-999', 'claude-haiku-999', 'claude-fable-999', 'claude-mythos-999']) {
  check(`'${model}' is flagged`, getUnknownModels([model]).length === 1, `getPricing -> '${getPricing(model).id}'`);
}
check("'unknown' and '<synthetic>' placeholders are not flagged", getUnknownModels(['unknown', '<synthetic>']).length === 0);
check('listed models are not flagged', getUnknownModels(ids.map(id => `claude-${id}`)).length === 0);

console.log('Prices that change over time:');
const timeline = buildPricing({ models: {
  'opus-9': { name: 'Claude Opus 9', history: [
    rates(5, 25),
    { from: '2026-05-01', ...rates(7, 35) },
    { from: '2026-07-01', ...rates(3, 15) },
  ] },
  'haiku-9': { name: 'Claude Haiku 9', history: [{ from: '2026-09-01', ...rates(1, 5) }] },
} });
const at = ts => resolvePrice(timeline, 'claude-opus-9', ts).input;
check('before the first change, the original price applies', at('2026-04-30T23:59:59.999Z') === 5);
check('a change applies from the first instant of its UTC date', at('2026-05-01T00:00:00.000Z') === 7);
check('between changes, the earlier change applies', at('2026-06-15T12:00:00.000Z') === 7);
check('after the last change, the latest price applies', at('2027-01-01T00:00:00.000Z') === 3);
check('without a timestamp, the latest price applies', at('') === 3 && at(undefined) === 3);
check('a model used before its first recorded date gets its first known price',
  resolvePrice(timeline, 'claude-haiku-9', '2026-08-31T10:00:00.000Z').input === 1);
check('the same entry costs differently in different periods', (() => {
  const e = { input: M, output: 0, cacheWrite: 0, cacheRead: 0 };
  const cost = ts => costByType(resolvePrice(timeline, 'claude-opus-9', ts), e).input;
  return cost('2026-04-01T00:00:00Z') === 5 && cost('2026-06-01T00:00:00Z') === 7 && cost('2026-08-01T00:00:00Z') === 3;
})());
check('priceAt never returns undefined for a single-version history', priceAt(timeline[1].versions, '2000-01-01') === timeline[1].versions[0]);

console.log('Prompt-length price tiers (each request priced on its own prompt size):');
const tiered = buildPricing({ models: { 'haiku-9': { name: 'Claude Haiku 9', history: [
  { ...rates(0.1, 0.5), tiers: [{ above: 100000, ...rates(0.5, 2.5) }, { above: 500000, ...rates(1, 5) }] },
] } } })[0].versions[0];
check('a prompt of exactly 100,000 tokens stays on the base price', tierAt(tiered, 100000).input === 0.1);
check('a prompt of 100,001 tokens moves to the higher tier', tierAt(tiered, 100001).input === 0.5);
check('a prompt above the top threshold gets the top tier', tierAt(tiered, 900000).input === 1);
check('a version without tiers ignores prompt size', tierAt(timeline[0].versions[0], 5 * M).input === 5);
check('prompt size counts input, cache reads and cache writes, not output',
  promptTokens({ input: 10, cacheRead: 60000, cacheWrite: 40000, output: 999999 }) === 100010);
check('a cache-heavy request over the threshold pays the higher tier on every token type', (() => {
  const e = { input: 10, output: 1000, cacheRead: 60000, cacheWrite: 40000, cacheWrite1h: 0 };
  const c = costByType(tierAt(tiered, promptTokens(e)), e);
  return near(c.output, 1000 * 2.5 / M) && near(c.cacheRead, 60000 * 0.05 / M);
})());

console.log('Cost math:');
const p = rates(5, 25);
check('an archived entry with no TTL split prices all writes at the 5m rate', near(costByType(p, { cacheWrite: M }).cacheWrite5m + costByType(p, { cacheWrite: M }).cacheWrite1h, 6.25));
check('an all-1h entry prices writes at 2 x input', near(costByType(p, { cacheWrite: M, cacheWrite1h: M }).cacheWrite1h, 10));
check('cacheWrite1h is clamped to the total', cacheWrite1h({ cacheWrite: 10, cacheWrite1h: 999 }) === 10 && cacheWrite5m({ cacheWrite: 10, cacheWrite1h: 999 }) === 0);
check('the TTL split always reconstructs the total', [[0, 0], [M, 0], [M, M], [M, M / 3], [5, 999]].every(([w, h]) => {
  const e = { cacheWrite: w, cacheWrite1h: h };
  return cacheWrite5m(e) + cacheWrite1h(e) === w && cacheWrite5m(e) >= 0;
}));
const sample = { model: `claude-${ids[0]}`, ts: '2026-10-01T00:00:00Z', input: M, output: M, cacheWrite: M, cacheWrite1h: M / 2, cacheRead: M };
check('entryCost is the sum of entryCostByType', near(Object.values(entryCostByType(sample)).reduce((a, b) => a + b, 0), entryCost(sample)));
check("a local model ('gpt-oss:20b') costs nothing and is not flagged",
  entryCost({ model: 'gpt-oss:20b', input: M, output: M }) === 0 && getUnknownModels(['gpt-oss:20b']).length === 0);
check('an unrecognised Claude model still costs money', entryCost({ model: 'claude-next-9', input: M }) > 0 && getPricing('claude-next-9') === PRICING_DEFAULT);

console.log('Pricing page parser (offline fixture):');
check('model names map to log ids', modelId('Claude Opus 5.5') === 'opus-5-5' && modelId('Claude Opus 4') === 'opus-4'
  && modelId('Claude Haiku 3.5') === '3-5-haiku' && modelId('Claude Sonnet 3') === '3-sonnet' && modelId('Claude Mythos Preview') === null);
check('links, footnotes and qualifiers are stripped from model names',
  cleanModelName('Claude Opus 4.1 ([retired, except on Bedrock](https://x))') === 'Claude Opus 4.1'
  && cleanModelName('Claude Haiku 5.5 (for prompts over 100,000 tokens)') === 'Claude Haiku 5.5');
check('a footnote on a model name never glues onto the version', modelId(cleanModelName('Claude Opus 5.5<sup>4</sup>')) === 'opus-5-5'
  && modelId(cleanModelName('Claude Sonnet 5<sup>3</sup>')) === 'sonnet-5' && modelId(cleanModelName('Claude Opus 4.1[^2]')) === 'opus-4-1');
check('entities, links, emphasis and comma qualifiers normalise to the plain name',
  modelId(cleanModelName('Claude&nbsp;Opus&#160;5')) === 'opus-5' && modelId(cleanModelName('[Claude Opus 5](https://x)')) === 'opus-5'
  && modelId(cleanModelName('**Claude Opus 5**')) === 'opus-5' && modelId(cleanModelName('Claude Opus 5, limited')) === 'opus-5'
  && normalizeCell('Claude\u00a0Opus 5') === 'Claude Opus 5');
check('prices parse with footnote markers', parsePrice('$0.25 / MTok<sup>1</sup>') === 0.25 && parsePrice('$0.25 / MTok1') === 0.25
  && parsePrice('$1,000 / MTok') === 1000 && Number.isNaN(parsePrice('n/a')));
check('a cell with more than one price is not guessed', Number.isNaN(parsePrice('$10 / MTok (was $15 / MTok)'))
  && Number.isNaN(parsePrice('$2 / MTok through Aug 31')) && Number.isNaN(parsePrice('~~$15 / MTok~~ $10 / MTok')));
check('tier qualifiers parse', JSON.stringify(tierQualifier('Claude Haiku 5.5 (for prompts up to 100,000 tokens)')) === '{"kind":"upTo","tokens":100000}'
  && JSON.stringify(tierQualifier('(for prompts over 100,000 tokens)')) === '{"kind":"over","tokens":100000}' && tierQualifier('Claude Opus 5') === null);

const row = (name, [i, w5, w1, r, o]) => `| ${name} | $${i} / MTok | $${w5} / MTok | $${w1} / MTok | $${r} / MTok | $${o} / MTok |`;
const fixtureRows = [
  row('Claude Opus 9', [5, 6.25, 10, 0.5, 25]),
  row('Claude Opus 4.1 ([retired](https://x))', [15, 18.75, 30, 1.5, 75]),
  row('Claude Haiku 9 (for prompts up to 100,000 tokens)', [0.1, 0.125, 0.2, 0.01, 0.5]),
  row('Claude Haiku 9 (for prompts over 100,000 tokens)', [0.5, 0.625, 1, 0.05, 2.5]),
  ...Array.from({ length: 9 }, (_, k) => row(`Claude Sonnet ${k + 10}`, [3, 3.75, 6, 0.3, 15])),
];
const HEADER = '| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |';
const page = (rows, header = HEADER) => ['# Pricing', '## Model pricing', '', 'Intro text.', '', header,
  '| :--- | :--- | :--- | :--- | :--- | :--- |', ...rows, '', '## Batch processing', '| Model | Batch input | Batch output |', '| x | $1 / MTok | $2 / MTok |'].join('\n');
const fixture = page(fixtureRows);
const parsed = parsePricingTable(fixture);
const byId = Object.fromEntries(parsed.rows.map(r => [r.id, r]));
const throwsPricing = fn => { try { fn(); return false; } catch (e) { return e instanceof PricingError; } };
check('only the model pricing table is read', parsed.rows.length === 12 && !byId['x'] && parsed.skipped.length === 0);
const preview = page([...fixtureRows, row('Claude Mythos Preview', [10, 12.5, 20, 1, 50])]);
check('a row with an unrecognised model name fails the run instead of being dropped', throwsPricing(() => parsePricingTable(preview)));
check('a row listed in IGNORED_ROWS is skipped on purpose and reported',
  parsePricingTable(preview, { ignored: new Set(['Claude Mythos Preview']) }).skipped.join() === 'Claude Mythos Preview');
check('an extra or renamed column fails the run instead of shifting prices',
  throwsPricing(() => parsePricingTable(page(fixtureRows, HEADER.replace(' Output tokens |', ' Output tokens | Batch input |'))))
  && throwsPricing(() => parsePricingTable(page(fixtureRows, HEADER.replace('Base input tokens', 'Input cost')))));
check('a price cell holding two amounts fails the run', throwsPricing(() => parsePricingTable(page(
  fixtureRows.map((r, i) => i ? r : r.replace('$25 / MTok', '$25 / MTok (was $30 / MTok)'))))));
check('a footnote on a name in a real table still updates the real model',
  parsePricingTable(page(fixtureRows.map((r, i) => i ? r : r.replace('Claude Opus 9', 'Claude Opus 9<sup>4</sup>')))).rows[0].id === 'opus-9');
check('a second "Model pricing" heading fails the run', throwsPricing(() => parsePricingTable(fixture + '\n## Model pricing\n' + HEADER)));
check('tier rows of one model merge into one entry', byId['haiku-9'].price.input === 0.1 && byId['haiku-9'].price.tiers.length === 1
  && byId['haiku-9'].price.tiers[0].above === 100000 && byId['haiku-9'].price.tiers[0].output === 2.5);
check('a fixture page validates', (() => { try { validateRows(parsed.rows); return true; } catch { return false; } })());
const rejects = (label, rows) => check(label, (() => { try { validateRows(rows); return false; } catch (e) { return e instanceof PricingError; } })());
rejects('too few models is rejected', parsed.rows.slice(0, 3));
rejects('swapped columns are rejected', parsed.rows.map((r, i) => i ? r : { ...r, price: { ...r.price, input: r.price.output, output: r.price.input } }));
check('a page whose heading is missing fails loudly', throwsPricing(() => parsePricingTable('# nothing here')));
check('two base rows for one model fail loudly', throwsPricing(() => parsePricingTable(fixture.replace('(for prompts over 100,000 tokens)', ''))));

console.log('Merging into the price list:');
const base = { updatedAt: '2026-01-01', models: { 'opus-9': { name: 'Claude Opus 9', history: [rates(5, 25)] } } };
const same = mergePriceList(base, [{ id: 'opus-9', name: 'Claude Opus 9', price: rates(5, 25) }], '2026-10-09');
check('unchanged prices produce no change and keep updatedAt', same.changes.length === 0 && same.list.updatedAt === '2026-01-01');
const bumped = mergePriceList(base, [{ id: 'opus-9', name: 'Claude Opus 9', price: rates(6, 30) }], '2026-10-09');
check('a changed price appends a dated version and keeps the old one', bumped.list.models['opus-9'].history.length === 2
  && bumped.list.models['opus-9'].history[0].input === 5 && bumped.list.models['opus-9'].history[1].from === '2026-10-09'
  && bumped.list.models['opus-9'].history[1].input === 6 && bumped.list.updatedAt === '2026-10-09');
check('merging never mutates the input list', base.models['opus-9'].history.length === 1);
const added = mergePriceList(base, [{ id: 'opus-9', name: 'Claude Opus 9', price: rates(5, 25) }, { id: 'opus-10', name: 'Claude Opus 10', price: rates(4, 20) }], '2026-10-09');
check('a new model is added with its first-seen date', added.list.models['opus-10'].history.length === 1 && added.list.models['opus-10'].history[0].from === '2026-10-09');
check('a new id that extends a model missing from the page is refused as a misread', throwsPricing(() =>
  mergePriceList(base, [{ id: 'opus-94', name: 'Claude Opus 9.4', price: rates(5, 25) }], '2026-10-09'))
  && mergePriceList(base, [{ id: 'opus-9', name: 'Claude Opus 9', price: rates(5, 25) }, { id: 'opus-94', name: 'Claude Opus 9.4', price: rates(5, 25) }], '2026-10-09').changes.length === 1);
const typo = bumped.list;
const corrected = mergePriceList(typo, [{ id: 'opus-9', name: 'Claude Opus 9', price: rates(6.5, 32.5) }], '2026-10-09');
check('a second change on the same day replaces that day\'s version', corrected.list.models['opus-9'].history.length === 2
  && corrected.list.models['opus-9'].history[1].input === 6.5 && corrected.list.models['opus-9'].history[1].from === '2026-10-09');
const reverted = mergePriceList(typo, [{ id: 'opus-9', name: 'Claude Opus 9', price: rates(5, 25) }], '2026-10-09');
check('a same-day change back to the previous price removes that day\'s version', reverted.list.models['opus-9'].history.length === 1 && reverted.changes.length === 1);
const newToday = mergePriceList(added.list, [{ id: 'opus-10', name: 'Claude Opus 10', price: rates(4.5, 22.5) }], '2026-10-09');
check('a same-day correction to a model added today rewrites its first price', newToday.list.models['opus-10'].history.length === 1
  && newToday.list.models['opus-10'].history[0].input === 4.5);
const scheduled = { updatedAt: '2026-01-01', models: { 'opus-9': { name: 'Claude Opus 9', history: [rates(5, 25), { from: '2026-12-01', ...rates(6, 30) }] } } };
const early = mergePriceList(scheduled, [{ id: 'opus-9', name: 'Claude Opus 9', price: rates(4, 20) }], '2026-10-09');
check('a change before a hand-entered future price is inserted in date order',
  early.list.models['opus-9'].history.map(h => h.from || '').join(',') === ',2026-10-09,2026-12-01');
check('a page matching a scheduled price that is now in force is no change',
  mergePriceList(scheduled, [{ id: 'opus-9', name: 'Claude Opus 9', price: rates(6, 30) }], '2026-12-05').changes.length === 0);
const retired = mergePriceList(base, [], '2026-10-09');
check('a model missing from the page is kept (retired models still price old logs)', !!retired.list.models['opus-9'] && retired.changes.length === 0);
const retiered = mergePriceList({ models: { 'haiku-9': { name: 'Claude Haiku 9', history: [byId['haiku-9'].price] } } },
  [{ id: 'haiku-9', name: 'Claude Haiku 9', price: { ...byId['haiku-9'].price, tiers: [{ ...byId['haiku-9'].price.tiers[0], above: 200000 }] } }], '2026-10-09');
check('a moved tier threshold is a price change', retiered.changes.length === 1 && retiered.list.models['haiku-9'].history[1].tiers[0].above === 200000);

console.log(`\n${warnings} warning(s).`);
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('All pricing checks passed.');
