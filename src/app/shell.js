import { state } from '../core/state.js';
import { getFilteredEntries } from '../core/parser.js';
import { todayKey } from '../core/dates.js';
import { activeQuickId, quickPeriods } from '../core/periods.js';
import { inRange, previousRange } from '../core/metrics.js';
import { currentScreen, setScreenListener } from '../core/utils.js';
import { refreshData, showSources } from '../core/folder.js';
import { applyStaticTexts, getLocale, t } from '../i18n/index.js';
import { EVENTS } from './events.js';
import { activate, buildNav, currentPage, initRouter, onActivate, pageFromLocation, panelOf, registerPage, relabelNav } from './router.js';
import { exportCsv } from './export.js';
import { openSettings } from './settings.js';
import { openSessionModal } from '../components/session-modal.js';
import { destroyChartsIn, replayCharts } from '../ui/charts.js';
import { emptyState } from '../ui/dom.js';
import { scheduleFit } from '../ui/fit.js';
import { icon, injectIcons } from '../ui/icons.js';
import { rebinder } from '../ui/listen.js';

const DATE_FROM_KEY = 'clauditor_date_from';
const FILTERS_KEY = 'clauditor_filters';
const QUICK_IDS = ['all', 'prevMonth', 'curMonth', 'prevYear', 'curYear'];

const bindEvents = rebinder();
let dataReady = false;
let filtersOpen = true;

const byId = (id) => document.getElementById(id);

export function currentRange() {
  const to = byId('date-to')?.value || todayKey();
  const from = byId('date-from')?.value || state.autoDateFrom || to;
  return { from, to, view: state.view };
}

export function pageContext() {
  const range = currentRange();
  const previous = previousRange(range);
  return {
    entries: getFilteredEntries(),
    allEntries: state.allEntries,
    durations: state.allDurations,
    range,
    previous: {
      ...previous,
      entries: previous.from ? inRange(state.allEntries, previous) : [],
    },
    markup: state.markup,
    budget: state.budget,
    today: todayKey(),
    rerender: () => renderActive({ force: true }),
    openSession: (sessionId) => openSessionModal(sessionId, state.allEntries, state.allDurations),
  };
}

export function markAllDirty() {
  state.renderedPages.clear();
}

export function renderActive({ force = false } = {}) {
  const page = currentPage();
  if (!page || !dataReady || currentScreen() !== 'dashboard') return;
  if (!force && state.renderedPages.has(page.id)) return;
  const mount = panelOf(page.id);
  if (!mount) return;
  destroyChartsIn(mount);
  mount.replaceChildren();
  try {
    page.render(mount, pageContext());
    state.renderedPages.add(page.id);
  } catch (err) {
    console.error(`Page render failed (${page.id}):`, err);
    mount.innerHTML = emptyState({ iconId: 'i-warn', message: t('shell.pageFailed', { message: err.message }) });
  }
  scheduleFit(mount);
}

function formatDay(key) {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));
}

function syncCaption() {
  const caption = byId('period-caption');
  if (!caption) return;
  const previous = previousRange(currentRange());
  caption.textContent = previous.from ? t('shell.comparedWith', { from: formatDay(previous.from), to: formatDay(previous.to) }) : '';
}

function syncChrome(screen = currentScreen()) {
  const onDashboard = screen === 'dashboard';
  const usesRange = onDashboard && Boolean(currentPage()?.usesRange);
  const nav = byId('page-nav');
  const bar = byId('period-bar');
  const toggle = byId('filter-toggle');
  if (nav) nav.hidden = !onDashboard;
  if (bar) {
    bar.hidden = !usesRange;
    bar.classList.toggle('is-closed', !filtersOpen);
    bar.querySelector('.period-inner')?.toggleAttribute('inert', !filtersOpen);
  }
  if (toggle) toggle.hidden = !usesRange;
}

function loadFiltersOpen() {
  try {
    return localStorage.getItem(FILTERS_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function saveFiltersOpen() {
  try {
    localStorage.setItem(FILTERS_KEY, filtersOpen ? 'open' : 'closed');
  } catch {}
}

function syncFilterToggle() {
  const btn = byId('filter-toggle');
  if (!btn) return;
  const label = t(filtersOpen ? 'shell.filtersHide' : 'shell.filtersShow');
  btn.innerHTML = icon(filtersOpen ? 'i-filter' : 'i-filter-off');
  btn.setAttribute('aria-expanded', String(filtersOpen));
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function onFilterToggle() {
  filtersOpen = !filtersOpen;
  saveFiltersOpen();
  syncFilterToggle();
  syncChrome();
}

function quickBounds() {
  let max = '';
  for (const e of state.allEntries) if (e.date > max) max = e.date;
  return { today: todayKey(), min: state.autoDateFrom || '', max };
}

function formatQuickDate(key, options) {
  return new Intl.DateTimeFormat(getLocale(), { timeZone: 'UTC', ...options }).format(new Date(`${key}T00:00:00Z`));
}

function quickSubline({ id, from, to }, today) {
  if (id === 'curMonth' || id === 'prevMonth') return formatQuickDate(from, { month: 'short', year: 'numeric' });
  if (id === 'curYear' || id === 'prevYear') return formatQuickDate(from, { year: 'numeric' });
  const currentYear = today.slice(0, 4);
  const part = (key) => formatQuickDate(key, key.slice(0, 4) === currentYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  return `${part(from)} - ${part(to)}`;
}

function syncQuicks() {
  const host = byId('period-quicks');
  if (!host) return;
  if (!host.children.length) {
    for (const id of QUICK_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'period-quick';
      btn.dataset.quick = id;
      btn.append(document.createElement('span'), document.createElement('small'));
      host.append(btn);
    }
  }
  const bounds = quickBounds();
  const periods = quickPeriods(bounds);
  const active = activeQuickId(periods, currentRange());
  for (const period of periods) {
    const btn = host.querySelector(`[data-quick="${period.id}"]`);
    if (!btn) continue;
    const label = t(`shell.quick.${period.id}`);
    btn.firstElementChild.textContent = label;
    btn.lastElementChild.textContent = period.has ? quickSubline(period, bounds.today) : '';
    btn.disabled = !period.has || (period.id === 'all' && active === 'all');
    btn.setAttribute('aria-pressed', String(period.has && period.id === active));
    btn.title = period.has
      ? t('shell.quickTip', { label, from: formatDay(period.from), to: formatDay(period.to) })
      : t('shell.quickEmpty', { label });
  }
}

function syncPeriod() {
  syncCaption();
  syncQuicks();
}

function onQuickClick(e) {
  const btn = e.target.closest('[data-quick]');
  if (!btn || btn.disabled) return;
  const period = quickPeriods(quickBounds()).find((p) => p.id === btn.dataset.quick);
  if (!period || !period.has) return;
  byId('date-from').value = period.from;
  byId('date-to').value = period.to;
  onPeriodChange();
}

function syncViewToggle() {
  for (const btn of document.querySelectorAll('#view-toggle [data-view]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view));
  }
}

function refresh() {
  markAllDirty();
  renderActive();
  syncPeriod();
}

export function renderAll() {
  dataReady = true;
  syncChrome();
  syncViewToggle();
  refresh();
  syncFilterToggle();
}

function onPeriodChange() {
  const from = byId('date-from').value;
  try {
    localStorage.setItem(DATE_FROM_KEY, from === state.autoDateFrom ? '' : from);
  } catch {}
  refresh();
}

function onViewClick(e) {
  const btn = e.target.closest('[data-view]');
  if (!btn || btn.dataset.view === state.view) return;
  state.view = btn.dataset.view;
  syncViewToggle();
  refresh();
}

function onLangChange() {
  applyStaticTexts(document);
  relabelNav();
  syncFilterToggle();
  refresh();
}

function onPageActivated(id) {
  syncChrome();
  const wasRendered = state.renderedPages.has(id);
  renderActive();
  if (wasRendered) {
    const panel = panelOf(id);
    replayCharts(panel);
    scheduleFit(panel);
  }
  syncPeriod();
}

export function initShell(pages) {
  filtersOpen = loadFiltersOpen();
  injectIcons();
  for (const page of pages) registerPage(page);
  applyStaticTexts(document);
  buildNav();
  initRouter();
  onActivate(onPageActivated);
  setScreenListener(syncChrome);
  const on = (id, type, fn) => {
    const el = byId(id);
    return el ? [[el, type, fn]] : [];
  };
  bindEvents([
    ...on('date-from', 'change', onPeriodChange),
    ...on('date-to', 'change', onPeriodChange),
    ...on('period-quicks', 'click', onQuickClick),
    ...on('filter-toggle', 'click', onFilterToggle),
    ...on('view-toggle', 'click', onViewClick),
    ...on('btn-export', 'click', exportCsv),
    ...on('btn-refresh', 'click', refreshData),
    ...on('btn-select', 'click', showSources),
    ...on('btn-settings', 'click', openSettings),
    [document, EVENTS.lang, onLangChange],
    [document, EVENTS.rerender, refresh],
  ]);
  syncFilterToggle();
  syncViewToggle();
  activate(pageFromLocation());
}
