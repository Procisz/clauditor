import { saveHandle, loadHandle } from './db.js';
import { loadAndRender, loadCodeData, loadCodeDataFromFiles, loadCoworkData, presentDashboard } from './loader.js';
import { state } from './state.js';
import { showError, domText, domClear, fmtInt, setScreen } from './utils.js';
import { t, tn } from '../i18n/index.js';
import { hasNativeBridge, nativeInit } from './native.js';

const progressTo = id => (done, total) => {
  if (done === total || done % 25 === 0) setStatus(id, 'load', t('shell.readingLogs', { done: fmtInt(done), total: fmtInt(total) }));
};

function setStatus(id, kind, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  el.className = 'start-status';
  el.dataset.tone = kind === 'ok' ? 'ok' : kind === 'err' ? 'error' : 'info';
  domClear(el);
  el.appendChild(domText('span', '', (kind === 'ok' ? '\u2713 ' : kind === 'err' ? '\u2715 ' : '') + msg));
}

const filesLabel = n => tn('start.files', n);
const recordsLabel = n => tn('start.records', n, { records: fmtInt(n) });
const tasksLabel = n => tn('start.tasks', n);

function updateOpenButton() {
  const b = document.getElementById('btn-open-dashboard');
  if (b) b.disabled = !(state.srcCode || state.srcCowork);
}

export async function browseCodeFolder() {
  if (!('showDirectoryPicker' in window)) {
    document.getElementById('file-input-fallback').click();
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    setStatus('status-code', 'load', t('start.reading'));
    await saveHandle(handle);
    const stats = await loadCodeData(handle, progressTo('status-code'));
    if (stats.entries === 0) {
      setStatus('status-code', 'err', t('start.noRecordsIn', { name: handle.name }));
    } else {
      setStatus('status-code', 'ok', t('start.loadedFolder', { name: handle.name, files: filesLabel(stats.files), records: recordsLabel(stats.entries) }));
    }
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('status-code', 'err', e.message);
  }
  updateOpenButton();
}

export async function onCodeFilesPicked(fileList) {
  const input = document.getElementById('file-input-fallback');
  try {
    setStatus('status-code', 'load', t('start.reading'));
    const all = Array.from(fileList);
    const stats = await loadCodeDataFromFiles(all, progressTo('status-code'));
    const cw = await loadCoworkData(all, progressTo('status-code'));
    if (stats.entries === 0 && cw.entries === 0) {
      setStatus('status-code', 'err', t('start.noRecords'));
    } else {
      setStatus('status-code', 'ok', t('start.loaded', { files: filesLabel(stats.files), records: recordsLabel(stats.entries) }));
      if (cw.tasks > 0) setStatus('status-cowork', 'ok', t('start.loadedCowork', { tasks: tasksLabel(cw.tasks), records: recordsLabel(cw.entries) }));
    }
  } catch (e) {
    setStatus('status-code', 'err', e.message);
  }
  if (input) input.value = '';
  updateOpenButton();
}

export function browseCoworkFolder() {
  document.getElementById('cowork-input')?.click();
}

export async function onCoworkPicked(fileList) {
  const input = document.getElementById('cowork-input');
  try {
    setStatus('status-cowork', 'load', t('start.reading'));
    const { tasks, entries } = await loadCoworkData(fileList, progressTo('status-cowork'));
    if (tasks === 0) {
      setStatus('status-cowork', 'err', t('start.noCowork'));
    } else {
      setStatus('status-cowork', 'ok', t('start.loadedCowork', { tasks: tasksLabel(tasks), records: recordsLabel(entries) }));
    }
  } catch (e) {
    setStatus('status-cowork', 'err', e.message);
  }
  if (input) input.value = '';
  updateOpenButton();
}

export async function openDashboard() {
  await presentDashboard();
}

export function showSources() {
  const cw = document.getElementById('cowork-warning');
  if (cw) cw.hidden = true;
  document.getElementById('reauth-box').hidden = true;
  document.getElementById('fresh-select-box').hidden = false;
  setScreen('start');
  if (state.srcCode) setStatus('status-code', 'ok', t('start.recordsLoaded', { records: recordsLabel(state.srcCode.entries.length) }));
  if (state.srcCowork) setStatus('status-cowork', 'ok', t('start.recordsLoaded', { records: recordsLabel(state.srcCowork.entries.length) }));
  updateOpenButton();
}

export async function reauthorize() {
  try {
    const handle = await loadHandle();
    if (!handle) { showError(t('shell.noSavedFolder')); return; }
    const perm = await handle.requestPermission({ mode: 'read' });
    if (perm === 'granted') {
      await loadAndRender(handle);
    } else {
      showError(t('shell.permissionDeniedPick'));
    }
  } catch (e) {
    showError(t('shell.reauthFailed', { message: e.message }));
  }
}

export function showFreshSelect() {
  document.getElementById('reauth-box').hidden = true;
  document.getElementById('fresh-select-box').hidden = false;
}

export async function refreshData() {
  try {
    if (hasNativeBridge()) {
      await nativeInit();
      await presentDashboard(true);
      return;
    }
    const handle = await loadHandle();
    if (!handle) { showError(t('shell.noFolderSaved')); return; }
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') {
      const req = await handle.requestPermission({ mode: 'read' });
      if (req !== 'granted') { showError(t('shell.permissionDenied')); return; }
    }
    await loadAndRender(handle);
  } catch (e) {
    showError(t('shell.refreshFailed', { message: e.message }));
  }
}
