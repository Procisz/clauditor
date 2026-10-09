import { state } from '../core/state.js';
import { getPricing, RATE_KEYS, PRICING } from '../core/config.js';
import { domEl, domText, domClear, copyToClipboard } from '../core/utils.js';

const PRICING_PAGE = 'https://platform.claude.com/docs/en/about-claude/pricing';
const FIELD_COLUMNS = [
  ['input',        'Base input tokens'],
  ['output',       'Output tokens'],
  ['cacheWrite5m', '5m cache writes'],
  ['cacheWrite1h', '1h cache writes'],
  ['cacheRead',    'Cache hits and refreshes'],
];

let modalEl = null;
let modalBox = null;

export function suggestKey(model) {
  const m = (model || '').toLowerCase();
  const at = m.lastIndexOf('claude-');
  if (at === -1) return null;
  const key = m.slice(at + 7)
    .replace(/\[.*$/, '')
    .replace(/-v\d+(?::\d+)?$/, '')
    .replace(/[-@]2\d{7}$/, '');
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(key) ? key : null;
}

export function suggestName(key) {
  const title = s => s.charAt(0).toUpperCase() + s.slice(1);
  const modern = /^([a-z]+)-(\d+)(?:-(\d+))?$/.exec(key);
  if (modern) return `Claude ${title(modern[1])} ${modern[2]}${modern[3] ? '.' + modern[3] : ''}`;
  const legacy = /^(\d+)(?:-(\d+))?-([a-z]+)$/.exec(key);
  if (legacy) return `Claude ${title(legacy[3])} ${legacy[1]}${legacy[2] ? '.' + legacy[2] : ''}`;
  return 'Claude ' + key.split('-').map(title).join(' ');
}

function estimatedRates(model) {
  const p = getPricing(model);
  return Object.fromEntries(RATE_KEYS.map(k => [k, Number(p[k].toFixed(6))]));
}

export function entrySnippet(key, name, rates) {
  return [
    `\t\t"${key}": {`,
    `\t\t\t"name": "${name}",`,
    `\t\t\t"history": [`,
    `\t\t\t\t{`,
    ...RATE_KEYS.map((k, i) => `\t\t\t\t\t"${k}": ${rates[k]}${i < RATE_KEYS.length - 1 ? ',' : ''}`),
    `\t\t\t\t}`,
    `\t\t\t]`,
    `\t\t},`,
  ].join('\n');
}

export function aliasSnippet(model) {
  return `\t\t\t"aliases": ["${model}"],`;
}

function ensureModal() {
  if (modalEl) return;
  modalEl = domEl('dialog', 'modal');
  modalEl.id = 'pricing-help-modal';
  modalBox = domEl('div', 'modal-box w-11/12 max-w-2xl');
  modalEl.appendChild(modalBox);
  const backdrop = domEl('form', 'modal-backdrop');
  backdrop.method = 'dialog';
  const b = domEl('button');
  b.textContent = 'close';
  backdrop.appendChild(b);
  modalEl.appendChild(backdrop);
  document.body.appendChild(modalEl);
}

function code(text) {
  return domText('code', 'font-mono text-[0.85em] bg-base-200 rounded px-1 py-0.5', text);
}

function para(parts, cls = 'text-sm opacity-80') {
  const p = domEl('p', cls);
  for (const part of parts) p.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
  return p;
}

function codeBlock(before, highlighted, after, copyText, copyLabel) {
  const wrap = domEl('div', 'relative');
  const pre = domEl('pre', 'pricing-help-code bg-base-200 rounded-box p-3 text-xs leading-relaxed overflow-x-auto');
  const content = domEl('code', 'pricing-help-content');
  content.appendChild(document.createTextNode(before));
  content.appendChild(domText('span', 'pricing-help-new', highlighted));
  content.appendChild(document.createTextNode(after));
  pre.appendChild(content);
  wrap.appendChild(pre);
  const btn = domText('button', 'btn btn-xs absolute top-2 right-2', copyLabel);
  btn.type = 'button';
  btn.onclick = () => copyToClipboard(copyText, 'Copied to clipboard');
  wrap.appendChild(btn);
  return wrap;
}

function modelSection(model, firstKey) {
  const section = domEl('div', 'flex flex-col gap-2 rounded-box border border-base-300 p-3');
  const head = domEl('div', 'flex flex-wrap items-center gap-2');
  head.appendChild(domText('span', 'badge badge-warning badge-sm', 'Unpriced'));
  head.appendChild(code(model));
  const est = getPricing(model);
  head.appendChild(domText('span', 'text-xs opacity-60', `estimated now at $${est.input} input / $${est.output} output per 1M tokens`));
  section.appendChild(head);

  const key = suggestKey(model);
  if (key) {
    const name = suggestName(key);
    const snippet = entrySnippet(key, name, estimatedRates(model));
    section.appendChild(para([
      'Paste this entry right after the line ', code('"models": {'), ' in ', code('src/core/pricing.json'),
      '. The prices are the current estimate: replace each one with the official price.',
    ]));
    const before = '{\n\t"source": "https://platform.claude.com/docs/en/about-claude/pricing.md",\n\t"updatedAt": "...",\n\t"models": {\n';
    const after = `\t\t"${firstKey}": { ... },\n\t\t...\n\t}\n}`;
    section.appendChild(codeBlock(before, snippet, after, snippet, 'Copy entry'));
  } else {
    const snippet = aliasSnippet(model);
    section.appendChild(para([
      'This id does not contain a model name, so no entry key can match it (a Bedrock application inference profile, for example). ',
      'Add it to the ', code('aliases'), ' of the model it actually runs. Check which model that is in your cloud console; ',
      code('sonnet-4-5'), ' below is only an example.',
    ]));
    const before = '\t"models": {\n\t\t...\n\t\t"sonnet-4-5": {\n\t\t\t"name": "Claude Sonnet 4.5",\n';
    const after = '\t\t\t"history": [ ... ]\n\t\t},\n\t\t...\n\t}';
    section.appendChild(codeBlock(before, snippet, after, snippet, 'Copy line'));
  }
  return section;
}

function fieldTable() {
  const wrap = domEl('div', 'overflow-x-auto');
  const table = domEl('table', 'table table-xs');
  const thead = domEl('thead');
  const htr = domEl('tr');
  for (const h of ['Field in pricing.json', 'Column on the pricing page']) htr.appendChild(domText('th', '', h));
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = domEl('tbody');
  for (const [field, column] of FIELD_COLUMNS) {
    const tr = domEl('tr');
    const td0 = domEl('td');
    td0.appendChild(code(field));
    tr.appendChild(td0);
    tr.appendChild(domText('td', '', column));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function openPricingHelp() {
  ensureModal();
  domClear(modalBox);
  const models = state.unpricedModels || [];

  const top = domEl('div', 'flex items-start justify-between gap-3');
  top.appendChild(domText('h3', 'font-bold text-lg', models.length > 1 ? 'Add prices for unpriced models' : 'Add a price for an unpriced model'));
  const closeForm = domEl('form');
  closeForm.method = 'dialog';
  const closeBtn = domText('button', 'btn btn-sm btn-circle btn-ghost', '✕');
  closeBtn.setAttribute('aria-label', 'Close');
  closeForm.appendChild(closeBtn);
  top.appendChild(closeForm);
  modalBox.appendChild(top);

  const body = domEl('div', 'flex flex-col gap-4 mt-3');
  body.appendChild(para(['Until a model has an exact entry in ', code('src/core/pricing.json'), ', its costs are estimated.']));

  const tip = domEl('div', 'rounded-box border-l-4 border-info bg-base-200 px-3 py-2');
  const link = domText('a', 'link', "Anthropic's pricing page");
  link.href = PRICING_PAGE;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  tip.appendChild(para(['Listed on ', link, '? Then there is nothing to edit: run ', code('npm run update:pricing'),
    ' (or wait for the daily workflow) and the model is added with its official prices.'], 'text-sm'));
  body.appendChild(tip);

  const firstKey = PRICING[0] ? PRICING[0].id : 'fable-5-1';
  for (const model of models) body.appendChild(modelSection(model, firstKey));
  if (!models.length) body.appendChild(para(['Every model in your logs has an exact price.']));

  body.appendChild(domText('h4', 'text-xs font-semibold uppercase tracking-wide opacity-50 mt-1', 'Where each price comes from'));
  body.appendChild(para(['All prices are in US dollars per million tokens, copied from the matching column of the Model pricing table:'], 'text-sm opacity-80'));
  body.appendChild(fieldTable());
  body.appendChild(para(['Optional: a later price version carries ', code('"from": "YYYY-MM-DD"'), ', long-prompt pricing goes in ',
    code('tiers'), ', and exact extra ids go in ', code('aliases'), '. See the README for details.'], 'text-xs opacity-60'));

  body.appendChild(domText('h4', 'text-xs font-semibold uppercase tracking-wide opacity-50 mt-1', 'Then'));
  const steps = domEl('ol', 'list-decimal list-inside text-sm opacity-80 flex flex-col gap-1');
  for (const parts of [
    ['Run ', code('npm run check:pricing'), ' to validate the file.'],
    ['Rebuild with ', code('npm run build'), ', or restart ', code('npm run dev'), '.'],
    ['Commit the change. The daily workflow keeps hand-made entries and aliases.'],
  ]) {
    const li = domEl('li');
    for (const part of parts) li.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
    steps.appendChild(li);
  }
  body.appendChild(steps);
  modalBox.appendChild(body);
  modalEl.showModal();
}
