import { state } from '../../core/state.js';
import { entryCost } from '../../core/config.js';
import { getFilteredEntries } from '../../core/parser.js';
import { getWeekKey, getMonthKey } from '../../core/dates.js';
import { domEl, domCell, domClear, fmtNum, fmtMoney, shortPath, sessionName } from '../../core/utils.js';

export function showDetail(bucketKey) {

  const entries = getFilteredEntries().filter(e => {
    if (state.view === 'daily')   return e.date === bucketKey;
    if (state.view === 'weekly')  return getWeekKey(e.date) === bucketKey;
    return getMonthKey(e.date) === bucketKey;
  });

  const map = new Map();
  for (const e of entries) {
    const key = e.sessionId || '(unknown)';
    if (!map.has(key)) map.set(key, { slug: e.slug, cwd: e.cwd, calls: 0, input: 0, output: 0, cacheRead: 0, base: 0 });
    const s = map.get(key);
    s.calls++;
    s.input    += e.input;
    s.output   += e.output;
    s.cacheRead += e.cacheRead;
    s.base     += entryCost(e);
  }

  const viewLabel = state.view === 'weekly' ? 'week of ' : state.view === 'monthly' ? '' : '';
  document.getElementById('detail-title').textContent = `Sessions — ${viewLabel}${bucketKey}`;

  const rows = [...map.entries()].sort((a, b) => b[1].base - a[1].base);
  const tbody = document.querySelector('#table-detail tbody');
  domClear(tbody);
  if (rows.length === 0) {
    const tr = domEl('tr');
    const td = domEl('td');
    td.colSpan = 8;
    td.className = 'text-center py-5 opacity-50';
    td.textContent = 'No sessions';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const [sid, d] of rows) {
      const tr = domEl('tr');
      const nm = sessionName(sid === '(unknown)' ? '' : sid, d.slug);
      const slugCell = domCell('mono session-name', nm);
      slugCell.title = nm + '\n' + sid;
      tr.appendChild(slugCell);
      tr.appendChild(domCell('mono', shortPath(d.cwd || '—')));
      tr.appendChild(domCell('num', fmtNum(d.calls)));
      tr.appendChild(domCell('num', fmtNum(d.input)));
      tr.appendChild(domCell('num', fmtNum(d.output)));
      tr.appendChild(domCell('num', fmtNum(d.cacheRead)));
      tr.appendChild(domCell('num', fmtMoney(d.base)));
      tr.appendChild(domCell('num', fmtMoney(d.base * state.markup)));
      tbody.appendChild(tr);
    }
  }

  const panel = document.getElementById('detail-panel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function closeDetail() {
  document.getElementById('detail-panel').style.display = 'none';
}
