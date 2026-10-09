import './styles.css';

import { CONFIG_DEFAULT_MARKUP, PRICE_LIST_UPDATED } from './core/config.js';
import { state } from './core/state.js';
import { loadHandle } from './core/db.js';
import { browseCodeFolder, browseCoworkFolder, onCodeFilesPicked, onCoworkPicked, openDashboard, showSources, reauthorize, showFreshSelect, refreshData } from './core/folder.js';
import { selectArchiveFolder, getArchiveHandle, updateArchiveButton } from './core/archive.js';
import { hasNativeBridge, nativeInit } from './core/native.js';
import { loadAndRender, loadFromFileInput, presentDashboard, setRenderCallback } from './core/loader.js';
import { showLoading, hideLoading } from './core/utils.js';
import { initTheme, toggleTheme } from './core/theme.js';
import { getFilteredEntries } from './core/parser.js';
import { makeInfoIcon, initDismissableNote, initPathCopy } from './core/utils.js';
import { openPricingHelp } from './features/pricing-help.js';

import { renderAll, setView, onMarkupChange, exportCsv } from './features/overview/index.js';
import { destroyOverviewCharts, resizeOverviewCharts } from './features/overview/charts.js';
import { destroyTodayCharts, resizeTodayCharts } from './features/today/charts.js';
import { renderBurnRate, resizeSparklines } from './features/overview/cards.js';
import { resizeHeatmap } from './features/overview/heatmap.js';
import { renderModelTable, renderProjectsTable } from './features/overview/tables.js';
import { closeDetail } from './features/overview/detail.js';
import { switchTab, prevDay, nextDay, goToToday, onDayPicked, getTodayEntries, renderTodayView } from './features/today/index.js';
import { renderTodaySessionsTable } from './features/today/sessions.js';
import { renderTodayProjectsTable } from './features/today/tables.js';

const SORTABLE_TABLES = ['table-models', 'table-projects', 'table-today-sessions', 'table-today-projects'];

function rerenderTableOnly(tableId) {
  const entries = getFilteredEntries();
  if (tableId === 'table-models')   { renderModelTable(entries);   return; }
  if (tableId === 'table-projects') { renderProjectsTable(state.allEntries); return; }
  const todayEntries = getTodayEntries();
  if (tableId === 'table-today-sessions') renderTodaySessionsTable(todayEntries);
  if (tableId === 'table-today-projects') renderTodayProjectsTable(todayEntries);
}

function setupTableSorting() {
  for (const tableId of SORTABLE_TABLES) {
    const table = document.getElementById(tableId);
    if (!table) continue;
    table.dataset.sortable = '';
    const ths = table.querySelectorAll(':scope > thead th');
    if (tableId === 'table-models' || tableId === 'table-projects') {

      ths.forEach((th, idx) => {
        th.classList.add('sortable');
        th.addEventListener('click', () => {
          const curCol = state.tableSortCols[tableId];
          const curDir = state.tableSortDirs[tableId] || 0;
          if (curCol !== idx || curDir === 0) { state.tableSortCols[tableId] = idx; state.tableSortDirs[tableId] = 1; }
          else if (curDir === 1) state.tableSortDirs[tableId] = -1;
          else { delete state.tableSortCols[tableId]; state.tableSortDirs[tableId] = 0; }
          if (tableId === 'table-projects') state.projectsPage.pageIndex = 0;
          rerenderTableOnly(tableId);
        });
      });
    } else if (tableId === 'table-today-sessions') {
      [1, 2, ths.length - 1].forEach(idx => {
        ths[idx].classList.add('sortable');
        ths[idx].addEventListener('click', () => {
          const activeCol = state.tableSortCols[tableId] !== undefined ? state.tableSortCols[tableId] : ths.length - 1;
          if (activeCol === idx) {
            state.tableSortDirs[tableId] = -(state.tableSortDirs[tableId] || -1);
          } else {
            state.tableSortCols[tableId] = idx;
            state.tableSortDirs[tableId] = -1;
          }
          rerenderTableOnly(tableId);
        });
      });
    } else {
      ths[ths.length - 1].classList.add('sortable');
      ths[ths.length - 1].addEventListener('click', () => {
        state.tableSortDirs[tableId] = -(state.tableSortDirs[tableId] || -1);
        rerenderTableOnly(tableId);
      });
    }
  }
}

const DEFAULT_MONEY_DECIMALS = 2;
function clampDecimals(v) {
  if (v === '' || v === null || v === undefined) return DEFAULT_MONEY_DECIMALS;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(8, Math.max(0, n)) : DEFAULT_MONEY_DECIMALS;
}
function rerenderAfterSettingChange() {
  if (state.allEntries.length === 0) return;
  if (state.activeTab === 'today') { destroyTodayCharts(); renderTodayView(); } else renderAll();
}

Object.assign(window, {
  toggleTheme: () => { toggleTheme(); if (state.allEntries.length > 0) { if (state.activeTab === 'today') { destroyTodayCharts(); renderTodayView(); } else renderAll(); } },
  browseCodeFolder, browseCoworkFolder, onCodeFilesPicked, onCoworkPicked, openDashboard, showSources,
  openPricingHelp,
  loadFromFileInput, reauthorize, showFreshSelect, refreshData,
  selectArchiveFolder: () => selectArchiveFolder(() => presentDashboard()),
  renderAll, onMarkupChange, renderBurnRate, setView,
  switchTab: (tab) => {
    clearTimeout(_resizeTimer);
    if (tab === 'today') destroyOverviewCharts();
    if (tab === 'overview') destroyTodayCharts();
    switchTab(tab);
    if (tab === 'overview' && state.allEntries.length > 0) renderAll();
  },
  closeDetail,
  prevDay, nextDay, goToToday, onDayPicked,
  exportCsv,
  openSettings: () => document.getElementById('settings-modal').showModal(),
  onDecimalsChange: () => {
    state.moneyDecimals = clampDecimals(document.getElementById('money-decimals-input').value);
    document.getElementById('money-decimals-input').value = state.moneyDecimals;
    localStorage.setItem('clauditor_money_decimals', state.moneyDecimals);
    rerenderAfterSettingChange();
  },
  onSepChange: () => {
    state.thousandsSep = document.getElementById('thousands-sep-input').value;
    state.decimalSep   = document.getElementById('decimal-sep-input').value || '.';
    if (state.thousandsSep === state.decimalSep) {
      state.thousandsSep = '';
      document.getElementById('thousands-sep-input').value = '';
    }
    document.getElementById('decimal-sep-input').value = state.decimalSep;
    localStorage.setItem('clauditor_thousands_sep', state.thousandsSep);
    localStorage.setItem('clauditor_decimal_sep', state.decimalSep);
    rerenderAfterSettingChange();
  },
});

let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (state.allEntries.length === 0) return;
    if (state.activeTab === 'today') {
      resizeTodayCharts();
    } else {
      resizeOverviewCharts();
      resizeHeatmap();
      resizeSparklines();
    }
  }, 250);
});

setRenderCallback(renderAll);
(async () => {
  initTheme();
  setupTableSorting();

  if (!localStorage.getItem('clauditor_datefrom_reset')) {
    localStorage.removeItem('clauditor_date_from');
    localStorage.setItem('clauditor_datefrom_reset', '1');
  }
  document.getElementById('app-version').textContent = 'v' + __APP_VERSION__;
  document.getElementById('price-list-updated').textContent = 'Price list: ' + PRICE_LIST_UPDATED;
  document.getElementById('markup-info').appendChild(makeInfoIcon(
    'Final cost = base cost × this multiplier. Base cost uses public Anthropic API pricing — '
    + 'leave at 1 for no markup, or set higher if your provider bills a surcharge on top.'));
  document.getElementById('budget-info').appendChild(makeInfoIcon(
    'Tracks this month’s spend (final cost) against a budget you set. The bar fills with what '
    + 'you’ve spent so far; the projection estimates your month-end total from your current '
    + 'daily pace. Set the budget to 0 to turn tracking off.'));
  initDismissableNote('estimate-note', 'note:cost-estimates');
  initPathCopy('welcome');

  state.thousandsSep = localStorage.getItem('clauditor_thousands_sep') ?? ',';
  state.decimalSep   = localStorage.getItem('clauditor_decimal_sep') || '.';
  document.getElementById('thousands-sep-input').value = state.thousandsSep;
  document.getElementById('decimal-sep-input').value = state.decimalSep;
  state.moneyDecimals = clampDecimals(localStorage.getItem('clauditor_money_decimals'));
  document.getElementById('money-decimals-input').value = state.moneyDecimals;
  const savedMarkup = parseFloat(localStorage.getItem('clauditor_markup'));
  const savedBudget = parseFloat(localStorage.getItem('clauditor_budget'));
  document.getElementById('markup-input').value = savedMarkup || CONFIG_DEFAULT_MARKUP;
  if (savedBudget > 0) document.getElementById('budget-input').value = savedBudget;

  getArchiveHandle().then(h => { if (h) updateArchiveButton(h.name); }).catch(() => {});

  if (hasNativeBridge()) {
    try {
      showLoading('Reading local data…');
      const counts = await nativeInit();
      console.info('[clauditor] native load: ' + JSON.stringify(counts));
      await presentDashboard(true);
      return;
    } catch (e) {
      console.error('Native load failed, falling back to pickers:', e);
      hideLoading();
    }
  }

  if ('showDirectoryPicker' in window) {
    try {
      const handle = await loadHandle();
      if (handle) {
        const perm = await handle.queryPermission({ mode: 'read' });
        if (perm === 'granted') {
          await loadAndRender(handle);
          return;
        } else if (perm === 'prompt') {

          document.getElementById('reauth-folder-name').textContent = handle.name;
          document.getElementById('reauth-box').style.display = 'flex';
          document.getElementById('fresh-select-box').style.display = 'none';
          document.getElementById('welcome').style.display = 'flex';
          return;
        }
      }
    } catch (e) {

      console.warn('Could not restore saved folder:', e);
    }
  }
  document.getElementById('welcome').style.display = 'flex';
})();
