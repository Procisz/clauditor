import './styles.css';

// ─── Core ───────────────────────────────────
import { CONFIG_DEFAULT_MARKUP } from './core/config.js';
import { state } from './core/state.js';
import { loadHandle } from './core/db.js';
import { selectFolder, reauthorize, showFreshSelect, refreshData } from './core/folder.js';
import { selectArchiveFolder, getArchiveHandle, updateArchiveButton } from './core/archive.js';
import { loadAndRender, loadFromFileInput, setRenderCallback } from './core/loader.js';
import { initTheme, toggleTheme } from './core/theme.js';
import { getFilteredEntries } from './core/parser.js';

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
  if (tableId === 'table-projects') { renderProjectsTable(entries); return; }
  const todayEntries = getTodayEntries();
  if (tableId === 'table-today-sessions') renderTodaySessionsTable(todayEntries);
  if (tableId === 'table-today-projects') renderTodayProjectsTable(todayEntries);
}

function setupTableSorting() {
  for (const tableId of SORTABLE_TABLES) {
    const table = document.getElementById(tableId);
    if (!table) continue;
    table.dataset.sortable = '';
    const ths = table.querySelectorAll('thead th');
    if (tableId === 'table-today-sessions') {
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
  selectFolder, loadFromFileInput, reauthorize, showFreshSelect, refreshData,
  selectArchiveFolder: () => selectArchiveFolder(renderAll),
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
  document.getElementById('app-version').textContent = 'v' + __APP_VERSION__;
  const savedMarkup = parseFloat(localStorage.getItem('clauditor_markup'));
  const savedBudget = parseFloat(localStorage.getItem('clauditor_budget'));
  document.getElementById('markup-input').value = savedMarkup || CONFIG_DEFAULT_MARKUP;
  if (savedBudget > 0) document.getElementById('budget-input').value = savedBudget;
  // Restore archive button label if a folder was previously set
  getArchiveHandle().then(h => { if (h) updateArchiveButton(h.name); }).catch(() => {});

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
