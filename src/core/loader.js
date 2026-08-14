// ─────────────────────────────────────────────
// LOADER — orchestrates file reading and triggers render
// ─────────────────────────────────────────────
import { collectJsonlFiles, readJsonlFile } from './fs.js';
import { parseEntries, parseDurations, entryKey } from './parser.js';
import { state } from './state.js';
import { showLoading, setLoadingText, hideLoading, showDashboard, showError, hideError, updatePricingWarning } from './utils.js';
import { getArchiveHandle, readArchive, writeArchive } from './archive.js';
import { todayKey, shiftDay } from './dates.js';
import { getUnknownModels } from './config.js';

let _renderCallback = null;
export function setRenderCallback(fn) { _renderCallback = fn; }

function finishLoading(showRefresh) {
  // Deduplicate by message ID; keep entry with highest output token count
  // (streaming writes partial snapshots of the same message — the max-output
  // one is the final version)
  const msgMap = new Map();
  for (const e of state.allEntries) {
    const key = entryKey(e);
    const existing = msgMap.get(key);
    if (!existing || e.output >= existing.output) msgMap.set(key, e);
  }
  state.allEntries = [...msgMap.values()];
  state.allEntries.sort((a, b) => a.ts.localeCompare(b.ts));

  updatePricingWarning(getUnknownModels(state.allEntries.map(e => e.model)));

  const todayStr = todayKey();
  const savedFrom = localStorage.getItem('clauditor_date_from');
  if (savedFrom) {
    document.getElementById('date-from').value = savedFrom;
  } else {
    document.getElementById('date-from').value = shiftDay(todayStr, -29);
  }
  document.getElementById('date-to').value = todayStr;
  document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  document.getElementById('btn-refresh').style.display = showRefresh ? '' : 'none';
  document.getElementById('btn-select').textContent = 'Change Folder';

  hideLoading();
  showDashboard();
  setTimeout(() => {
    try {
      _renderCallback?.();
      window.dispatchEvent(new Event('resize'));
    } catch (e) {
      showError('Render error: ' + e.message);
      console.error(e);
    }
  }, 100);
}

export async function loadAndRender(dirHandle) {
  hideError();
  showLoading('Scanning files…');
  try {
    const archiveHandle = await getArchiveHandle().catch(() => null);
    const dateFrom = localStorage.getItem('clauditor_date_from') || '';
    const fromMonth = dateFrom ? dateFrom.slice(0, 7) : '';
    const { entries: archivedEntries, durations: archivedDurations } = await readArchive(archiveHandle, fromMonth);

    const files = await collectJsonlFiles(dirHandle);
    setLoadingText(`Reading ${files.length} file(s)…`);
    state.allEntries   = [...archivedEntries];
    state.allDurations = [...archivedDurations];
    for (const { handle, agentType } of files) {
      const records = await readJsonlFile(handle);
      state.allEntries.push(...parseEntries(records, agentType));
      state.allDurations.push(...parseDurations(records));
    }
    finishLoading(true);
    await writeArchive(archiveHandle);
  } catch (e) {
    hideLoading();
    showError('Failed to read data: ' + e.message);
    console.error(e);
  }
}

// Fallback for browsers without showDirectoryPicker (e.g. Safari) using <input webkitdirectory>
export async function loadFromFileInput(fileList) {
  hideError();
  showLoading('Scanning files…');
  try {
    const all = Array.from(fileList);
    // Read meta.json files first to resolve subagent type names
    const metaMap = new Map();
    for (const file of all) {
      const path = file.webkitRelativePath;
      if (path.includes('/subagents/') && path.endsWith('.meta.json')) {
        try {
          const meta = JSON.parse(await file.text());
          metaMap.set(path.replace('.meta.json', ''), meta.agentType || 'agent');
        } catch {}
      }
    }
    const archiveHandle = await getArchiveHandle().catch(() => null);
    const dateFrom = localStorage.getItem('clauditor_date_from') || '';
    const fromMonth = dateFrom ? dateFrom.slice(0, 7) : '';
    const { entries: archivedEntries, durations: archivedDurations } = await readArchive(archiveHandle, fromMonth);

    const jsonlFiles = all.filter(f => f.webkitRelativePath.endsWith('.jsonl'));
    setLoadingText(`Reading ${jsonlFiles.length} file(s)…`);
    state.allEntries   = [...archivedEntries];
    state.allDurations = [...archivedDurations];
    for (const file of jsonlFiles) {
      const path = file.webkitRelativePath;
      const isSubagent = path.includes('/subagents/');
      const agentType = isSubagent ? (metaMap.get(path.replace('.jsonl', '')) || 'agent') : 'main';
      const records = [];
      for (const line of (await file.text()).split('\n')) {
        const l = line.trim();
        if (!l) continue;
        try { records.push(JSON.parse(l)); } catch {}
      }
      state.allEntries.push(...parseEntries(records, agentType));
      state.allDurations.push(...parseDurations(records));
    }
    finishLoading(false);
    await writeArchive(archiveHandle);
  } catch (e) {
    hideLoading();
    showError('Failed to read data: ' + e.message);
    console.error(e);
  }
}
