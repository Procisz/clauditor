import { state } from '../core/state.js';
import { getPricing, RATE_KEYS, PRICING } from '../core/config.js';
import { suggestKey, suggestName, entrySnippet, aliasSnippet } from '../core/pricing-snippets.js';
import { copyToClipboard } from '../core/utils.js';
import { openModal, modalSection, modalBadge } from '../ui/modal.js';
import { esc } from '../ui/dom.js';
import { t } from '../i18n/index.js';

const PRICING_PAGE = 'https://platform.claude.com/docs/en/about-claude/pricing';
const FIELD_COLUMNS = [
  ['input',        'pricing.column.input'],
  ['output',       'pricing.column.output'],
  ['cacheWrite5m', 'pricing.column.cacheWrite5m'],
  ['cacheWrite1h', 'pricing.column.cacheWrite1h'],
  ['cacheRead',    'pricing.column.cacheRead'],
];

function estimatedRates(model) {
  const p = getPricing(model);
  return Object.fromEntries(RATE_KEYS.map(k => [k, Number(p[k].toFixed(6))]));
}

const code = (text) => `<code>${esc(text)}</code>`;

function rich(key, parts = {}, params = {}) {
  return esc(t(key, params)).replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(parts, name) ? parts[name] : match));
}

const para = (html, cls = 'muted small') => `<p class="${cls}">${html}</p>`;

function codeBlock(before, highlighted, after, copyText, copyLabel) {
  return `<div class="stack-2">
    <pre class="guide-code"><code class="mono">${esc(before)}<span class="guide-highlight">${esc(highlighted)}</span>${esc(after)}</code></pre>
    <button type="button" class="btn" data-copy="${esc(copyText)}">${esc(copyLabel)}</button>
  </div>`;
}

function modelSection(model, firstKey) {
  const est = getPricing(model);
  const head = `<div class="row guide-model-head">${modalBadge(t('pricing.unpriced'), 'warn')}${code(model)}
    <span class="faint small">${esc(t('pricing.estimate', { input: est.input, output: est.output }))}</span></div>`;
  const key = suggestKey(model);
  let body;
  if (key) {
    const name = suggestName(key);
    const snippet = entrySnippet(key, name, estimatedRates(model));
    const before = '{\n\t"source": "https://platform.claude.com/docs/en/about-claude/pricing.md",\n\t"updatedAt": "...",\n\t"models": {\n';
    const after = `\t\t"${firstKey}": { ... },\n\t\t...\n\t}\n}`;
    body = `${para(rich('pricing.pasteEntry', { modelsLine: code('"models": {'), file: code('src/core/pricing.json') }))}
      ${codeBlock(before, snippet, after, snippet, t('pricing.copyEntry'))}`;
  } else {
    const snippet = aliasSnippet(model);
    const before = '\t"models": {\n\t\t...\n\t\t"sonnet-4-5": {\n\t\t\t"name": "Claude Sonnet 4.5",\n';
    const after = '\t\t\t"history": [ ... ]\n\t\t},\n\t\t...\n\t}';
    body = `${para(rich('pricing.pasteAlias', { aliases: code('aliases'), example: code('sonnet-4-5') }))}
      ${codeBlock(before, snippet, after, snippet, t('pricing.copyLine'))}`;
  }
  return `<div class="stack-2 guide-model">${head}${body}</div>`;
}

function fieldTable() {
  const rows = FIELD_COLUMNS.map(([field, key]) => `<tr><td>${code(field)}</td><td>${esc(t(key))}</td></tr>`).join('');
  return `<div class="table-scroll"><table class="tbl">
    <thead><tr><th>${esc(t('pricing.fieldHeader'))}</th><th>${esc(t('pricing.columnHeader'))}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

export function openPricingHelp() {
  const models = state.unpricedModels || [];
  const firstKey = PRICING[0] ? PRICING[0].id : 'fable-5-1';

  const link = `<a href="${PRICING_PAGE}" target="_blank" rel="noopener noreferrer">${esc(t('pricing.pageLink'))}</a>`;
  const intro = `${para(rich('pricing.intro', { file: code('src/core/pricing.json') }))}
    <div class="info set-note">${para(rich('pricing.listed', { link, command: code('npm run update:pricing') }), 'small')}</div>`;
  const sections = models.length
    ? models.map((model) => modelSection(model, firstKey)).join('')
    : para(esc(t('pricing.allPriced')));
  const where = `${para(esc(t('pricing.whereIntro')))}
    ${fieldTable()}
    ${para(rich('pricing.optional', { from: code('"from": "YYYY-MM-DD"'), tiers: code('tiers'), aliases: code('aliases') }), 'faint small')}`;
  const steps = `<ol class="muted small guide-steps">
    <li>${rich('pricing.stepCheck', { command: code('npm run check:pricing') })}</li>
    <li>${rich('pricing.stepBuild', { build: code('npm run build'), dev: code('npm run dev') })}</li>
    <li>${esc(t('pricing.stepCommit'))}</li>
  </ol>`;

  const box = openModal({
    title: t(models.length > 1 ? 'pricing.titleMany' : 'pricing.titleOne'),
    bodyHtml: `<div class="stack-4">${intro}${sections}${modalSection(t('pricing.where'), where)}${modalSection(t('pricing.then'), steps)}</div>`,
  });
  box.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy, t('pricing.copied')));
  });
}
