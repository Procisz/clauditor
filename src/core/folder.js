// ─────────────────────────────────────────────
// FOLDER — data-source browsing, statuses, re-authorization
// ─────────────────────────────────────────────
import { saveHandle, loadHandle } from './db.js';
import { loadAndRender, loadCodeData, loadCoworkData, presentDashboard } from './loader.js';
import { state } from './state.js';
import { showError, domEl, domText, domClear, fmtInt } from './utils.js';
import { hasNativeBridge, nativeInit } from './native.js';

// ─── Source status feedback on the start page ───
function setStatus(id, kind, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'flex';
  el.className = 'text-xs mt-2 flex items-center gap-1.5 ' +
    (kind === 'ok' ? 'text-success' : kind === 'err' ? 'text-error' : 'opacity-60');
  domClear(el);
  if (kind === 'load') el.appendChild(domEl('span', 'loading loading-spinner loading-xs shrink-0'));
  el.appendChild(domText('span', '', (kind === 'ok' ? '✓ ' : kind === 'err' ? '✕ ' : '') + msg));
}

function updateOpenButton() {
  const b = document.getElementById('btn-open-dashboard');
  if (b) b.disabled = !(state.srcCode || state.srcCowork);
}

// ─── Claude Code source ───
export async function browseCodeFolder() {
  if (!('showDirectoryPicker' in window)) {
    document.getElementById('file-input-fallback').click();
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    setStatus('status-code', 'load', 'Reading folder…');
    await saveHandle(handle);
    const stats = await loadCodeData(handle);
    if (stats.entries === 0) {
      setStatus('status-code', 'err', `No usage records found in “${handle.name}” — did you select .claude/projects?`);
    } else {
      setStatus('status-code', 'ok', `${handle.name} — ${stats.files} file${stats.files !== 1 ? 's' : ''}, ${fmtInt(stats.entries)} usage records`);
    }
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('status-code', 'err', e.message);
  }
  updateOpenButton();
}

// ─── Cowork source (classic picker — Chrome blocks handles under ~/Library) ───
export function browseCoworkFolder() {
  document.getElementById('cowork-input')?.click();
}

export async function onCoworkPicked(fileList) {
  const input = document.getElementById('cowork-input');
  try {
    setStatus('status-cowork', 'load', 'Reading folder…');
    const { tasks, entries } = await loadCoworkData(fileList);
    if (tasks === 0) {
      setStatus('status-cowork', 'err', 'No Cowork tasks found — select the local-agent-mode-sessions folder itself');
    } else {
      setStatus('status-cowork', 'ok', `${tasks} task${tasks !== 1 ? 's' : ''}, ${fmtInt(entries)} usage records`);
    }
  } catch (e) {
    setStatus('status-cowork', 'err', e.message);
  }
  if (input) input.value = '';  // same folder can be re-picked later
  updateOpenButton();
}

// ─── Dashboard trigger + returning to the sources page ───
export async function openDashboard() {
  await presentDashboard();
}

export function showSources() {
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loading').style.display = 'none';
  const cw = document.getElementById('cowork-warning');
  if (cw) cw.style.display = 'none';  // the sources page itself is the fix
  document.getElementById('reauth-box').style.display = 'none';
  document.getElementById('fresh-select-box').style.display = 'flex';
  document.getElementById('welcome').style.display = 'flex';
  if (state.srcCode) setStatus('status-code', 'ok', `${fmtInt(state.srcCode.entries.length)} usage records loaded`);
  if (state.srcCowork) setStatus('status-cowork', 'ok', `${fmtInt(state.srcCowork.entries.length)} usage records loaded`);
  updateOpenButton();
}

// ─── Re-authorization + refresh (load and present in one step) ───
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
    if (hasNativeBridge()) {  // Electron: re-read everything natively
      await nativeInit();
      await presentDashboard(true);
      return;
    }
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
