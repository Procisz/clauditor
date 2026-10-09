import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing.md';
export const PRICE_FILE = fileURLToPath(new URL('../src/core/pricing.json', import.meta.url));
const RATE_KEYS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];
const MIN_ROWS = 10;
const KNOWN_READ_RATIOS = [0.1, 0.05, 0.025];
export const IGNORED_ROWS = new Set([]);

const COLUMNS = {
  model:        ['model'],
  input:        ['base input tokens', 'base input', 'input tokens', 'input'],
  cacheWrite5m: ['5m cache writes', '5-minute cache writes', '5m cache write'],
  cacheWrite1h: ['1h cache writes', '1-hour cache writes', '1h cache write'],
  cacheRead:    ['cache hits and refreshes', 'cache hits & refreshes', 'cache hits', 'cache reads', 'cache read'],
  output:       ['output tokens', 'output'],
};

export class PricingError extends Error {}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function normalizeCell(cell) {
  return String(cell)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/ /g, ' ')
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\[\^[^\]]*\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|(?<![\w$])[*_]|[*_](?![\w])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanModelName(cell) {
  return normalizeCell(cell).replace(/[(,].*$/, '').trim();
}

export function modelId(name) {
  const m = /^Claude\s+([A-Za-z]+)\s+(\d+(?:\.\d+)?)$/.exec(name.trim());
  if (!m) return null;
  const familyName = m[1].toLowerCase();
  const version = m[2].replace('.', '-');
  return parseInt(m[2], 10) < 4 ? `${version}-${familyName}` : `${familyName}-${version}`;
}

export function tierQualifier(cell) {
  const m = /prompts?\s+(up to|over|above)\s+([\d,]+)\s*tokens/i.exec(normalizeCell(cell));
  if (!m) return null;
  return { kind: /up to/i.test(m[1]) ? 'upTo' : 'over', tokens: Number(m[2].replace(/,/g, '')) };
}

export function parsePrice(cell) {
  const m = /^\$\s*([\d,]*\.?\d+)\s*\/\s*MTok\s*\d*$/i.exec(normalizeCell(cell));
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
}

const splitRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

function mapColumns(headerCells) {
  const headers = headerCells.map(h => normalizeCell(h).toLowerCase());
  const index = {};
  headers.forEach((h, i) => {
    const keys = Object.keys(COLUMNS).filter(k => COLUMNS[k].includes(h));
    if (keys.length !== 1) throw new PricingError(`unexpected column "${headerCells[i]}" in the model pricing table`);
    if (index[keys[0]] !== undefined) throw new PricingError(`two columns map to "${keys[0]}"`);
    index[keys[0]] = i;
  });
  for (const k of Object.keys(COLUMNS)) {
    if (index[k] === undefined) throw new PricingError(`column for "${k}" not found in headers: ${headerCells.join(' | ')}`);
  }
  return index;
}

export function parsePricingTable(markdown, { ignored = IGNORED_ROWS } = {}) {
  const lines = markdown.split('\n');
  const headings = lines.map((l, i) => (/^#{1,6}\s+Model pricing\s*$/i.test(l.trim()) ? i : -1)).filter(i => i !== -1);
  if (!headings.length) throw new PricingError('"Model pricing" heading not found on the pricing page');
  if (headings.length > 1) throw new PricingError('more than one "Model pricing" heading on the pricing page');
  let start = headings[0] + 1;
  while (start < lines.length && !lines[start].trim().startsWith('|')) {
    if (/^#{1,6}\s/.test(lines[start].trim())) throw new PricingError('no table under the "Model pricing" heading');
    start++;
  }
  const table = [];
  for (let i = start; i < lines.length && lines[i].trim().startsWith('|'); i++) table.push(lines[i]);
  if (table.length < 3) throw new PricingError('model pricing table is empty');

  const index = mapColumns(splitRow(table[0]));
  const raw = [];
  const skipped = [];
  const unreadable = [];
  for (const line of table.slice(1)) {
    const cells = splitRow(line);
    if (cells.every(c => /^:?-+:?$/.test(c))) continue;
    const cell = cells[index.model] || '';
    const name = cleanModelName(cell);
    if (ignored.has(name)) { skipped.push(name); continue; }
    if (/[<>&[\]]/.test(name)) throw new PricingError(`unhandled markup in model name "${cell}"`);
    const id = modelId(name);
    if (!id) { unreadable.push(name || cell); continue; }
    const rates = {};
    for (const k of RATE_KEYS) {
      rates[k] = parsePrice(cells[index[k]] || '');
      if (!Number.isFinite(rates[k])) throw new PricingError(`${id}: cannot read the ${k} price from "${cells[index[k]]}"`);
    }
    raw.push({ id, name, qualifier: tierQualifier(cell), rates });
  }
  if (unreadable.length) {
    throw new PricingError(`rows with an unrecognised model name: ${unreadable.join('; ')} (add them to IGNORED_ROWS to skip them on purpose)`);
  }

  const byId = new Map();
  for (const r of raw) {
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id).push(r);
  }
  const rows = [];
  for (const [id, group] of byId) {
    const base = group.filter(r => !r.qualifier || r.qualifier.kind === 'upTo');
    const over = group.filter(r => r.qualifier && r.qualifier.kind === 'over');
    if (base.length !== 1) throw new PricingError(`${id}: expected exactly one base price row, found ${base.length}`);
    const tiers = over.map(r => ({ above: r.qualifier.tokens, ...r.rates })).sort((a, b) => a.above - b.above);
    if (new Set(tiers.map(x => x.above)).size !== tiers.length) throw new PricingError(`${id}: two price tiers share a threshold`);
    const upTo = base[0].qualifier && base[0].qualifier.tokens;
    if (upTo !== undefined && upTo !== null) {
      if (!tiers.length) throw new PricingError(`${id}: an "up to ${upTo} tokens" row has no matching "over" row`);
      if (tiers[0].above !== upTo) throw new PricingError(`${id}: "up to ${upTo}" does not meet the first "over ${tiers[0].above}" tier`);
    }
    rows.push({ id, name: base[0].name, price: tiers.length ? { ...base[0].rates, tiers } : { ...base[0].rates } });
  }
  return { rows, skipped };
}

const priceLevels = price => [price, ...(price.tiers || [])];

export function validateRows(rows) {
  const warnings = [];
  if (rows.length < MIN_ROWS) throw new PricingError(`only ${rows.length} models parsed, expected at least ${MIN_ROWS}`);
  const seen = new Set();
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  for (const { id, name, price } of rows) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new PricingError(`invalid model id "${id}" from "${name}"`);
    if (seen.has(id)) throw new PricingError(`duplicate model id "${id}"`);
    seen.add(id);
    priceLevels(price).forEach((r, level) => {
      const label = level === 0 ? id : `${id} (prompts over ${r.above} tokens)`;
      for (const k of RATE_KEYS) {
        if (!Number.isFinite(r[k]) || r[k] <= 0) throw new PricingError(`${label}: ${k} is not a positive price (${r[k]})`);
      }
      if (!(r.output > r.input)) throw new PricingError(`${label}: output price is not above input price`);
      if (!(r.cacheRead < r.input && r.input < r.cacheWrite5m && r.cacheWrite5m < r.cacheWrite1h)) {
        throw new PricingError(`${label}: rates are not ordered cache read < input < 5m write < 1h write`);
      }
      if (!near(r.cacheWrite5m, r.input * 1.25)) warnings.push(`${label}: 5m cache write is ${r.cacheWrite5m}, not 1.25 x input`);
      if (!near(r.cacheWrite1h, r.input * 2)) warnings.push(`${label}: 1h cache write is ${r.cacheWrite1h}, not 2 x input`);
      if (!KNOWN_READ_RATIOS.some(x => near(r.cacheRead, r.input * x))) {
        warnings.push(`${label}: cache read is ${r.cacheRead}, not a documented multiple (${KNOWN_READ_RATIOS.join(', ')}) of input`);
      }
      if (level > 0 && !(r.input >= priceLevels(price)[level - 1].input)) warnings.push(`${label}: is cheaper than the tier below it`);
    });
  }
  return warnings;
}

const sameRates = (a, b) => RATE_KEYS.every(k => Math.abs(a[k] - b[k]) < 1e-9);
export function samePrice(a, b) {
  const ta = a.tiers || [], tb = b.tiers || [];
  return sameRates(a, b) && ta.length === tb.length && ta.every((x, i) => x.above === tb[i].above && sameRates(x, tb[i]));
}
const fmtRates = r => RATE_KEYS.map(k => `${k} ${r[k]}`).join(', ');
const fmtPrice = p => fmtRates(p) + (p.tiers || []).map(x => `; over ${x.above} tokens: ${fmtRates(x)}`).join('');
const priceOnly = p => structuredClone(Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'from')));

function assertNotMisparsed(next, rows, id) {
  const pageIds = new Set(rows.map(r => r.id));
  const parent = Object.keys(next.models).find(old => old !== id && id.startsWith(old) && /^\d/.test(id.slice(old.length)));
  if (parent && !pageIds.has(parent)) {
    throw new PricingError(`new model "${id}" looks like a misread "${parent}" (which is missing from the page); refusing to add it`);
  }
}

export function mergePriceList(list, rows, today) {
  const next = structuredClone(list);
  const changes = [];
  for (const { id, name, price } of rows) {
    const entry = next.models[id];
    if (!entry) {
      assertNotMisparsed(next, rows, id);
      next.models[id] = { name, history: [{ from: today, ...priceOnly(price) }] };
      changes.push(`added ${id} (${fmtPrice(price)})`);
      continue;
    }
    const h = entry.history;
    let at = 0;
    for (let i = h.length - 1; i > 0; i--) {
      if (today >= h[i].from) { at = i; break; }
    }
    const inForce = h[at];
    if (!samePrice(inForce, price)) {
      if (inForce.from === today) {
        if (at > 0 && samePrice(h[at - 1], price)) {
          h.splice(at, 1);
          changes.push(`${id}: same-day change reverted (${fmtPrice(price)})`);
        } else {
          h[at] = { from: today, ...priceOnly(price) };
          changes.push(`${id} corrected for ${today}: ${fmtPrice(inForce)} -> ${fmtPrice(price)}`);
        }
      } else {
        h.splice(at + 1, 0, { from: today, ...priceOnly(price) });
        changes.push(`${id} from ${today}: ${fmtPrice(inForce)} -> ${fmtPrice(price)}`);
      }
    }
    if (entry.name !== name) {
      changes.push(`${id} renamed "${entry.name}" -> "${name}"`);
      entry.name = name;
    }
  }
  if (changes.length) next.updatedAt = today;
  return { list: next, changes };
}

export function detectIndent(text) {
  const line = text.split('\n').find((l, i) => i > 0 && /^\s+\S/.test(l)) || '';
  if (line.startsWith('\t')) return '\t';
  const spaces = /^ +/.exec(line);
  return spaces ? spaces[0] : '  ';
}

export function serializePriceList(list, indent) {
  return JSON.stringify(list, null, indent) + '\n';
}

async function fetchPricingPage() {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000), headers: { accept: 'text/markdown, text/plain' } });
  if (!res.ok) throw new PricingError(`pricing page returned HTTP ${res.status}`);
  return res.text();
}

function report(lines) {
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const { rows, skipped } = parsePricingTable(await fetchPricingPage());
  const warnings = validateRows(rows);
  const currentText = readFileSync(PRICE_FILE, 'utf8');
  const current = JSON.parse(currentText);
  const { list, changes } = mergePriceList(current, rows, today);

  const summary = [`## Claude pricing check (${today})`, '', `Parsed ${rows.length} models from ${SOURCE}.`];
  if (skipped.length) summary.push('', 'Rows skipped on purpose (IGNORED_ROWS):', ...skipped.map(s => `- ${s}`));
  if (warnings.length) summary.push('', 'Unusual cache multipliers (prices still applied):', ...warnings.map(w => `- ${w}`));
  summary.push('', changes.length ? 'Changes:' : 'No price changes.', ...changes.map(c => `- ${c}`));
  report(summary);

  if (!changes.length) return;
  writeFileSync(PRICE_FILE, serializePriceList(list, detectIndent(currentText)));
  if (process.env.RUNNER_TEMP) {
    const message = [`Update Claude pricing (${today})`, '', ...changes.map(c => `- ${c}`)].join('\n') + '\n';
    writeFileSync(join(process.env.RUNNER_TEMP, 'pricing-commit-message.txt'), message);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => {
    console.error(`update-pricing failed: ${err.message}`);
    process.exit(1);
  });
}
