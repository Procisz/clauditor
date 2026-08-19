import { state } from '../../core/state.js';
import { entryCost } from '../../core/config.js';
import { domEl, domText, domCell, domClear, fmtNum, fmtMoney, fmtInt, badgeClass, applySortHeaders, buildPaginator, projectKey, projectName } from '../../core/utils.js';
import { getModelPanel, isModelPanelOpen, buildModelSessionsRow, getProjectPanel, isProjectPanelOpen, buildProjectSessionsRow, collapsePanelRow, EFFORT_RANK } from './model-sessions.js';

export function renderModelTable(entries) {
  const totalEl = document.getElementById('model-sessions-total');
  if (totalEl) {
    const inRange = new Set(entries.map(e => e.sessionId || '(unknown)')).size;
    const allTime = new Set(state.allEntries.map(e => e.sessionId || '(unknown)')).size;
    totalEl.textContent = 'Sessions in total: ' + fmtInt(inRange)
      + (allTime !== inRange ? ` · all time: ${fmtInt(allTime)}` : '');
    totalEl.title = allTime !== inRange
      ? `${allTime - inRange} older session${allTime - inRange !== 1 ? 's' : ''} hidden by the date range filter — widen "from" above to include them`
      : '';
  }
  const effortEl = document.getElementById('model-effort-mix');
  if (effortEl) {
    const eff = new Map();
    let noEffort = 0;
    for (const e of entries) {
      if (e.effort) eff.set(e.effort, (eff.get(e.effort) || 0) + 1);
      else noEffort++;
    }
    if (eff.size === 0) {
      effortEl.textContent = '';
    } else {
      const parts = [...eff.entries()].sort((a, b) => (EFFORT_RANK[b[0]] || 0) - (EFFORT_RANK[a[0]] || 0))
        .map(([k, c]) => `${k} ${fmtNum(c)}`);
      effortEl.textContent = '· effort: ' + parts.join(' · ');
      effortEl.title = 'Calls per reasoning-effort level in the current date range'
        + (noEffort > 0 ? ` (${fmtNum(noEffort)} calls have no effort data — older log records)` : '');
    }
  }

  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.model)) map.set(e.model, { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, base: 0 });
    const m = map.get(e.model);
    m.calls++;
    m.input      += e.input;
    m.output     += e.output;
    m.cacheWrite += e.cacheWrite;
    m.cacheRead  += e.cacheRead;
    m.base       += entryCost(e);
  }

  const sortCol = state.tableSortCols['table-models'];
  const sortDir = state.tableSortDirs['table-models'] || 0;
  const rows = [...map.entries()];
  if (sortDir === 0 || sortCol === undefined) {
    rows.sort((a, b) => b[1].base - a[1].base);
  } else {
    const val = ([model, d]) => [model.toLowerCase(), d.calls, d.input, d.output, d.cacheWrite, d.cacheRead, d.base, d.base * state.markup][sortCol];
    rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      const r = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return r !== 0 ? r * sortDir : b[1].base - a[1].base;
    });
  }
  applySortHeaders('table-models');
  const tbody = document.querySelector('#table-models tbody');
  domClear(tbody);
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 8; td.textContent = 'No data'; td.className = 'text-center py-5 opacity-50';
    tr.appendChild(td); tbody.appendChild(tr);
  }
  for (const [model, d] of rows) {
    const tr = domEl('tr', 'model-row');
    const td0 = document.createElement('td');
    td0.appendChild(domText('span', 'model-chevron', isModelPanelOpen(model) ? '▾' : '▸'));
    td0.appendChild(domText('span', 'badge ' + badgeClass(model), model));
    tr.appendChild(td0);
    for (const [text, cls] of [
      [fmtNum(d.calls), 'num'], [fmtNum(d.input), 'num'], [fmtNum(d.output), 'num'],
      [fmtNum(d.cacheWrite), 'num'], [fmtNum(d.cacheRead), 'num'],
      [fmtMoney(d.base, 4), 'num'], [fmtMoney(d.base * state.markup, 4), 'num'],
    ]) tr.appendChild(domCell(cls, text));
    tr.onclick = () => {
      const p = getModelPanel(model);
      if (p.open) {
        p.open = false;
        collapsePanelRow(tr, () => renderModelTable(entries));
      } else {
        p.open = true;
        p.justOpened = true;
        renderModelTable(entries);
      }
    };
    tbody.appendChild(tr);
    if (isModelPanelOpen(model)) tbody.appendChild(buildModelSessionsRow(model, entries));
  }
}

export function renderProjectsTable(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = projectKey(e);
    if (!map.has(key)) map.set(key, { sessions: new Set(), calls: 0, base: 0 });
    const p = map.get(key);
    p.sessions.add(e.sessionId);
    p.calls++;
    p.base += entryCost(e);
  }

  const sortCol = state.tableSortCols['table-projects'];
  const sortDir = state.tableSortDirs['table-projects'] || 0;
  const rows = [...map.entries()];
  if (sortDir === 0 || sortCol === undefined) {
    rows.sort((a, b) => b[1].base - a[1].base);
  } else {
    const val = ([key, d]) => [projectName(key).toLowerCase(), d.sessions.size, d.calls, d.base, d.base * state.markup][sortCol];
    rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      const r = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return r !== 0 ? r * sortDir : b[1].base - a[1].base;
    });
  }
  applySortHeaders('table-projects');

  const p = state.projectsPage;
  const maxPage = Math.max(0, Math.ceil(rows.length / p.pageSize) - 1);
  if (p.pageIndex > maxPage) p.pageIndex = maxPage;
  const pageRows = rows.slice(p.pageIndex * p.pageSize, p.pageIndex * p.pageSize + p.pageSize);

  const tbody = document.querySelector('#table-projects tbody');
  domClear(tbody);
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 5; td.textContent = 'No data'; td.className = 'text-center py-5 opacity-50';
    tr.appendChild(td); tbody.appendChild(tr);
  }
  for (const [key, d] of pageRows) {
    const tr = domEl('tr', 'project-row');
    const td0 = document.createElement('td');
    td0.appendChild(domText('span', 'model-chevron', isProjectPanelOpen(key) ? '▾' : '▸'));
    td0.appendChild(domText('span', 'session-name font-medium', projectName(key)));
    td0.title = key.startsWith('cowork:') ? 'Cowork task' : key;
    tr.appendChild(td0);
    for (const [text, cls] of [
      [String(d.sessions.size), 'num'], [fmtNum(d.calls), 'num'],
      [fmtMoney(d.base, 4), 'num'], [fmtMoney(d.base * state.markup, 4), 'num'],
    ]) tr.appendChild(domCell(cls, text));
    tr.onclick = () => {
      const p = getProjectPanel(key);
      if (p.open) {
        p.open = false;
        collapsePanelRow(tr, () => renderProjectsTable(entries));
      } else {
        p.open = true;
        p.justOpened = true;
        renderProjectsTable(entries);
      }
    };
    tbody.appendChild(tr);
    if (isProjectPanelOpen(key)) tbody.appendChild(buildProjectSessionsRow(key, entries));
  }
  const pagerHost = document.getElementById('projects-paginator');
  if (pagerHost) {
    domClear(pagerHost);
    pagerHost.appendChild(buildPaginator(p, rows.length, () => renderProjectsTable(entries)));
  }
}
