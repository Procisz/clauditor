// ─────────────────────────────────────────────
// UI HELPERS — DOM utilities, formatters, shared model helpers
// ─────────────────────────────────────────────
import { state } from './state.js';

export function showLoading(msg) {
  document.getElementById('welcome').style.display   = 'none';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loading').style.display   = 'flex';
  setLoadingText(msg);
}
export function setLoadingText(t) { document.getElementById('loading-text').textContent = t; }
export function hideLoading()     { document.getElementById('loading').style.display = 'none'; }
export function showDashboard()   { document.getElementById('welcome').style.display = 'none'; document.getElementById('dashboard').style.display = 'block'; }
export function showError(msg)    { const el = document.getElementById('error-banner'); el.style.display = 'flex'; el.textContent = msg; }
export function hideError()       { document.getElementById('error-banner').style.display = 'none'; }

// ─── Dismissal store ─────────────────────────
// Shared by every dismissable warning/error banner. Closing a banner
// suppresses it for ONE MONTH, tracked independently per key — after the
// month it warns again. Keys are namespaced per banner type (e.g.
// 'pricing:<model>'); any new dismissable warning or error should reuse
// dismissForAMonth()/readDismissals() with its own namespace prefix.
const DISMISSALS_KEY = 'clauditor_dismissals';   // { "<key>": <expiryEpochMs> }
const LEGACY_DISMISSED_MODELS_KEY = 'clauditor_dismissed_models';

function monthFromNow() { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.getTime(); }

function writeDismissals(map) {
  try { localStorage.setItem(DISMISSALS_KEY, JSON.stringify(map)); } catch {}
}

function readDismissals() {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(DISMISSALS_KEY)) || {}; } catch {}
  // Migrate the short-lived dismissed-forever array format to 1-month entries
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_DISMISSED_MODELS_KEY));
    if (Array.isArray(legacy)) {
      for (const m of legacy) { if (!(('pricing:' + m) in map)) map['pricing:' + m] = monthFromNow(); }
      localStorage.removeItem(LEGACY_DISMISSED_MODELS_KEY);
      writeDismissals(map);
    }
  } catch {}
  // Prune expired entries so suppression ends and the store can't grow forever
  const now = Date.now();
  let changed = false;
  for (const [k, exp] of Object.entries(map)) {
    if (!(exp > now)) { delete map[k]; changed = true; }
  }
  if (changed) writeDismissals(map);
  return map;
}

export function dismissForAMonth(keys) {
  const map = readDismissals();
  for (const k of [].concat(keys)) map[k] = monthFromNow();
  writeDismissals(map);
}

// Wire a static always-rendered note (with a .note-close button inside) to the
// dismissal store: hidden while its key is suppressed, ✕ dismisses for a month
export function initDismissableNote(elId, key) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (key in readDismissals()) { el.style.display = 'none'; return; }
  const btn = el.querySelector('.note-close');
  if (btn) btn.onclick = () => { dismissForAMonth(key); el.style.display = 'none'; };
}

// ─── Cowork-missing warning banner ───────────
// Deliberately NOT wired to the one-month dismissal store: per product
// decision this warning re-appears on every dashboard presentation while no
// Cowork data is loaded — ✕ only hides it until the next present.
export function updateCoworkWarning() {
  const el = document.getElementById('cowork-warning');
  if (!el) return;
  const hasCowork = !!(state.srcCowork && state.srcCowork.entries.length > 0);
  el.style.display = hasCowork ? 'none' : 'flex';
  const btn = document.getElementById('cowork-warning-close');
  if (btn) btn.onclick = () => { el.style.display = 'none'; };
}

// ─── Pricing warning banner ──────────────────
// Shown after load when entries reference models missing from the PRICING
// table — their costs are computed at default (sonnet) rates and likely wrong.
export function updatePricingWarning(unknownModels) {
  const el = document.getElementById('pricing-warning');
  if (!el) return;
  const dismissals = readDismissals();
  const toShow = (unknownModels || []).filter(m => !(('pricing:' + m) in dismissals));
  if (toShow.length === 0) { el.style.display = 'none'; return; }
  document.getElementById('pricing-warning-text').textContent =
    'Unknown model pricing: ' + toShow.join(', ')
    + ' — costs for these are estimated at default rates. Add entries in src/core/config.js.';
  document.getElementById('pricing-warning-close').onclick = () => {
    dismissForAMonth(toShow.map(m => 'pricing:' + m));
    el.style.display = 'none';
  };
  el.style.display = 'flex';
}

// ─── Number formatting ───────────────────────
// Every user-visible number goes through these; the separators are
// configurable (persisted via main.js) and default to "1,234.56".
// Chart series data and CSV exports stay raw — machine formats.
export function fmtFixed(v, decimals = 0) {
  const neg = v < 0;
  const [int, frac] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, state.thousandsSep);
  return (neg ? '-' : '') + grouped + (frac !== undefined ? state.decimalSep + frac : '');
}
export function fmtMoney(v, decimals = 4) { return '$' + fmtFixed(v, decimals); }
export function fmtInt(n) { return fmtFixed(n, 0); }

// Human-readable duration: the two most significant units, zero remainders
// dropped. Calendar-ish approximations: 1w = 7d, 1mo = 30d, 1y = 365d.
export function fmtDuration(ms) {
  if (ms <= 0) return '—';
  if (ms < 60000) return fmtFixed(ms / 1000, 1) + 's';
  const MIN = 60000, H = 3600000, D = 24 * H, W = 7 * D, MO = 30 * D, Y = 365 * D;
  const two = (v1, u1, v2, u2) => v2 > 0 ? `${v1}${u1} ${v2}${u2}` : `${v1}${u1}`;
  if (ms < H)  return two(Math.floor(ms / MIN), 'm', Math.round((ms % MIN) / 1000), 's');
  if (ms < D)  return two(Math.floor(ms / H), 'h', Math.floor((ms % H) / MIN), 'm');
  if (ms < W)  return two(Math.floor(ms / D), 'd', Math.floor((ms % D) / H), 'h');
  if (ms < MO) return two(Math.floor(ms / W), 'w', Math.floor((ms % W) / D), 'd');
  if (ms < Y)  return two(Math.floor(ms / MO), 'mo', Math.floor((ms % MO) / D), 'd');
  return two(Math.floor(ms / Y), 'y', Math.floor((ms % Y) / MO), 'mo');
}

export function calcSessionTime(entries) {
  const bounds = new Map();
  for (const e of entries) {
    if (!e.ts || !e.sessionId) continue;
    const t = new Date(e.ts).getTime();
    if (!Number.isFinite(t)) continue;
    const b = bounds.get(e.sessionId);
    if (!b) bounds.set(e.sessionId, { min: t, max: t });
    else { if (t < b.min) b.min = t; if (t > b.max) b.max = t; }
  }
  let total = 0;
  for (const b of bounds.values()) total += b.max - b.min;
  return total;
}

export function fmtNum(n) {
  if (n >= 1_000_000) return fmtFixed(n / 1_000_000, 1) + 'M';
  if (n >= 1_000)     return fmtFixed(n / 1_000, 1) + 'K';
  return String(n);
}

// Display name for a session: user-facing title (the Desktop sidebar name,
// from custom-title records) → auto-generated slug → session id prefix
export function sessionName(sid, slug) {
  return state.sessionTitles.get(sid) || slug || (sid ? sid.slice(0, 8) : '(unknown)');
}

// ─── Project identity ────────────────────────
// Code sessions group by working directory; every Cowork task is its own
// project (its internal cwd points into the app's store and is meaningless).
export function projectKey(e) {
  if (e.sessionKind === 'cowork') return 'cowork:' + (e.sessionId || '(unknown)');
  return e.cwd || '(unknown)';
}

export function projectName(key) {
  if (key.startsWith('cowork:')) return sessionName(key.slice(7), '');
  if (key === '(unknown)') return '(unknown)';
  const parts = key.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || key;
}

export function shortPath(p) {
  const home = p.match(/^\/[^/]+\/[^/]+/) || p.match(/^[A-Z]:\\Users\\[^\\]+/);
  if (home) return p.replace(home[0], '~');
  return p.length > 60 ? '…' + p.slice(-60) : p;
}

// ─── Shared Material-style paginator ─────────
// p is a mutable {pageSize, pageIndex} state object; rerender is called after
// every interaction. Callers clamp pageIndex before slicing their rows.
export const PAGE_SIZES = [5, 10, 25, 50, 100];

export function buildPaginator(p, total, rerender) {
  const maxPage = Math.max(0, Math.ceil(total / p.pageSize) - 1);
  const start = p.pageIndex * p.pageSize;
  const pager = domEl('div', 'model-paginator flex items-center justify-end flex-wrap gap-x-4 gap-y-1 text-xs pt-2');
  pager.appendChild(domText('span', 'opacity-60', 'Rows per page:'));
  const sel = domEl('select', 'select select-xs w-18');
  sel.setAttribute('aria-label', 'Rows per page');
  for (const n of PAGE_SIZES) {
    const o = domEl('option');
    o.value = String(n);
    o.textContent = String(n);
    if (n === p.pageSize) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => {
    const firstItem = p.pageIndex * p.pageSize;
    p.pageSize = parseInt(sel.value, 10);
    p.pageIndex = Math.floor(firstItem / p.pageSize);  // keep the first visible item visible
    rerender();
  };
  pager.appendChild(sel);
  pager.appendChild(domText('span', 'opacity-60',
    total === 0 ? '0 of 0' : `${start + 1}–${Math.min(start + p.pageSize, total)} of ${total}`));
  const nav = domEl('div', 'flex items-center');
  const mkNav = (txt, label, disabled, page) => {
    const b = domEl('button', 'btn btn-ghost btn-xs btn-square');
    b.textContent = txt;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.disabled = disabled;
    b.onclick = () => { p.pageIndex = page; rerender(); };
    return b;
  };
  nav.appendChild(mkNav('«', 'First page',    p.pageIndex === 0,      0));
  nav.appendChild(mkNav('‹', 'Previous page', p.pageIndex === 0,      p.pageIndex - 1));
  nav.appendChild(mkNav('›', 'Next page',     p.pageIndex >= maxPage, p.pageIndex + 1));
  nav.appendChild(mkNav('»', 'Last page',     p.pageIndex >= maxPage, maxPage));
  pager.appendChild(nav);
  return pager;
}

// DOM helpers — safe by construction, no innerHTML needed
export function domEl(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
export function domText(tag, cls, text) { const e = domEl(tag, cls); e.textContent = text; return e; }
export function domCell(cls, text) { return domText('td', cls, text); }
export function domClear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

let _floatTip = null;
function getFloatTip() {
  if (!_floatTip) {
    _floatTip = document.createElement('div');
    _floatTip.style.cssText = 'position:fixed;z-index:9999;max-width:260px;padding:6px 10px;border-radius:6px;font-size:11px;line-height:1.5;pointer-events:none;display:none;white-space:normal;word-break:break-word;';
    _floatTip.className = 'bg-neutral text-neutral-content shadow-lg';
    document.body.appendChild(_floatTip);
  }
  return _floatTip;
}

export function makeInfoIcon(tipText) {
  const span = document.createElement('span');
  span.textContent = 'ⓘ';
  const baseOpacity = '0.6';
  span.style.cssText = `cursor:help;opacity:${baseOpacity};font-size:12px;line-height:1;transition:opacity 0.15s;`;
  span.addEventListener('mouseenter', e => {
    const tip = getFloatTip();
    tip.textContent = tipText;
    tip.style.display = 'block';
    requestAnimationFrame(() => positionTip(tip, e));
    span.style.opacity = '1';
  });
  span.addEventListener('mousemove', e => positionTip(getFloatTip(), e));
  span.addEventListener('mouseleave', () => {
    getFloatTip().style.display = 'none';
    span.style.opacity = baseOpacity;
  });
  return span;
}

function positionTip(tip, e) {
  const pad = 12;
  const tw = tip.offsetWidth || 260;
  const th = tip.offsetHeight || 60;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + tw > window.innerWidth  - pad) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight - pad) y = e.clientY - th - pad;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

export function badgeClass(model) {
  const m = model.toLowerCase();
  if (m.includes('opus'))   return 'badge-secondary';
  if (m.includes('haiku'))  return 'badge-success';
  return 'badge-primary';
}

export function shortModelName(model) {
  const m = (model || '').toLowerCase();
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku'))  return 'haiku';
  return model.slice(0, 12);
}

export function applySortHeaders(tableId) {
  const dir = state.tableSortDirs[tableId] || -1;
  const table = document.getElementById(tableId);
  if (!table) return;
  // :scope > thead — expansion panels nest their own sortable tables inside
  // tbody; a bare 'thead th' selector would match those headers too
  const ths = table.querySelectorAll(':scope > thead th');
  const sortCol = state.tableSortCols[tableId] !== undefined ? state.tableSortCols[tableId] : ths.length - 1;
  ths.forEach((th, i) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (i === sortCol) { th.classList.toggle('sort-asc', dir === 1); th.classList.toggle('sort-desc', dir === -1); }
  });
}
