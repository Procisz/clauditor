// ─────────────────────────────────────────────
// OVERVIEW — model and projects tables
// ─────────────────────────────────────────────
import { state } from '../../core/state.js';
import { calcCost } from '../../core/config.js';
import { domEl, domText, domCell, domClear, fmtNum, shortPath, badgeClass, applySortHeaders } from '../../core/utils.js';

export function renderModelTable(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.model)) map.set(e.model, { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, base: 0 });
    const m = map.get(e.model);
    m.calls++;
    m.input      += e.input;
    m.output     += e.output;
    m.cacheWrite += e.cacheWrite;
    m.cacheRead  += e.cacheRead;
    m.base       += calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model);
  }

  const rows = [...map.entries()].sort((a, b) => b[1].base - a[1].base);
  if ((state.tableSortDirs['table-models'] || -1) === 1) rows.reverse();
  applySortHeaders('table-models');
  const tbody = document.querySelector('#table-models tbody');
  domClear(tbody);
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 8; td.textContent = 'No data'; td.className = 'text-center py-5 opacity-50';
    tr.appendChild(td); tbody.appendChild(tr);
  }
  for (const [model, d] of rows) {
    const tr = document.createElement('tr');
    const badge = domText('span', 'badge ' + badgeClass(model), model);
    const td0 = document.createElement('td'); td0.appendChild(badge);
    tr.appendChild(td0);
    for (const [text, cls] of [
      [fmtNum(d.calls), 'num'], [fmtNum(d.input), 'num'], [fmtNum(d.output), 'num'],
      [fmtNum(d.cacheWrite), 'num'], [fmtNum(d.cacheRead), 'num'],
      ['$' + d.base.toFixed(4), 'num'], ['$' + (d.base * state.markup).toFixed(4), 'num'],
    ]) tr.appendChild(domCell(cls, text));
    tbody.appendChild(tr);
  }
}

export function renderProjectsTable(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = e.cwd || '(unknown)';
    if (!map.has(key)) map.set(key, { sessions: new Set(), calls: 0, base: 0 });
    const p = map.get(key);
    p.sessions.add(e.sessionId);
    p.calls++;
    p.base += calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model);
  }

  const rows = [...map.entries()].sort((a, b) => b[1].base - a[1].base);
  if ((state.tableSortDirs['table-projects'] || -1) === 1) rows.reverse();
  const rows20 = rows.slice(0, 20);
  applySortHeaders('table-projects');
  const tbody = document.querySelector('#table-projects tbody');
  domClear(tbody);
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 5; td.textContent = 'No data'; td.className = 'text-center py-5 opacity-50';
    tr.appendChild(td); tbody.appendChild(tr);
  }
  for (const [cwd, d] of rows20) {
    const tr = document.createElement('tr');
    tr.appendChild(domCell('mono', shortPath(cwd)));
    for (const [text, cls] of [
      [String(d.sessions.size), 'num'], [fmtNum(d.calls), 'num'],
      ['$' + d.base.toFixed(4), 'num'], ['$' + (d.base * state.markup).toFixed(4), 'num'],
    ]) tr.appendChild(domCell(cls, text));
    tbody.appendChild(tr);
  }
}
