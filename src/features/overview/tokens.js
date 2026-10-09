import { state } from '../../core/state.js';
import { entryCostByType, cacheWrite5m, cacheWrite1h } from '../../core/config.js';
import { domEl, domText, domCell, domClear, fmtNum, fmtInt, fmtMoney, fmtFixed, tokenBar, BAR_COLORS } from '../../core/utils.js';

const TYPES = [
  { key: 'input',        label: 'Input',            color: BAR_COLORS.input,        tokens: e => e.input || 0 },
  { key: 'output',       label: 'Output',           color: BAR_COLORS.output,       tokens: e => e.output || 0 },
  { key: 'cacheWrite5m', label: 'Cache write · 5m', color: BAR_COLORS.cacheWrite,   tokens: e => cacheWrite5m(e) },
  { key: 'cacheWrite1h', label: 'Cache write · 1h', color: BAR_COLORS.cacheWrite1h, tokens: e => cacheWrite1h(e) },
  { key: 'cacheRead',    label: 'Cache read',       color: BAR_COLORS.cacheRead,    tokens: e => e.cacheRead || 0 },
];

export function renderTokenUsage(entries) {
  const host = document.getElementById('token-usage');
  if (!host) return;
  domClear(host);

  const tok = Object.fromEntries(TYPES.map(t => [t.key, 0]));
  const cost = Object.fromEntries(TYPES.map(t => [t.key, 0]));
  let calls = 0;
  for (const e of entries) {
    calls++;
    const c = entryCostByType(e);
    for (const t of TYPES) { tok[t.key] += t.tokens(e); cost[t.key] += c[t.key]; }
  }
  const totalTok = TYPES.reduce((s, t) => s + tok[t.key], 0);
  const totalCost = TYPES.reduce((s, t) => s + cost[t.key], 0) * state.markup;

  const top = domEl('div', 'flex flex-col sm:flex-row sm:items-end gap-4');
  const headline = domEl('div', 'shrink-0');
  headline.appendChild(domText('div', 'text-3xl font-bold tabular-nums leading-tight', fmtInt(totalTok)));
  headline.appendChild(domText('div', 'text-xs opacity-50 mt-0.5',
    totalTok > 0 ? `≈ ${fmtNum(totalTok)} tokens across ${fmtInt(calls)} API calls` : 'No usage loaded'));
  top.appendChild(headline);
  const barWrap = domEl('div', 'grow min-w-0');
  barWrap.appendChild(tokenBar(TYPES.map(t => ({ label: t.label, value: tok[t.key], color: t.color }))));
  top.appendChild(barWrap);
  host.appendChild(top);

  const wrap = domEl('div', 'overflow-x-auto mt-1');
  const table = domEl('table', 'table table-sm');
  const thead = domEl('thead');
  const htr = domEl('tr');
  for (const [label, cls] of [['Token type', ''], ['Tokens', 'num'], ['Share', 'num'], ['Final Cost', 'num'], ['Cost share', 'num']]) {
    htr.appendChild(domText('th', cls, label));
  }
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = domEl('tbody');
  for (const t of [...TYPES].sort((a, b) => cost[b.key] - cost[a.key])) {
    const tr = domEl('tr');
    const td0 = domEl('td');
    const dot = domEl('span', 'rounded-full inline-block mr-2 align-middle');
    dot.style.cssText = `width:8px;height:8px;background:${t.color};`;
    td0.appendChild(dot);
    td0.appendChild(domText('span', '', t.label));
    tr.appendChild(td0);
    const share = totalTok > 0 ? tok[t.key] / totalTok * 100 : 0;
    const cshare = totalCost > 0 ? cost[t.key] * state.markup / totalCost * 100 : 0;
    const tokCell = domCell('num', fmtInt(tok[t.key]));
    tokCell.title = fmtNum(tok[t.key]) + ' tokens';
    tr.appendChild(tokCell);
    tr.appendChild(domCell('num', fmtFixed(share, 1) + '%'));
    tr.appendChild(domCell('num', fmtMoney(cost[t.key] * state.markup)));
    tr.appendChild(domCell('num', fmtFixed(cshare, 1) + '%'));
    tbody.appendChild(tr);
  }
  const total = domEl('tr', 'font-semibold border-t border-base-300');
  total.appendChild(domCell('', 'Total'));
  total.appendChild(domCell('num', fmtInt(totalTok)));
  total.appendChild(domCell('num', totalTok > 0 ? '100%' : '-'));
  total.appendChild(domCell('num', fmtMoney(totalCost)));
  total.appendChild(domCell('num', totalCost > 0 ? '100%' : '-'));
  tbody.appendChild(total);
  table.appendChild(tbody);
  wrap.appendChild(table);
  host.appendChild(wrap);
}
