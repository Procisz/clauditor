import { state } from './state.js';
import { tipDot } from '../ui/dom.js';
import { t } from '../i18n/index.js';

const SCREENS = ['start', 'loading', 'dashboard'];
let screenListener = null;

export function setScreenListener(fn) { screenListener = fn; }

export function currentScreen() { return document.body.dataset.screen || ''; }

export function setScreen(name) {
  document.body.dataset.screen = name;
  const panels = { start: 'welcome', loading: 'loading', dashboard: 'dashboard' };
  for (const screen of SCREENS) {
    const el = document.getElementById(panels[screen]);
    if (el) el.hidden = screen !== name;
  }
  screenListener?.(name);
}

export function showLoading(msg) {
  setScreen('loading');
  setLoadingText(msg);
}
export function setLoadingText(text) { document.getElementById('loading-text').textContent = text; }
export function hideLoading() {
  document.getElementById('loading').hidden = true;
  if (currentScreen() === 'loading') {
    document.body.dataset.screen = '';
    screenListener?.('');
  }
}
export function showDashboard()   { setScreen('dashboard'); }
export function showError(msg) {
  const el = document.getElementById('error-banner');
  el.querySelector('.banner-text').textContent = msg;
  el.hidden = false;
}
export function hideError()       { document.getElementById('error-banner').hidden = true; }

const DISMISSALS_KEY = 'clauditor_dismissals';
const LEGACY_DISMISSED_MODELS_KEY = 'clauditor_dismissed_models';

function monthFromNow() { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.getTime(); }

function writeDismissals(map) {
  try { localStorage.setItem(DISMISSALS_KEY, JSON.stringify(map)); } catch {}
}

function readDismissals() {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(DISMISSALS_KEY)) || {}; } catch {}

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_DISMISSED_MODELS_KEY));
    if (Array.isArray(legacy)) {
      for (const m of legacy) { if (!(('pricing:' + m) in map)) map['pricing:' + m] = monthFromNow(); }
      localStorage.removeItem(LEGACY_DISMISSED_MODELS_KEY);
      writeDismissals(map);
    }
  } catch {}

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

export function initDismissableNote(elId, key) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (key in readDismissals()) { el.hidden = true; return; }
  const btn = el.querySelector('.note-close');
  if (btn) btn.onclick = () => { dismissForAMonth(key); el.hidden = true; };
}

export function updateCoworkWarning() {
  const el = document.getElementById('cowork-warning');
  if (!el) return;
  const hasCowork = !!(state.srcCowork && state.srcCowork.entries.length > 0);
  el.hidden = hasCowork;
  const btn = document.getElementById('cowork-warning-close');
  if (btn) btn.onclick = () => { el.hidden = true; };
}

export function updatePricingWarning(unknownModels) {
  const el = document.getElementById('pricing-warning');
  if (!el) return;
  const dismissals = readDismissals();
  const toShow = (unknownModels || []).filter(m => !(('pricing:' + m) in dismissals));
  state.unpricedModels = toShow;
  if (toShow.length === 0) { el.hidden = true; return; }
  document.getElementById('pricing-warning-text').textContent = t('shell.pricingWarning', { models: toShow.join(', ') });
  document.getElementById('pricing-warning-close').onclick = () => {
    dismissForAMonth(toShow.map(m => 'pricing:' + m));
    el.hidden = true;
  };
  el.hidden = false;
}

export function fmtFixed(v, decimals = 0) {
  const neg = v < 0;
  const [int, frac] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, state.thousandsSep);
  return (neg ? '-' : '') + grouped + (frac !== undefined ? state.decimalSep + frac : '');
}
export function fmtMoney(v) { return '$' + fmtFixed(v, state.moneyDecimals); }
export function fmtInt(n) { return fmtFixed(n, 0); }

export function fmtDuration(ms) {
  if (ms <= 0) return '-';
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
  if (n >= 1_000_000_000) return fmtFixed(n / 1_000_000_000, 2) + 'B';
  if (n >= 1_000_000)     return fmtFixed(n / 1_000_000, 1) + 'M';
  if (n >= 1_000)         return fmtFixed(n / 1_000, 1) + 'K';
  return String(n);
}

export function sessionName(sid, slug) {
  return state.sessionTitles.get(sid) || slug || (sid ? sid.slice(0, 8) : t('shell.unknown'));
}

export function projectKey(e) {
  if (e.sessionKind === 'cowork') return 'cowork:' + (e.sessionId || '(unknown)');
  return e.cwd || '(unknown)';
}

export function projectName(key) {
  if (key.startsWith('cowork:')) return sessionName(key.slice(7), '');
  if (key === '(unknown)') return t('shell.unknown');
  const parts = key.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || key;
}

export function shortPath(p) {
  const home = p.match(/^\/[^/]+\/[^/]+/) || p.match(/^[A-Z]:\\Users\\[^\\]+/);
  if (home) return p.replace(home[0], '~');
  return p.length > 60 ? '…' + p.slice(-60) : p;
}

export function domEl(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
export function domText(tag, cls, text) { const e = domEl(tag, cls); e.textContent = text; return e; }
export function domClear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

let _toastHost = null;
function getToastHost() {
  if (!_toastHost || !_toastHost.isConnected) {
    _toastHost = document.createElement('div');
    _toastHost.className = 'toast-host';
    _toastHost.setAttribute('role', 'status');
    _toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(_toastHost);
  }
  return _toastHost;
}

export function showToast(message, kind = 'success', ms = 2200) {
  const host = getToastHost();
  for (const prev of host.querySelectorAll('.toast')) {
    if (prev.textContent === message) prev.remove();
  }
  const el = domText('div', 'toast', message);
  el.dataset.kind = kind;
  host.appendChild(el);
  const remove = () => el.remove();
  setTimeout(() => {
    el.addEventListener('transitionend', remove, { once: true });
    el.classList.add('toast-out');
    setTimeout(remove, 600);
  }, ms);
  return el;
}

async function writeClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export async function copyToClipboard(text, label = t('shell.copied')) {
  const ok = await writeClipboard(text);
  showToast(ok ? label : t('shell.copyFailed'), ok ? 'success' : 'error');
  return ok;
}

export function initPathCopy(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.addEventListener('click', e => {
    const btn = e.target.closest('.path-copy');
    if (!btn || !root.contains(btn)) return;
    copyToClipboard(btn.textContent.trim(), t('shell.pathCopied'));
  });
}

export function tokenBar(parts) {
  const totalTok = parts.reduce((sum, x) => sum + x.value, 0);
  const wrap = domEl('div', 'mbar-wrap');
  const bar = domEl('div', 'mbar');
  if (totalTok > 0) {
    for (const x of parts) {
      if (!x.value) continue;
      const seg = domEl('span', 'mbar-seg');
      seg.style.width = (x.value / totalTok * 100) + '%';
      seg.style.background = x.color;
      seg.title = `${x.label}: ${fmtNum(x.value)} (${fmtFixed(x.value / totalTok * 100, 1)}%)`;
      bar.appendChild(seg);
    }
  }
  wrap.appendChild(bar);
  const legend = domEl('div', 'mbar-legend');
  for (const x of parts) {
    const item = domEl('span', 'mbar-item');
    const dot = domEl('span', 'mbar-dot');
    dot.style.background = x.color;
    item.appendChild(dot);
    item.appendChild(domText('span', '', `${x.label} ${fmtNum(x.value)}`));
    legend.appendChild(item);
  }
  wrap.appendChild(legend);
  return wrap;
}

export function cacheWriteSplitTitle(total, oneHour) {
  const fiveMin = Math.max(0, total - oneHour);
  if (total === 0) return t('shell.noCacheWrites');
  return t('shell.cacheWriteSplit', { oneHour: fmtNum(oneHour), fiveMin: fmtNum(fiveMin) });
}

export function shortModelName(model) {
  const m = (model || '').toLowerCase();
  if (m.includes('fable'))  return 'fable';
  if (m.includes('mythos')) return 'mythos';
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku'))  return 'haiku';
  return (model || '').slice(0, 12);
}

const DEFAULT_MONEY_DECIMALS = 2;
export function clampDecimals(v) {
  if (v === '' || v === null || v === undefined) return DEFAULT_MONEY_DECIMALS;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(8, Math.max(0, n)) : DEFAULT_MONEY_DECIMALS;
}
