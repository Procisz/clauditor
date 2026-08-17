import './styles.css';

// ─── Core ───────────────────────────────────
import { CONFIG_DEFAULT_MARKUP } from './core/config.js';
import { state } from './core/state.js';
import { loadHandle } from './core/db.js';
import { browseCodeFolder, browseCoworkFolder, onCoworkPicked, openDashboard, showSources, reauthorize, showFreshSelect, refreshData } from './core/folder.js';
import { selectArchiveFolder, getArchiveHandle, updateArchiveButton } from './core/archive.js';
import { hasNativeBridge, nativeInit } from './core/native.js';
import { loadAndRender, loadFromFileInput, presentDashboard, setRenderCallback } from './core/loader.js';
import { showLoading, hideLoading } from './core/utils.js';
import { initTheme, toggleTheme } from './core/theme.js';
import { getFilteredEntries } from './core/parser.js';
import { makeInfoIcon, initDismissableNote } from './core/utils.js';

// ─── Features ───────────────────────────────
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

// ─── Table sorting ───────────────────────────
const SORTABLE_TABLES = ['table-models', 'table-projects', 'table-today-sessions', 'table-today-projects'];

function rerenderTableOnly(tableId) {
  const entries = getFilteredEntries();
  if (tableId === 'table-models')   { renderModelTable(entries);   return; }
  if (tableId === 'table-projects') { renderProjectsTable(state.allEntries); return; }  // all time, unfiltered
  const todayEntries = getTodayEntries();
  if (tableId === 'table-today-sessions') renderTodaySessionsTable(todayEntries);
  if (tableId === 'table-today-projects') renderTodayProjectsTable(todayEntries);
}

function setupTableSorting() {
  for (const tableId of SORTABLE_TABLES) {
    const table = document.getElementById(tableId);
    if (!table) continue;
    table.dataset.sortable = '';
    const ths = table.querySelectorAll(':scope > thead th');  // skip headers of nested expansion tables
    if (tableId === 'table-models' || tableId === 'table-projects') {
      // Every column sortable, three-state: asc → desc → neutral (= default final-cost desc)
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

// ─── Expose to HTML onclick handlers ─────────
// (required because this file is an ES module)
Object.assign(window, {
  toggleTheme: () => { toggleTheme(); if (state.allEntries.length > 0) { if (state.activeTab === 'today') { destroyTodayCharts(); renderTodayView(); } else renderAll(); } },
  browseCodeFolder, browseCoworkFolder, onCoworkPicked, openDashboard, showSources,
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
  onSepChange: () => {
    state.thousandsSep = document.getElementById('thousands-sep-input').value;         // '' = no grouping
    state.decimalSep   = document.getElementById('decimal-sep-input').value || '.';    // never empty
    document.getElementById('decimal-sep-input').value = state.decimalSep;
    localStorage.setItem('clauditor_thousands_sep', state.thousandsSep);
    localStorage.setItem('clauditor_decimal_sep', state.decimalSep);
    if (state.allEntries.length > 0) {
      if (state.activeTab === 'today') { destroyTodayCharts(); renderTodayView(); } else renderAll();
    }
  },
});

// ─── Resize — one debounced handler for all charts ──────────────────────────
// All ApexCharts instances have redrawOnWindowResize/redrawOnParentResize:false,
// so no chart reacts during drag. 250ms after the user stops, we call
// lightweight updateOptions({}) on each instance — SVG resizes to the new
// container dimensions without rebuilding data or triggering animations.
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

// ─── Init ────────────────────────────────────
setRenderCallback(renderAll);
(async () => {
  initTheme();
  setupTableSorting();
  // One-time reset: older builds auto-persisted the 30-day default date-from
  // as if the user had chosen it — wipe it so all-time is the real default
  if (!localStorage.getItem('clauditor_datefrom_reset')) {
    localStorage.removeItem('clauditor_date_from');
    localStorage.setItem('clauditor_datefrom_reset', '1');
  }
  document.getElementById('app-version').textContent = 'v' + __APP_VERSION__;
  document.getElementById('markup-info').appendChild(makeInfoIcon(
    'Final cost = base cost × this multiplier. Base cost uses public Anthropic API pricing — '
    + 'leave at 1 for no markup, or set higher if your provider bills a surcharge on top.'));
  document.getElementById('budget-info').appendChild(makeInfoIcon(
    'Tracks this month’s spend (final cost) against a budget you set. The bar fills with what '
    + 'you’ve spent so far; the projection estimates your month-end total from your current '
    + 'daily pace. Set the budget to 0 to turn tracking off.'));
  initDismissableNote('estimate-note', 'note:cost-estimates');
  // Number-format separators (persisted; thousands may be '' = no grouping)
  state.thousandsSep = localStorage.getItem('clauditor_thousands_sep') ?? ',';
  state.decimalSep   = localStorage.getItem('clauditor_decimal_sep') || '.';
  document.getElementById('thousands-sep-input').value = state.thousandsSep;
  document.getElementById('decimal-sep-input').value = state.decimalSep;
  const savedMarkup = parseFloat(localStorage.getItem('clauditor_markup'));
  const savedBudget = parseFloat(localStorage.getItem('clauditor_budget'));
  document.getElementById('markup-input').value = savedMarkup || CONFIG_DEFAULT_MARKUP;
  if (savedBudget > 0) document.getElementById('budget-input').value = savedBudget;
  // Restore archive button label if a folder was previously set
  getArchiveHandle().then(h => { if (h) updateArchiveButton(h.name); }).catch(() => {});

  // Electron: the preload bridge reads both data sources natively — no
  // pickers, no permission prompts, no welcome screen
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
          // Show re-authorize UI instead of blank welcome
          document.getElementById('reauth-folder-name').textContent = handle.name;
          document.getElementById('reauth-box').style.display = 'flex';
          document.getElementById('fresh-select-box').style.display = 'none';
          document.getElementById('welcome').style.display = 'flex';
          return;
        }
      }
    } catch (e) {
      // IndexedDB may be blocked (tracking prevention) — just show welcome
      console.warn('Could not restore saved folder:', e);
    }
  }
  document.getElementById('welcome').style.display = 'flex';
})();
