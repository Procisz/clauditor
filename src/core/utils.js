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
export function showDashboard()   { document.getElementById('dashboard').style.display = 'block'; }
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

export function fmtDuration(ms) {
  if (ms <= 0) return '—';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return h + 'h ' + m + 'm';
  const s = Math.round((ms % 60000) / 1000);
  return m + 'm ' + s + 's';
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
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function shortPath(p) {
  const home = p.match(/^\/[^/]+\/[^/]+/) || p.match(/^[A-Z]:\\Users\\[^\\]+/);
  if (home) return p.replace(home[0], '~');
  return p.length > 60 ? '…' + p.slice(-60) : p;
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
  const ths = table.querySelectorAll('thead th');
  const sortCol = state.tableSortCols[tableId] !== undefined ? state.tableSortCols[tableId] : ths.length - 1;
  ths.forEach((th, i) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (i === sortCol) { th.classList.toggle('sort-asc', dir === 1); th.classList.toggle('sort-desc', dir === -1); }
  });
}
