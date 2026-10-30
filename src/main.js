import './styles/index.css';

import { CONFIG_DEFAULT_MARKUP } from './core/config.js';
import { state } from './core/state.js';
import { loadHandle } from './core/db.js';
import { browseCodeFolder, browseCoworkFolder, onCodeFilesPicked, onCoworkPicked, openDashboard, showSources, reauthorize, showFreshSelect, refreshData } from './core/folder.js';
import { selectArchiveFolder, getArchiveHandle, updateArchiveButton } from './core/archive.js';
import { hasNativeBridge, nativeInit } from './core/native.js';
import { loadAndRender, loadFromFileInput, presentDashboard, setRenderCallback } from './core/loader.js';
import { showLoading, hideLoading, setScreen, clampDecimals, initPathCopy } from './core/utils.js';
import { openPricingHelp } from './features/pricing-help.js';
import { t, initLang } from './i18n/index.js';
import { initAppearance } from './app/appearance.js';
import { initTooltips } from './ui/tooltip.js';
import { initShell, renderAll } from './app/shell.js';
import { pages } from './pages/index.js';

Object.assign(window, {
  browseCodeFolder, browseCoworkFolder, onCodeFilesPicked, onCoworkPicked, openDashboard, showSources,
  openPricingHelp,
  loadFromFileInput, reauthorize, showFreshSelect, refreshData,
  selectArchiveFolder: () => selectArchiveFolder(() => presentDashboard()),
});

function loadSavedSettings() {
  if (!localStorage.getItem('clauditor_datefrom_reset')) {
    localStorage.removeItem('clauditor_date_from');
    localStorage.setItem('clauditor_datefrom_reset', '1');
  }
  state.thousandsSep = localStorage.getItem('clauditor_thousands_sep') ?? ',';
  state.decimalSep   = localStorage.getItem('clauditor_decimal_sep') || '.';
  state.moneyDecimals = clampDecimals(localStorage.getItem('clauditor_money_decimals'));
  state.markup = Math.max(0, parseFloat(localStorage.getItem('clauditor_markup')) || CONFIG_DEFAULT_MARKUP);
  const savedBudget = parseFloat(localStorage.getItem('clauditor_budget'));
  state.budget = savedBudget > 0 ? savedBudget : 0;
}

setRenderCallback(renderAll);
(async () => {
  initLang();
  initAppearance();
  initTooltips();
  initShell(pages);
  loadSavedSettings();
  document.getElementById('app-version').textContent = 'v' + __APP_VERSION__;
  initPathCopy('welcome');

  getArchiveHandle().then(h => { if (h) updateArchiveButton(h.name); }).catch(() => {});

  if (hasNativeBridge()) {
    try {
      showLoading(t('shell.readingLocal'));
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
          document.getElementById('reauth-box').hidden = false;
          document.getElementById('fresh-select-box').hidden = true;
          setScreen('start');
          return;
        }
      }
    } catch (e) {

      console.warn('Could not restore saved folder:', e);
    }
  }
  setScreen('start');
})();
