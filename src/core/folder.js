// ─────────────────────────────────────────────
// FOLDER — folder selection and re-authorization
// ─────────────────────────────────────────────
import { saveHandle, loadHandle } from './db.js';
import { loadAndRender } from './loader.js';
import { showError } from './utils.js';

export async function selectFolder() {
  if (!('showDirectoryPicker' in window)) {
    document.getElementById('file-input-fallback').click();
    return;
  }
  const t0 = Date.now();
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await saveHandle(handle);
    await loadAndRender(handle);
  } catch (e) {
    if (e.name !== 'AbortError') {
      showError('Could not open folder: ' + e.message);
    } else if (Date.now() - t0 < 500) {
      showError('Could not open folder picker. Please try again.');
    }
  }
}

export async function reauthorize() {
  try {
    const handle = await loadHandle();
    if (!handle) { showError('No saved folder found. Please select the folder again.'); return; }
    const perm = await handle.requestPermission({ mode: 'read' });
    if (perm === 'granted') {
      await loadAndRender(handle);
    } else {
      showError('Permission denied. Please use "Select Different Folder" to pick it again.');
    }
  } catch (e) {
    showError('Re-authorization failed: ' + e.message);
  }
}

export function showFreshSelect() {
  document.getElementById('reauth-box').style.display = 'none';
  document.getElementById('fresh-select-box').style.display = '';
}

export async function refreshData() {
  try {
    const handle = await loadHandle();
    if (!handle) { showError('No folder saved. Please select a folder first.'); return; }
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') {
      const req = await handle.requestPermission({ mode: 'read' });
      if (req !== 'granted') { showError('Permission denied.'); return; }
    }
    await loadAndRender(handle);
  } catch (e) {
    showError('Refresh failed: ' + e.message);
  }
}
