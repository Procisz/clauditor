import { openModal, modalSection } from '../ui/modal.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { t, getLang, getLocale, setLang, LANGS } from '../i18n/index.js';
import { state } from '../core/state.js';
import { CONFIG_DEFAULT_MARKUP, PRICE_LIST_UPDATED } from '../core/config.js';
import { clampDecimals } from '../core/utils.js';
import { showSources } from '../core/folder.js';
import { selectArchiveFolder } from '../core/archive.js';
import { presentDashboard } from '../core/loader.js';
import { EVENTS, emit } from './events.js';
import { WIDTHS, currentDark, currentLight, currentMode, currentWidth, setDark, setLight, setMode, setWidth } from './appearance.js';
import { DARK_THEMES, LIGHT_THEMES } from './themes.js';

const TAB_KEY = 'clauditor_settings_tab';
const TABS = ['general', 'numbers', 'appearance', 'data'];
const MODES = [
  { id: 'light', iconId: 'i-sun' },
  { id: 'dark', iconId: 'i-moon' },
  { id: 'auto', iconId: 'i-theme-auto' },
];

let tabMemo = TABS[0];

function activeTab() {
  let id = tabMemo;
  try {
    id = sessionStorage.getItem(TAB_KEY) ?? tabMemo;
  } catch {}
  return TABS.includes(id) ? id : TABS[0];
}

function rememberTab(id) {
  tabMemo = id;
  try {
    sessionStorage.setItem(TAB_KEY, id);
  } catch {}
}

function save(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

const note = (text) => `<div class="info set-note">${icon('i-info')}<span>${esc(text)}</span></div>`;

const mark = (on) => (on ? `<span class="set-mark">${icon('i-check')}</span>` : '');

function field({ id, label, input, info = '' }) {
  return `<div class="set-field">
    <label class="set-field-label" for="${id}">${esc(label)}</label>
    <div class="set-field-row">${input}</div>
    ${info ? note(info) : ''}
  </div>`;
}

function langSection() {
  const active = getLang();
  return modalSection(t('settings.language'), `<div class="chip-row">${LANGS.map((lang) =>
    `<button type="button" class="chip" data-pick="lang:${esc(lang.id)}" aria-pressed="${lang.id === active}"><span>${esc(lang.name)}</span></button>`,
  ).join('')}</div>`);
}

function generalPanel() {
  const markup = field({
    id: 'set-markup',
    label: t('settings.markup'),
    input: `<input type="text" inputmode="decimal" class="input input-num" id="set-markup" data-field="markup" value="${esc(state.markup)}">`,
    info: t('settings.markupInfo'),
  });
  const budget = field({
    id: 'set-budget',
    label: t('settings.budget'),
    input: `<input type="text" inputmode="decimal" class="input input-num" id="set-budget" data-field="budget" placeholder="0" value="${state.budget > 0 ? esc(state.budget) : ''}">`,
    info: t('settings.budgetInfo'),
  });
  return `${langSection()}${modalSection(t('settings.pricing'), markup)}${modalSection(t('settings.budgetSection'), budget)}`;
}

function numbersPanel() {
  const sepInput = (id, which, value) =>
    `<input type="text" class="sep-input" id="${id}" data-sep="${which}" maxlength="1" value="${esc(value)}">`;
  const separators = `<div class="sep-pair">
    ${field({ id: 'set-thousands', label: t('settings.thousandsSep'), input: sepInput('set-thousands', 'thousands', state.thousandsSep) })}
    ${field({ id: 'set-decimal', label: t('settings.decimalSep'), input: sepInput('set-decimal', 'decimal', state.decimalSep) })}
  </div>${note(t('settings.sepInfo'))}`;
  const decimals = field({
    id: 'set-decimals',
    label: t('settings.decimals'),
    input: `<input type="number" class="input input-num" id="set-decimals" data-field="decimals" min="0" max="8" step="1" value="${esc(state.moneyDecimals)}">`,
    info: t('settings.decimalsInfo'),
  });
  return `${modalSection(t('settings.numberFormat'), separators)}${modalSection(t('settings.decimals'), decimals)}`;
}

function themeCard(kind, theme, active) {
  const on = theme.id === active;
  return `<button type="button" class="set-swatch" data-swatch="${kind}-${theme.id}" data-pick="${kind}:${theme.id}" aria-pressed="${on}">
    <span class="sw-card">
      <span class="sw-top"><span class="sw-name">${esc(t(theme.nameKey))}</span>${mark(on)}</span>
      <span class="sw-desc">${esc(t(theme.descKey))}</span>
      <span class="sw-row"><span class="sw-accent"></span><span class="sw-bar"></span><span class="sw-bar sw-bar-2"></span></span>
    </span>
  </button>`;
}

function widthSection() {
  const active = currentWidth();
  return modalSection(t('settings.width'), `<div class="chip-row">${WIDTHS.map((id) =>
    `<button type="button" class="chip" data-pick="width:${id}" aria-pressed="${id === active}"><span>${esc(t(`settings.width.${id}`))}</span></button>`,
  ).join('')}</div>`);
}

function appearancePanel() {
  const mode = currentMode();
  const modes = `<div class="set-tabs" role="group" aria-label="${esc(t('settings.mode'))}">${MODES.map((m) =>
    `<button type="button" class="set-tab" data-pick="mode:${m.id}" aria-pressed="${mode === m.id}">${icon(m.iconId)}<span>${esc(t(`settings.mode.${m.id}`))}</span></button>`,
  ).join('')}</div>${note(t('settings.modeNote'))}`;
  const light = currentLight();
  const dark = currentDark();
  return `${widthSection()}
    ${modalSection(t('settings.mode'), modes)}
    ${modalSection(t('settings.lightThemes'), `<div class="set-grid">${LIGHT_THEMES.map((th) => themeCard('light', th, light)).join('')}</div>`)}
    ${modalSection(t('settings.darkThemes'), `<div class="set-grid">${DARK_THEMES.map((th) => themeCard('dark', th, dark)).join('')}</div>`)}`;
}

function formatLastUpdated() {
  if (!(state.lastUpdated instanceof Date) || Number.isNaN(state.lastUpdated.getTime())) return t('settings.never');
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'medium' }).format(state.lastUpdated);
}

function formatPriceDate() {
  const date = new Date(`${PRICE_LIST_UPDATED}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(PRICE_LIST_UPDATED ?? '');
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

const dataRow = (label, valueHtml) =>
  `<div class="set-data-row"><span class="k">${esc(label)}</span><span class="v">${valueHtml}</span></div>`;

function dataPanel() {
  const canPickArchive = 'showDirectoryPicker' in window;
  const sources = `${note(t('settings.dataSourcesInfo'))}
    <div class="set-actions"><button type="button" class="btn" data-act="sources">${icon('i-database')}<span>${esc(t('settings.openDataSources'))}</span></button></div>`;
  const archive = `${dataRow(t('settings.archiveFolder'), esc(state.archiveName || t('settings.archiveNone')))}
    <div class="set-actions"><button type="button" class="btn" data-act="archive"${canPickArchive ? '' : ' disabled'}>${icon('i-archive')}<span>${esc(t('settings.setArchive'))}</span></button></div>
    ${canPickArchive ? '' : note(t('settings.archiveUnsupported'))}`;
  const status = `<div class="set-data-list">
    ${dataRow(t('settings.lastUpdated'), esc(formatLastUpdated()))}
    ${dataRow(t('settings.priceListDate'), esc(formatPriceDate()))}
  </div>`;
  return `${modalSection(t('settings.dataSources'), sources)}${modalSection(t('settings.archive'), archive)}${modalSection(t('settings.status'), status)}`;
}

const PANELS = { general: generalPanel, numbers: numbersPanel, appearance: appearancePanel, data: dataPanel };

function navHtml(active) {
  return `<div class="set-nav" role="tablist" aria-label="${esc(t('settings.tabs'))}">${TABS.map((id) =>
    `<button type="button" class="set-nav-tab" role="tab" id="set-tab-${id}" data-tab="${id}" aria-selected="${id === active}" aria-controls="set-panel-${id}" tabindex="${id === active ? 0 : -1}">${esc(t(`settings.tab.${id}`))}</button>`,
  ).join('')}</div>`;
}

function bodyHtml() {
  const active = activeTab();
  return `<div class="set">${navHtml(active)}${TABS.map((id) =>
    `<div class="set-panel" role="tabpanel" id="set-panel-${id}" data-panel="${id}" aria-labelledby="set-tab-${id}"${id === active ? '' : ' hidden'}>${PANELS[id]()}</div>`,
  ).join('')}</div>`;
}

const rerender = () => emit(EVENTS.rerender);

function parseNumber(raw) {
  return parseFloat(String(raw).trim().replace(',', '.'));
}

function commitMarkup(input) {
  state.markup = Math.max(0, parseNumber(input.value) || CONFIG_DEFAULT_MARKUP);
  save('clauditor_markup', state.markup);
  input.value = String(state.markup);
  rerender();
}

function commitBudget(input) {
  const value = parseNumber(input.value);
  state.budget = value > 0 ? value : 0;
  save('clauditor_budget', state.budget);
  input.value = state.budget > 0 ? String(state.budget) : '';
  rerender();
}

function commitDecimals(input) {
  state.moneyDecimals = clampDecimals(input.value);
  save('clauditor_money_decimals', state.moneyDecimals);
  input.value = String(state.moneyDecimals);
  rerender();
}

function commitSeparator(which, raw, body) {
  let thousands = state.thousandsSep;
  let decimal = state.decimalSep;
  if (which === 'thousands') thousands = raw;
  else decimal = raw || '.';
  if (thousands === decimal) thousands = '';
  state.thousandsSep = thousands;
  state.decimalSep = decimal;
  save('clauditor_thousands_sep', thousands);
  save('clauditor_decimal_sep', decimal);
  body.querySelector('[data-sep="thousands"]').value = thousands;
  body.querySelector('[data-sep="decimal"]').value = decimal;
  rerender();
}

export function openSettings() {
  const box = openModal({ title: t('shell.settings'), bodyHtml: bodyHtml() });
  const body = box.querySelector('.modal-body');

  function redraw(focusSelector) {
    const top = box.scrollTop;
    body.innerHTML = bodyHtml();
    if (focusSelector) body.querySelector(focusSelector)?.focus({ preventScroll: true });
    box.scrollTop = top;
  }

  function showTab(id, { focus = false } = {}) {
    if (!TABS.includes(id)) return;
    rememberTab(id);
    body.querySelectorAll('.set-nav-tab').forEach((tab) => {
      const on = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus({ preventScroll: true });
    });
    body.querySelectorAll('.set-panel').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== id;
    });
    box.scrollTop = 0;
  }

  function applyLang(id) {
    setLang(id);
    const title = box.querySelector('.modal-title');
    if (title) title.textContent = t('shell.settings');
    box.querySelector('[data-modal-close]')?.setAttribute('aria-label', t('common.close'));
  }

  function pick(kind, value) {
    if (kind === 'mode') setMode(value);
    else if (kind === 'light') setLight(value);
    else if (kind === 'dark') setDark(value);
    else if (kind === 'lang') applyLang(value);
    else if (kind === 'width') setWidth(value);
  }

  async function chooseArchive() {
    await selectArchiveFolder(() => presentDashboard());
    if (body.isConnected) redraw('[data-act="archive"]');
  }

  body.addEventListener('click', (e) => {
    const tab = e.target.closest('.set-nav-tab');
    if (tab) {
      showTab(tab.dataset.tab, { focus: true });
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'sources') {
        box.closest('dialog')?.close();
        showSources();
      } else if (act.dataset.act === 'archive') {
        chooseArchive();
      }
      return;
    }
    const btn = e.target.closest('[data-pick]');
    if (!btn) return;
    const [kind, value] = btn.dataset.pick.split(':');
    pick(kind, value);
    redraw(`[data-pick="${btn.dataset.pick}"]`);
  });

  body.addEventListener('keydown', (e) => {
    const tab = e.target.closest('.set-nav-tab');
    if (!tab) return;
    const i = TABS.indexOf(tab.dataset.tab);
    const last = TABS.length - 1;
    let next;
    if (e.key === 'ArrowRight') next = TABS[i === last ? 0 : i + 1];
    else if (e.key === 'ArrowLeft') next = TABS[i <= 0 ? last : i - 1];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[last];
    if (!next) return;
    e.preventDefault();
    showTab(next, { focus: true });
  });

  body.addEventListener('change', (e) => {
    const input = e.target.closest('input');
    if (!input) return;
    if (input.dataset.sep) commitSeparator(input.dataset.sep, input.value, body);
    else if (input.dataset.field === 'markup') commitMarkup(input);
    else if (input.dataset.field === 'budget') commitBudget(input);
    else if (input.dataset.field === 'decimals') commitDecimals(input);
  });
}
