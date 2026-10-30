import { icon } from './icons.js';
import { esc, tipDot } from './dom.js';
import { t, getLocale } from '../i18n/index.js';

export const PAGE_SIZES = [5, 10, 25, 50, 100];
const ROWS_KEY = 'clauditor_table_rows';
const EXPAND_MS = 250;

let seq = 0;
const configs = new Map();

function tableKey(el, columns, sizeId = '') {
  const page = el.closest('[data-page]')?.dataset.page ?? 'modal';
  return `${page}:${columns.map((c) => c.key).join('.')}${sizeId ? `:${sizeId}` : ''}`;
}

function storedSizes() {
  try {
    const all = JSON.parse(localStorage.getItem(ROWS_KEY) ?? '{}');
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

function storedSize(key) {
  const v = storedSizes()[key];
  return PAGE_SIZES.includes(v) ? v : null;
}

function rememberSize(key, size) {
  try {
    localStorage.setItem(ROWS_KEY, JSON.stringify({ ...storedSizes(), [key]: size }));
  } catch {}
}

function attach(st, el) {
  st.el = el;
  st.sizeKey = tableKey(el, st.columns, st.sizeId);
  st.page.pageSize = storedSize(st.sizeKey) ?? st.page.pageSize;
}

export const cell = (v, html) => ({ v, html: html ?? (v == null ? '-' : esc(v)) });

export function dataTable({ span = 6, color = '', iconId = '', title, sub = '', columns, rows, pageSize = 5, defaultSort = null, tip = '', expand = null, onRowClick = null, actions = '', filter = null, sizeId = '' }) {
  for (const [id, st] of configs) {
    if (st.el && !st.el.isConnected) configs.delete(id);
  }
  const id = `dt-${++seq}`;
  configs.set(id, {
    columns, rows, expand, filter, sizeId,
    onRowClick: expand ? null : onRowClick,
    open: new Set((expand?.defaultOpen ?? []).map(String)),
    sort: defaultSort ? { ...defaultSort } : null,
    page: { pageSize, pageIndex: 0 },
    query: '',
    el: null,
  });
  scheduleHydrate(id);
  return `<div class="card" data-span="${span}"${color ? ` data-accent style="--c:${esc(color)}"` : ''}>
    <div class="card-head">
      ${iconId ? `<span class="icon-chip">${icon(iconId)}</span>` : ''}
      <div>
        <h2 class="card-title">${esc(title)}${tipDot(tip)}</h2>
        ${sub ? `<div class="card-sub">${sub}</div>` : ''}
      </div>
      ${actions ? `<div class="card-actions">${actions}</div>` : ''}
    </div>
    <div class="card-body tight"><div class="dtable" id="${id}"></div></div>
  </div>`;
}

function scheduleHydrate(id) {
  queueMicrotask(() => {
    const st = configs.get(id);
    if (!st) return;
    const el = document.getElementById(id);
    if (!el) {
      requestAnimationFrame(() => {
        const el2 = document.getElementById(id);
        if (el2) {
          attach(st, el2);
          renderTable(st);
        } else {
          configs.delete(id);
        }
      });
      return;
    }
    attach(st, el);
    renderTable(st);
  });
}

function cmp(a, b) {
  const aNull = a == null || a === '';
  const bNull = b == null || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return -1;
  if (bNull) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), getLocale());
}

function sortedRows(rows, sort) {
  if (!sort?.key) return rows;
  const dirMul = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => cmp(a[sort.key]?.v, b[sort.key]?.v) * dirMul);
}

function nextSort(current, key) {
  if (current?.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

function headHtml(columns, sort) {
  return columns.map((c) => {
    const sortable = c.sortable !== false;
    const active = sort?.key === c.key;
    const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '';
    const ariaSort = sortable ? ` aria-sort="${active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : '';
    return `<th class="${c.num ? 'num ' : ''}${c.wrap ? 'th-wrap ' : ''}${sortable ? 'th-sort' : ''}" data-key="${esc(c.key)}"${ariaSort}
      ${sortable ? 'tabindex="0"' : ''}>${esc(c.label)}${arrow ? `<span class="th-arrow" aria-hidden="true">${arrow}</span>` : ''}</th>`;
  }).join('');
}

function renderTable(st) {
  if (st.closing?.size) {
    for (const id of st.closing) st.open.delete(id);
    st.closing.clear();
  }
  const { columns, sort, page, el, expand } = st;
  const unfilteredTotal = st.rows.length;
  const rows = sortedRows(applyFilter(st.rows, st), sort);
  const total = rows.length;
  const maxPage = Math.max(0, Math.ceil(total / page.pageSize) - 1);
  page.pageIndex = Math.min(page.pageIndex, maxPage);
  const start = page.pageIndex * page.pageSize;
  const visible = rows.slice(start, start + page.pageSize);
  const colCount = columns.length + (expand ? 1 : 0);
  st.visible = visible;

  el.innerHTML = `
    ${st.filter ? filterBarHtml(st) : ''}
    <div class="table-scroll"><table class="tbl">
      <thead><tr>${expand ? '<th class="th-chevron" aria-hidden="true"></th>' : ''}${headHtml(columns, sort)}</tr></thead>
      <tbody>${visible.length
        ? visible.map((r, i) => rowHtml(st, r, i)).join('')
        : `<tr><td colspan="${colCount}" class="muted">${esc(noRowsText(st, unfilteredTotal))}</td></tr>`}</tbody>
    </table></div>
    ${pagerHtml(page, total, start, maxPage, st.query ? unfilteredTotal : null)}`;

  const own = (node) => !node.closest('.dt-panel-content');

  if (expand) {
    for (const tr of [...el.querySelectorAll('tr.dt-row')].filter(own)) {
      const rowId = tr.dataset.rowId;
      tr.onclick = () => toggleExpand(st, rowId);
      tr.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleExpand(st, rowId);
        }
      };
    }
    for (const host of el.querySelectorAll('.dt-panel-content')) {
      const rowId = host.dataset.rowId;
      const row = st.visible.find((r) => String(expand.key(r)) === rowId);
      if (row) expand.render(row, host);
      const wrap = host.parentElement;
      requestAnimationFrame(() => wrap.classList.add('expand-open'));
    }
  }

  if (st.onRowClick) {
    for (const tr of el.querySelectorAll('tbody tr.dt-click')) {
      const row = st.visible[Number(tr.dataset.i)];
      if (!row) continue;
      tr.onclick = () => st.onRowClick(row);
      tr.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          st.onRowClick(row);
        }
      };
    }
  }

  if (st.filter) wireFilter(el, st, () => renderTable(st), own);

  for (const th of [...el.querySelectorAll('th.th-sort')].filter(own)) {
    const key = th.dataset.key;
    const toggle = () => {
      st.sort = nextSort(st.sort, key);
      renderTable(st);
    };
    th.onclick = toggle;
    th.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };
  }

  const sizeEl = [...el.querySelectorAll('.dt-size')].filter(own)[0];
  if (sizeEl) {
    sizeEl.onchange = (e) => {
      const firstItem = page.pageIndex * page.pageSize;
      page.pageSize = parseInt(e.target.value, 10);
      page.pageIndex = Math.floor(firstItem / page.pageSize);
      rememberSize(st.sizeKey, page.pageSize);
      renderTable(st);
    };
  }
  for (const btn of [...el.querySelectorAll('.dt-nav button')].filter(own)) {
    btn.onclick = () => {
      page.pageIndex = Number(btn.dataset.p);
      renderTable(st);
    };
  }
}

function rowHtml(st, r, i) {
  const { columns, expand } = st;
  const cells = columns.map((c) => `<td class="${c.num ? 'num' : ''}">${r[c.key]?.html ?? '-'}</td>`).join('');
  if (!expand) {
    return st.onRowClick
      ? `<tr class="dt-click" data-i="${i}" role="button" tabindex="0">${cells}</tr>`
      : `<tr>${cells}</tr>`;
  }
  const rowId = esc(String(expand.key(r)));
  const isOpen = st.open.has(String(expand.key(r)));
  const colCount = columns.length + 1;
  return `<tr class="dt-row${isOpen ? ' dt-row-open' : ''}" data-row-id="${rowId}"
      role="button" tabindex="0" aria-expanded="${isOpen}">
      <td class="dt-chevron" aria-hidden="true">${isOpen ? '▾' : '▸'}</td>${cells}</tr>`
    + (isOpen
      ? `<tr class="dt-panel-row"><td colspan="${colCount}">
          <div class="expand-wrap"><div class="dt-panel-content" data-row-id="${rowId}"></div></div>
        </td></tr>`
      : '');
}

function toggleExpand(st, rowId) {
  const notify = (open) => st.expand?.onToggle?.(rowId, open);

  if (st.closing?.has(rowId)) {
    st.closing.delete(rowId);
    notify(true);
    renderTable(st);
    return;
  }

  if (!st.open.has(rowId)) {
    st.open.add(rowId);
    notify(true);
    renderTable(st);
    return;
  }

  st.closing ??= new Set();
  const host = [...st.el.querySelectorAll('.dt-panel-content')]
    .find((h) => h.dataset.rowId === rowId);
  const wrap = host?.parentElement;
  if (!wrap) {
    st.open.delete(rowId);
    notify(false);
    renderTable(st);
    return;
  }

  st.closing.add(rowId);
  notify(false);
  wrap.classList.remove('expand-open');

  const row = [...st.el.querySelectorAll('tr.dt-row')].find((tr) => tr.dataset.rowId === rowId);
  if (row) {
    row.classList.remove('dt-row-open');
    row.setAttribute('aria-expanded', 'false');
    const chev = row.querySelector('.dt-chevron');
    if (chev) chev.textContent = '▸';
  }

  let timer;
  const finish = () => {
    clearTimeout(timer);
    wrap.removeEventListener('transitionend', onEnd);
    if (!st.closing.has(rowId)) return;
    st.closing.delete(rowId);
    st.open.delete(rowId);
    renderTable(st);
  };
  const onEnd = (e) => {
    if (e.target === wrap && e.propertyName === 'grid-template-rows') finish();
  };
  wrap.addEventListener('transitionend', onEnd);

  timer = setTimeout(finish, EXPAND_MS + 80);
}

export function subTable(host, { caption = '', columns, rows, pageSize = 5, defaultSort = null, onRowClick = null, filter = null }) {
  const st = host._sub ?? (host._sub = {
    sort: defaultSort ? { ...defaultSort } : null,
    sizeKey: tableKey(host, columns),
    page: { pageSize: storedSize(tableKey(host, columns)) ?? pageSize, pageIndex: 0 },
    query: '',
  });
  st.columns = columns;
  st.rows = rows;
  st.onRowClick = onRowClick;
  st.caption = caption;
  st.filter = filter;
  renderSub(host, st);
}

const foldText = (s) => String(s)
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

const stripTags = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ');

const compactText = (s) => foldText(s).replace(/[^a-z0-9]+/g, '');

function searchableOf(row, keys) {
  const parts = keys.flatMap((k) => [String(row[k]?.v ?? ''), stripTags(row[k]?.html)]);
  return { plain: foldText(parts.join(' ')), compact: parts.map(compactText).filter(Boolean) };
}

function applyFilter(rows, st) {
  const keys = st.filter?.keys;
  const q = foldText(st.query).trim();
  if (!keys?.length || !q) return rows;

  const words = q.split(/\s+/).map((w) => ({ plain: w, compact: compactText(w) }));
  return rows.filter((r) => {
    const hay = searchableOf(r, keys);
    return words.every((w) =>
      hay.plain.includes(w.plain) || (w.compact && hay.compact.some((part) => part.includes(w.compact))));
  });
}

function renderSub(host, st) {
  const { columns, sort, page } = st;
  const unfilteredTotal = st.rows.length;
  const rows = sortedRows(applyFilter(st.rows, st), sort);
  const total = rows.length;
  const maxPage = Math.max(0, Math.ceil(total / page.pageSize) - 1);
  page.pageIndex = Math.min(page.pageIndex, maxPage);
  const start = page.pageIndex * page.pageSize;
  const visible = rows.slice(start, start + page.pageSize);

  const captionHtml = typeof st.caption === 'function'
    ? st.caption(total, unfilteredTotal)
    : st.caption;

  host.innerHTML = `
    <div class="sub-inner">
      ${captionHtml ? `<div class="sub-caption">${captionHtml}</div>` : ''}
      ${st.filter ? filterBarHtml(st) : ''}
      <div class="table-scroll"><table class="tbl sub-tbl">
        <thead><tr>${headHtml(columns, sort)}</tr></thead>
        <tbody>${visible.length
          ? visible.map((r, i) => `<tr data-i="${start + i}"${st.onRowClick ? ' role="button" tabindex="0"' : ''}>${columns
              .map((c) => `<td class="${c.num ? 'num' : ''}">${r[c.key]?.html ?? '-'}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${columns.length}" class="muted">${esc(noRowsText(st, unfilteredTotal))}</td></tr>`}</tbody>
      </table></div>
      ${pagerHtml(page, total, start, maxPage, st.query ? unfilteredTotal : null)}
    </div>`;

  host.onclick = (e) => e.stopPropagation();

  if (st.filter) wireFilter(host, st, () => renderSub(host, st));

  for (const th of host.querySelectorAll('th.th-sort')) {
    const key = th.dataset.key;
    const toggle = () => {
      st.sort = nextSort(st.sort, key);
      st.page.pageIndex = 0;
      renderSub(host, st);
    };
    th.onclick = toggle;
    th.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };
  }
  host.querySelector('.dt-size').onchange = (e) => {
    const firstItem = page.pageIndex * page.pageSize;
    page.pageSize = parseInt(e.target.value, 10);
    page.pageIndex = Math.floor(firstItem / page.pageSize);
    rememberSize(st.sizeKey, page.pageSize);
    renderSub(host, st);
  };
  for (const btn of host.querySelectorAll('.dt-nav button')) {
    btn.onclick = () => {
      page.pageIndex = Number(btn.dataset.p);
      renderSub(host, st);
    };
  }
  if (st.onRowClick) {
    for (const tr of host.querySelectorAll('tbody tr[data-i]')) {
      const row = rows[Number(tr.dataset.i)];
      tr.onclick = () => st.onRowClick(row);
      tr.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          st.onRowClick(row);
        }
      };
    }
  }
}

function pagerHtml(page, total, start, maxPage, unfilteredTotal = null) {
  const range = t('common.ofTotal', { from: total === 0 ? 0 : start + 1, to: Math.min(start + page.pageSize, total), total });
  const counts = unfilteredTotal == null ? range : t('common.inTotal', { range, total: unfilteredTotal });
  const atStart = page.pageIndex === 0 ? 'disabled' : '';
  const atEnd = page.pageIndex >= maxPage ? 'disabled' : '';
  return `<div class="dt-pager">
      <span>${esc(t('common.rows'))}</span>
      <select class="dt-size" aria-label="${esc(t('common.rowsPerPage'))}">
        ${PAGE_SIZES.map((n) => `<option value="${n}" ${n === page.pageSize ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <span>${esc(counts)}</span>
      <span class="dt-nav">
        <button type="button" data-p="0" ${atStart} aria-label="${esc(t('common.firstPage'))}">«</button>
        <button type="button" data-p="${page.pageIndex - 1}" ${atStart} aria-label="${esc(t('common.previousPage'))}">‹</button>
        <button type="button" data-p="${page.pageIndex + 1}" ${atEnd} aria-label="${esc(t('common.nextPage'))}">›</button>
        <button type="button" data-p="${maxPage}" ${atEnd} aria-label="${esc(t('common.lastPage'))}">»</button>
      </span>
    </div>`;
}

function noRowsText(st, unfilteredTotal) {
  if (!st.query || !unfilteredTotal) return t('common.noData');
  return st.filter?.emptyText ?? t('common.noMatches');
}

function wireFilter(scope, st, rerender, own = () => true) {
  const input = [...scope.querySelectorAll('.sub-filter-input')].filter(own)[0];
  if (!input) return;

  const commit = (value, caret) => {
    st.query = value;
    st.page.pageIndex = 0;
    st.restoreFocus = { caret };
    rerender();
  };
  input.oninput = () => commit(input.value, input.selectionStart);

  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' && st.query) {
      e.preventDefault();
      commit('', 0);
    }
  };
  const clear = [...scope.querySelectorAll('.sub-filter-clear')].filter(own)[0];
  if (clear) clear.onclick = () => commit('', 0);

  if (st.restoreFocus) {
    const caret = st.restoreFocus.caret ?? input.value.length;
    st.restoreFocus = null;
    input.focus();
    try { input.setSelectionRange(caret, caret); } catch {}
  }
}

function filterBarHtml(st) {
  const { placeholder = t('common.search') } = st.filter;
  const value = st.query;
  const clearLabel = esc(t('common.clearSearch'));
  return `<div class="sub-filter">
    <div class="sub-filter-box">
      <span class="sub-filter-icon">${icon('i-search')}</span>
      <input type="text" class="sub-filter-input" value="${esc(value)}"
        placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"
        autocomplete="off" spellcheck="false">
      ${value
        ? `<button type="button" class="sub-filter-clear" aria-label="${clearLabel}" title="${clearLabel}">${icon('i-x')}</button>`
        : ''}
    </div>
  </div>`;
}
