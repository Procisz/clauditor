import { state } from '../../core/state.js';
import { entryCost } from '../../core/config.js';
import { sessionType, sessionOrigin } from '../../core/parser.js';
import { domEl, domText, domCell, domClear, fmtNum, fmtMoney, fmtFixed, fmtInt, fmtDuration, shortPath, badgeClass, shortModelName, sessionName, buildPaginator, projectKey, projectName } from '../../core/utils.js';

const COLUMNS = [
  { key: 'name',   label: 'Session',    cls: '' },
  { key: 'date',   label: 'Started',    cls: '' },
  { key: 'type',   label: 'Type',       cls: '' },
  { key: 'origin', label: 'Source',     cls: '' },
  { key: 'effort', label: 'Effort',     cls: '' },
  { key: 'calls',  label: 'Calls',      cls: 'num' },
  { key: 'tokens', label: 'Tokens',     cls: 'num' },
  { key: 'cache',  label: 'Cache hit',  cls: 'num' },
  { key: 'cost',   label: 'Final Cost', cls: 'num' },
];

function typeBadgeClass(type) {
  if (type === 'Cowork') return 'badge-accent';
  if (type === 'Chat')   return 'badge-ghost';
  return 'badge-info';
}

export const EFFORT_RANK = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };

export function effortBadgeClass(level) {
  if (level === 'max')   return 'badge-error';
  if (level === 'xhigh') return 'badge-warning';
  if (level === 'high')  return 'badge-info';
  return 'badge-ghost';
}

function effortsSorted(effMap) {
  return [...effMap.entries()].sort((a, b) => (EFFORT_RANK[b[0]] || 0) - (EFFORT_RANK[a[0]] || 0));
}

const panelId = (ns, key) => ns + ':' + key;

function getPanel(ns, key) {
  const k = panelId(ns, key);
  if (!Object.prototype.hasOwnProperty.call(state.modelPanels, k)) {

    state.modelPanels[k] = { open: false, sortCol: 'date', sortDir: -1, pageSize: 5, pageIndex: 0 };
  }
  return state.modelPanels[k];
}

function isPanelOpen(ns, key) {
  const k = panelId(ns, key);
  return Object.prototype.hasOwnProperty.call(state.modelPanels, k) && !!state.modelPanels[k].open;
}

export const getModelPanel = (model) => getPanel('m', model);
export const isModelPanelOpen = (model) => isPanelOpen('m', model);
export const getProjectPanel = (key) => getPanel('p', key);
export const isProjectPanelOpen = (key) => isPanelOpen('p', key);

function sessionsWhere(entries, pred) {
  const map = new Map();
  for (const e of entries) {
    if (!pred(e)) continue;
    const key = e.sessionId || '(unknown)';
    if (!map.has(key)) map.set(key, { rawSid: e.sessionId, slug: e.slug, cwd: e.cwd, entrypoint: e.entrypoint, kind: e.sessionKind || 'code', minTs: e.ts, maxTs: e.ts, calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, base: 0, efforts: new Map(), effortUnknown: 0 });
    const s = map.get(key);
    if (e.slug && !s.slug) s.slug = e.slug;
    if (e.cwd && !s.cwd)   s.cwd  = e.cwd;
    if (e.entrypoint && !s.entrypoint) s.entrypoint = e.entrypoint;
    if (e.sessionKind === 'cowork') s.kind = 'cowork';
    if (e.effort) s.efforts.set(e.effort, (s.efforts.get(e.effort) || 0) + 1);
    else s.effortUnknown++;
    if (e.ts && (!s.minTs || e.ts < s.minTs)) s.minTs = e.ts;
    if (e.ts && e.ts > s.maxTs) s.maxTs = e.ts;
    s.calls++; s.input += e.input; s.output += e.output; s.cacheWrite += e.cacheWrite; s.cacheRead += e.cacheRead;
    s.base += entryCost(e);
  }
  const list = [...map.entries()].map(([key, s]) => {
    s.name = sessionName(s.rawSid, s.slug);
    s.tokens = s.input + s.output;
    const ctx = s.input + s.cacheRead + s.cacheWrite;
    s.cacheHit = ctx > 0 ? (s.cacheRead / ctx) * 100 : 0;
    s.type = sessionType(s.kind);
    s.origin = sessionOrigin(s.entrypoint);
    s.effortRank = Math.max(0, ...[...s.efforts.keys()].map(k => EFFORT_RANK[k] || 0));
    return s;
  });
  return list;
}

function sortSessions(list, p) {
  const col = p.sortDir === 0 ? 'date' : p.sortCol;
  const dir = p.sortDir === 0 ? -1 : p.sortDir;
  const cmp = {
    name:   (a, b) => a.name.localeCompare(b.name),
    date:   (a, b) => (a.minTs || '').localeCompare(b.minTs || ''),
    type:   (a, b) => a.type.localeCompare(b.type),
    origin: (a, b) => a.origin.localeCompare(b.origin),
    effort: (a, b) => a.effortRank - b.effortRank,
    calls:  (a, b) => a.calls - b.calls,
    tokens: (a, b) => a.tokens - b.tokens,
    cache:  (a, b) => a.cacheHit - b.cacheHit,
    cost:   (a, b) => a.base - b.base,
  }[col];
  list.sort((a, b) => {
    const r = cmp(a, b);
    return r !== 0 ? r * dir : a.name.localeCompare(b.name);
  });
}

function fmtDateTime(ts, opts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, opts || { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function buildModelSessionsRow(model, entries) { return buildSessionsRow('m', model, entries, 8); }
export function buildProjectSessionsRow(key, entries) { return buildSessionsRow('p', key, entries, 5); }

function buildSessionsRow(ns, key, entries, colSpan) {
  const tr = domEl('tr', 'model-sessions-row');
  const td = domEl('td');
  td.colSpan = colSpan;
  renderPanel(td, ns, key, entries);
  tr.appendChild(td);

  const p = getPanel(ns, key);
  const wrap = td.firstElementChild;
  if (p.justOpened) {
    p.justOpened = false;
    const openNow = () => wrap.classList.add('expand-open');
    requestAnimationFrame(() => requestAnimationFrame(openNow));
    setTimeout(openNow, 80);
  } else {
    wrap.classList.add('expand-open');
  }
  return tr;
}

export function collapsePanelRow(outerTr, done) {
  const panelRow = outerTr.nextElementSibling;
  const wrap = panelRow && panelRow.classList.contains('model-sessions-row')
    ? panelRow.querySelector('.expand-wrap') : null;
  if (!wrap) { done(); return; }
  wrap.classList.remove('expand-open');
  let fired = false;
  const finish = () => { if (!fired) { fired = true; done(); } };
  wrap.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 320);
}

function renderPanel(td, ns, key, entries) {

  let wrap = td.firstElementChild;
  let content;
  if (wrap && wrap.classList.contains('expand-wrap')) {
    content = wrap.firstElementChild;
    domClear(content);
  } else {
    domClear(td);
    wrap = domEl('div', 'expand-wrap');
    content = domEl('div', 'expand-content');
    wrap.appendChild(content);
    td.appendChild(wrap);
  }
  const p = getPanel(ns, key);
  const sessions = sessionsWhere(entries, ns === 'm' ? (e => e.model === key) : (e => projectKey(e) === key));
  sortSessions(sessions, p);

  const total = sessions.length;
  const maxPage = Math.max(0, Math.ceil(total / p.pageSize) - 1);
  if (p.pageIndex > maxPage) p.pageIndex = maxPage;
  const start = p.pageIndex * p.pageSize;
  const pageRows = sessions.slice(start, start + p.pageSize);

  const inner = domEl('div', 'model-sessions-inner');

  const caption = domEl('div', 'flex items-center gap-2 text-xs opacity-60 mb-1');
  if (ns === 'm') {
    caption.appendChild(domText('span', '', 'Sessions using'));
    caption.appendChild(domText('span', 'badge badge-sm ' + badgeClass(key), key));
  } else {
    caption.appendChild(domText('span', '', 'Sessions in'));
    caption.appendChild(domText('span', 'font-semibold opacity-90', projectName(key)));
  }
  caption.appendChild(domText('span', '', `— ${total} session${total !== 1 ? 's' : ''} · click a row for details`));
  inner.appendChild(caption);

  const tbl = domEl('table', 'table table-sm model-sessions-table');
  tbl.dataset.sortable = '';
  const thead = domEl('thead');
  const htr = domEl('tr');
  for (const col of COLUMNS) {
    const th = domEl('th', ('sortable ' + col.cls).trim());
    th.textContent = col.label;
    if (p.sortDir !== 0 && p.sortCol === col.key) th.classList.add(p.sortDir === 1 ? 'sort-asc' : 'sort-desc');
    th.onclick = () => {
      if (p.sortDir === 0 || p.sortCol !== col.key) { p.sortCol = col.key; p.sortDir = 1; }
      else if (p.sortDir === 1) p.sortDir = -1;
      else p.sortDir = 0;
      p.pageIndex = 0;
      renderPanel(td, ns, key, entries);
    };
    htr.appendChild(th);
  }
  thead.appendChild(htr);
  tbl.appendChild(thead);

  const tbody = domEl('tbody');
  if (pageRows.length === 0) {
    const etr = domEl('tr');
    const etd = domEl('td');
    etd.colSpan = COLUMNS.length;
    etd.className = 'text-center py-4 opacity-50';
    etd.textContent = 'No sessions';
    etr.appendChild(etd);
    tbody.appendChild(etr);
  }
  for (const s of pageRows) {
    const str = domEl('tr');
    const nameCell = domCell('session-name', s.name);
    nameCell.title = s.rawSid ? `${s.name}\n${s.rawSid}` : s.name;
    str.appendChild(nameCell);
    str.appendChild(domCell('', fmtDateTime(s.minTs)));
    const typeCell = domEl('td');
    typeCell.appendChild(domText('span', 'badge badge-sm whitespace-nowrap ' + typeBadgeClass(s.type), s.type));
    str.appendChild(typeCell);
    str.appendChild(domCell('whitespace-nowrap opacity-70', s.origin));
    const effCell = domEl('td', 'whitespace-nowrap');
    if (s.effortRank === 0) {
      effCell.textContent = '—';
      if (s.effortUnknown > 0) effCell.title = 'These log records predate the effort field';
    } else {
      const parts = effortsSorted(s.efforts);
      effCell.appendChild(domText('span', 'badge badge-sm ' + effortBadgeClass(parts[0][0]), parts[0][0]));
      if (parts.length > 1) {
        effCell.appendChild(domText('span', 'text-xs opacity-60 ml-1.5',
          parts.slice(1).map(([k, c]) => `${k} ×${fmtInt(c)}`).join(' · ')));
      }
      effCell.title = parts.map(([k, c]) => `${k}: ${fmtInt(c)} calls`).join('\n')
        + (s.effortUnknown > 0 ? `\nno effort data: ${fmtInt(s.effortUnknown)} calls` : '');
    }
    str.appendChild(effCell);
    str.appendChild(domCell('num', fmtNum(s.calls)));
    const tokCell = domCell('num', fmtNum(s.tokens));
    tokCell.title = `input ${fmtNum(s.input)} · output ${fmtNum(s.output)}`;
    str.appendChild(tokCell);
    const cacheCell = domCell('num', fmtFixed(s.cacheHit, 1) + '%');
    cacheCell.title = `${fmtNum(s.cacheRead)} tokens read from cache`;
    str.appendChild(cacheCell);
    str.appendChild(domCell('num', fmtMoney(s.base * state.markup, 4)));

    if (s.rawSid) str.onclick = () => openSessionModal(s.rawSid);
    else str.classList.add('no-detail');
    tbody.appendChild(str);
  }
  tbl.appendChild(tbody);
  inner.appendChild(tbl);

  inner.appendChild(buildPaginator(p, total, () => renderPanel(td, ns, key, entries)));

  content.appendChild(inner);
}

let modalEl = null;
let modalBox = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = domEl('dialog', 'modal');
  modalEl.id = 'session-modal';
  modalBox = domEl('div', 'modal-box w-11/12 max-w-3xl');
  modalEl.appendChild(modalBox);
  const backdrop = domEl('form', 'modal-backdrop');
  backdrop.method = 'dialog';
  const b = domEl('button');
  b.textContent = 'close';
  backdrop.appendChild(b);
  modalEl.appendChild(backdrop);
  document.body.appendChild(modalEl);
}

const BAR_COLORS = {
  input:      'rgba(108,142,245,.9)',
  output:     'rgba(167,139,250,.9)',
  cacheWrite: 'rgba(251,191,36,.9)',
  cacheRead:  'rgba(52,211,153,.9)',
};

function statCard(label, value, color, sub) {
  const card = domEl('div', 'rounded-box p-3');
  card.style.background = `color-mix(in oklch, var(--color-${color}) 12%, transparent)`;
  card.style.borderLeft = `3px solid var(--color-${color})`;
  card.appendChild(domText('div', 'text-xs opacity-60', label));
  card.appendChild(domText('div', 'text-lg font-bold', value));
  if (sub) card.appendChild(domText('div', 'text-xs opacity-50 mt-0.5', sub));
  return card;
}

function sectionTitle(text) {
  return domText('h4', 'text-xs font-semibold uppercase tracking-wide opacity-50 mt-5 mb-2', text);
}

function tokenBar(parts) {
  const totalTok = parts.reduce((sum, x) => sum + x.value, 0);
  const wrap = domEl('div');
  const bar = domEl('div', 'flex w-full rounded-full overflow-hidden');
  bar.style.height = '10px';
  bar.style.background = 'var(--color-base-300)';
  if (totalTok > 0) {
    for (const x of parts) {
      if (!x.value) continue;
      const seg = domEl('div');
      seg.style.width = (x.value / totalTok * 100) + '%';
      seg.style.background = x.color;
      seg.title = `${x.label}: ${fmtNum(x.value)} (${fmtFixed(x.value / totalTok * 100, 1)}%)`;
      bar.appendChild(seg);
    }
  }
  wrap.appendChild(bar);
  const legend = domEl('div', 'flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs');
  for (const x of parts) {
    const item = domEl('span', 'flex items-center gap-1.5');
    const dot = domEl('span', 'rounded-full inline-block');
    dot.style.cssText = `width:8px;height:8px;background:${x.color};`;
    item.appendChild(dot);
    item.appendChild(domText('span', 'opacity-70', `${x.label} ${fmtNum(x.value)}`));
    legend.appendChild(item);
  }
  wrap.appendChild(legend);
  return wrap;
}

function metaItem(label, value) {
  const div = domEl('div');
  div.appendChild(domText('div', 'opacity-50', label));
  div.appendChild(domText('div', 'font-medium', value));
  return div;
}

export function openSessionModal(sid) {
  if (!sid) return;
  ensureModal();
  const all = state.allEntries.filter(e => e.sessionId === sid);
  if (all.length === 0) return;
  const durations = state.allDurations.filter(d => d.sessionId === sid);

  const t = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, base: 0 };
  const models = new Map();
  const agents = new Map();
  const efforts = new Map();
  let effortUnknown = 0;
  let peakContext = 0;
  const days = new Set();
  let minTs = '', maxTs = '', slug = '', cwd = '', entrypoint = '', kind = 'code';
  for (const e of all) {
    t.calls++; t.input += e.input; t.output += e.output; t.cacheWrite += e.cacheWrite; t.cacheRead += e.cacheRead;
    const cost = entryCost(e);
    t.base += cost;
    if (!models.has(e.model)) models.set(e.model, { calls: 0, tokens: 0, base: 0 });
    const m = models.get(e.model);
    m.calls++; m.tokens += e.input + e.output; m.base += cost;
    const ag = e.agentType || 'main';
    if (!agents.has(ag)) agents.set(ag, { calls: 0, base: 0 });
    const a = agents.get(ag);
    a.calls++; a.base += cost;
    if (e.effort) {
      if (!efforts.has(e.effort)) efforts.set(e.effort, { calls: 0, base: 0 });
      const ef = efforts.get(e.effort);
      ef.calls++; ef.base += cost;
    } else {
      effortUnknown++;
    }
    const promptTokens = e.input + e.cacheRead + e.cacheWrite;
    if (promptTokens > peakContext) peakContext = promptTokens;
    if (e.date) days.add(e.date);
    if (e.ts && (!minTs || e.ts < minTs)) minTs = e.ts;
    if (e.ts && e.ts > maxTs) maxTs = e.ts;
    if (!slug && e.slug) slug = e.slug;
    if (!cwd && e.cwd) cwd = e.cwd;
    if (!entrypoint && e.entrypoint) entrypoint = e.entrypoint;
    if (e.sessionKind === 'cowork') kind = 'cowork';
  }
  const type = sessionType(kind);
  const origin = sessionOrigin(entrypoint);
  const name = sessionName(sid, slug);
  const wallMs = (minTs && maxTs) ? (new Date(maxTs) - new Date(minTs)) : 0;
  const ctx = t.input + t.cacheRead + t.cacheWrite;
  const cacheHit = ctx > 0 ? (t.cacheRead / ctx) * 100 : 0;
  let respSum = 0, respMax = 0;
  for (const d of durations) { respSum += d.durationMs; if (d.durationMs > respMax) respMax = d.durationMs; }
  const avgResp = durations.length ? respSum / durations.length : 0;
  let grandBase = 0;
  for (const e of state.allEntries) grandBase += entryCost(e);
  const share = grandBase > 0 ? (t.base / grandBase) * 100 : 0;

  domClear(modalBox);

  const head = domEl('div', 'flex items-start justify-between gap-3');
  const titleWrap = domEl('div', 'min-w-0');
  const h = domEl('h3', 'font-bold text-lg flex items-center gap-2 flex-wrap');
  h.appendChild(domText('span', '', name));
  h.appendChild(domText('span', 'badge badge-sm ' + typeBadgeClass(type), type + ' · ' + origin));
  for (const m of models.keys()) h.appendChild(domText('span', 'badge ' + badgeClass(m), shortModelName(m)));
  titleWrap.appendChild(h);
  const sidLine = domText('div', 'mono', (sid || '(no session id)') + (slug && name !== slug ? ' · ' + slug : ''));
  sidLine.style.wordBreak = 'break-all';
  titleWrap.appendChild(sidLine);
  if (cwd) titleWrap.appendChild(domText('div', 'text-xs opacity-60 mt-0.5', shortPath(cwd)));
  titleWrap.appendChild(domText('div', 'text-xs opacity-40 mt-0.5', 'Whole-session view — all models and agents, entire history'));
  head.appendChild(titleWrap);
  const closeBtn = domEl('button', 'btn btn-sm btn-circle btn-ghost shrink-0');
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.onclick = () => modalEl.close();
  head.appendChild(closeBtn);
  modalBox.appendChild(head);

  const grid = domEl('div', 'grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4');
  grid.appendChild(statCard('Final Cost', fmtMoney(t.base * state.markup, 4), 'primary',
    state.markup !== 1 ? `base ${fmtMoney(t.base, 4)} × ${state.markup}` : 'no markup applied'));
  grid.appendChild(statCard('API Calls', fmtNum(t.calls), 'secondary',
    durations.length ? `${fmtNum(durations.length)} turns` : ''));
  grid.appendChild(statCard('Tokens (in + out)', fmtNum(t.input + t.output), 'accent',
    `in ${fmtNum(t.input)} · out ${fmtNum(t.output)}`));
  grid.appendChild(statCard('Cache Hit Rate', fmtFixed(cacheHit, 1) + '%', 'success',
    `${fmtNum(t.cacheRead)} tokens from cache`));
  grid.appendChild(statCard('Duration', wallMs > 0 ? fmtDuration(wallMs) : '—', 'warning',
    days.size > 1 ? `across ${days.size} days` : 'single day'));
  grid.appendChild(statCard('Avg Response', avgResp > 0 ? fmtDuration(avgResp) : '—', 'info',
    respMax > 0 ? `slowest ${fmtDuration(respMax)}` : ''));
  modalBox.appendChild(grid);

  modalBox.appendChild(sectionTitle('Token Distribution'));
  modalBox.appendChild(tokenBar([
    { label: 'Input',       value: t.input,      color: BAR_COLORS.input },
    { label: 'Output',      value: t.output,     color: BAR_COLORS.output },
    { label: 'Cache write', value: t.cacheWrite, color: BAR_COLORS.cacheWrite },
    { label: 'Cache read',  value: t.cacheRead,  color: BAR_COLORS.cacheRead },
  ]));

  modalBox.appendChild(sectionTitle('Models'));
  const mtbl = domEl('table', 'table table-sm');
  const mhead = domEl('thead');
  const mhtr = domEl('tr');
  for (const [label, cls] of [['Model', ''], ['Calls', 'num'], ['Tokens', 'num'], ['Final Cost', 'num']]) {
    const th = domEl('th', cls); th.textContent = label; mhtr.appendChild(th);
  }
  mhead.appendChild(mhtr);
  mtbl.appendChild(mhead);
  const mbody = domEl('tbody');
  for (const [model, m] of [...models.entries()].sort((a, b) => b[1].base - a[1].base)) {
    const mtr = domEl('tr');
    const mtd = domEl('td');
    mtd.appendChild(domText('span', 'badge ' + badgeClass(model), model));
    mtr.appendChild(mtd);
    mtr.appendChild(domCell('num', fmtNum(m.calls)));
    mtr.appendChild(domCell('num', fmtNum(m.tokens)));
    mtr.appendChild(domCell('num', fmtMoney(m.base * state.markup, 4)));
    mbody.appendChild(mtr);
  }
  mtbl.appendChild(mbody);
  modalBox.appendChild(mtbl);

  if (agents.size > 1 || !agents.has('main')) {
    modalBox.appendChild(sectionTitle('Agents'));
    const arow = domEl('div', 'flex flex-wrap gap-2');
    for (const [ag, a] of [...agents.entries()].sort((x, y) => y[1].base - x[1].base)) {
      const chip = domEl('span', 'badge badge-outline gap-1.5 py-3');
      chip.appendChild(domText('span', 'font-semibold', ag));
      chip.appendChild(domText('span', 'opacity-60', `${fmtNum(a.calls)} calls · ${fmtMoney(a.base * state.markup, 4)}`));
      arow.appendChild(chip);
    }
    modalBox.appendChild(arow);
  }

  if (efforts.size > 0) {
    modalBox.appendChild(sectionTitle('Effort'));
    const erow = domEl('div', 'flex flex-wrap gap-2');
    for (const [level, ef] of effortsSorted(efforts)) {
      const chip = domEl('span', 'badge badge-outline gap-1.5 py-3');
      chip.appendChild(domText('span', 'badge badge-sm ' + effortBadgeClass(level), level));
      chip.appendChild(domText('span', 'opacity-60', `${fmtNum(ef.calls)} calls · ${fmtMoney(ef.base * state.markup, 4)}`));
      erow.appendChild(chip);
    }
    if (effortUnknown > 0) {
      const chip = domEl('span', 'badge badge-outline gap-1.5 py-3 opacity-60');
      chip.textContent = `no data: ${fmtNum(effortUnknown)} calls`;
      chip.title = 'These log records predate the effort field';
      erow.appendChild(chip);
    }
    modalBox.appendChild(erow);
  }

  modalBox.appendChild(sectionTitle('Timeline'));
  const meta = domEl('div', 'grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-xs');
  meta.appendChild(metaItem('Started', fmtDateTime(minTs)));
  meta.appendChild(metaItem('Last activity', fmtDateTime(maxTs)));
  meta.appendChild(metaItem('Type', type));
  meta.appendChild(metaItem('Source', origin));
  meta.appendChild(metaItem('Active days', String(days.size)));
  meta.appendChild(metaItem('Cache write', fmtNum(t.cacheWrite) + ' tokens'));
  meta.appendChild(metaItem('Base cost', fmtMoney(t.base, 4)));
  meta.appendChild(metaItem('Share of total spend', fmtFixed(share, 2) + '%'));
  if (peakContext > 0) {

    const win = peakContext > 200_000 ? 1_000_000 : 200_000;
    const ctxItem = metaItem('Peak context use',
      `${fmtNum(peakContext)} · ~${fmtFixed(peakContext / win * 100, 1)}% of ${fmtNum(win)}`);
    ctxItem.title = 'Largest single prompt of the session (input + cache read + cache write). '
      + 'The window size is an estimate: 200K assumed, 1M when the peak exceeds 200K.';
    meta.appendChild(ctxItem);
  }
  modalBox.appendChild(meta);

  modalEl.showModal();
}
