// ─────────────────────────────────────────────
// TODAY — projects table
// ─────────────────────────────────────────────
import { state } from '../../core/state.js';
import { calcCost } from '../../core/config.js';
import { domEl, domCell, domClear, fmtNum, shortPath, applySortHeaders, fmtMoney } from '../../core/utils.js';

export function renderTodayProjectsTable(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = e.cwd || '(unknown)';
    if (!map.has(key)) map.set(key, { sessions: new Set(), calls: 0, base: 0 });
    const p = map.get(key);
    p.sessions.add(e.sessionId); p.calls++;
    p.base += calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model);
  }

  const rows = [...map.entries()].sort((a, b) => b[1].base - a[1].base);
  if ((state.tableSortDirs['table-today-projects'] || -1) === 1) rows.reverse();
  applySortHeaders('table-today-projects');
  const tbody = document.querySelector('#table-today-projects tbody');
  domClear(tbody);
  if (rows.length === 0) {
    const tr = domEl('tr');
    const td = domEl('td'); td.colSpan = 5; td.className = 'text-center py-5 opacity-50';
    td.textContent = 'No project activity today'; tr.appendChild(td); tbody.appendChild(tr);
  } else {
    for (const [cwd, d] of rows) {
      const tr = domEl('tr');
      tr.appendChild(domCell('mono', shortPath(cwd)));
      tr.appendChild(domCell('num', String(d.sessions.size)));
      tr.appendChild(domCell('num', fmtNum(d.calls)));
      tr.appendChild(domCell('num', fmtMoney(d.base, 4)));
      tr.appendChild(domCell('num', fmtMoney(d.base * state.markup, 4)));
      tbody.appendChild(tr);
    }
  }
}
