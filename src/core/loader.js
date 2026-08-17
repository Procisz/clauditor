// ─────────────────────────────────────────────
// LOADER — reads data sources into state and presents the dashboard.
// The two sources (srcCode = Claude Code logs + archive, srcCowork = the
// Desktop app's Cowork store) are loaded independently and assembled just
// before rendering, so browsing one source never wipes the other and the
// dashboard only appears when explicitly presented.
// ─────────────────────────────────────────────
import { collectJsonlFiles, readJsonlFile } from './fs.js';
import { parseEntries, parseDurations, parseSessionTitles, parseCoworkEntries, entryKey } from './parser.js';
import { state } from './state.js';
import { showLoading, hideLoading, showDashboard, showError, hideError, updatePricingWarning, updateCoworkWarning } from './utils.js';
import { getArchiveHandle, readArchive, writeArchive } from './archive.js';
import { todayKey } from './dates.js';
import { getUnknownModels } from './config.js';

let _renderCallback = null;
export function setRenderCallback(fn) { _renderCallback = fn; }

function parseLines(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    try { records.push(JSON.parse(l)); } catch {}
  }
  return records;
}

// ─── Source loaders — fill state.srcCode / state.srcCowork, no rendering ───

// Claude Code logs (+ archive history) from a directory handle
export async function loadCodeData(dirHandle) {
  const archiveHandle = await getArchiveHandle().catch(() => null);
  const dateFrom = localStorage.getItem('clauditor_date_from') || '';
  const fromMonth = dateFrom ? dateFrom.slice(0, 7) : '';
  const { entries, durations, titles } = await readArchive(archiveHandle, fromMonth);
  const src = { entries: [...entries], durations: [...durations], titles: new Map(titles), liveSids: new Set() };

  const files = await collectJsonlFiles(dirHandle);
  for (const { handle, agentType } of files) {
    const records = await readJsonlFile(handle);
    src.entries.push(...parseEntries(records, agentType));
    src.durations.push(...parseDurations(records));
    for (const [sid, t] of parseSessionTitles(records)) { src.titles.set(sid, t); src.liveSids.add(sid); }
  }
  state.srcCode = src;
  state.srcCodeFromHandle = true;
  return { files: files.length, entries: src.entries.length };
}

// Same, from a webkitdirectory FileList (Safari / fallback input)
export async function loadCodeDataFromFiles(all) {
  const archiveHandle = await getArchiveHandle().catch(() => null);
  const dateFrom = localStorage.getItem('clauditor_date_from') || '';
  const fromMonth = dateFrom ? dateFrom.slice(0, 7) : '';
  const { entries, durations, titles } = await readArchive(archiveHandle, fromMonth);
  const src = { entries: [...entries], durations: [...durations], titles: new Map(titles), liveSids: new Set() };

  // Resolve subagent type names from .meta.json sidecars first
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
  const jsonlFiles = all.filter(f => f.webkitRelativePath.endsWith('.jsonl') && !f.webkitRelativePath.endsWith('/audit.jsonl'));
  for (const file of jsonlFiles) {
    const path = file.webkitRelativePath;
    const isSubagent = path.includes('/subagents/');
    const agentType = isSubagent ? (metaMap.get(path.replace('.jsonl', '')) || 'agent') : 'main';
    const records = parseLines(await file.text());
    src.entries.push(...parseEntries(records, agentType));
    src.durations.push(...parseDurations(records));
    for (const [sid, t] of parseSessionTitles(records)) { src.titles.set(sid, t); src.liveSids.add(sid); }
  }
  state.srcCode = src;
  state.srcCodeFromHandle = false;
  return { files: jsonlFiles.length, entries: src.entries.length };
}

// Cowork store from a webkitdirectory FileList. Each task keeps usage in TWO
// places, read both (entries dedupe globally by message id at present time):
//   …/local_<taskId>/audit.jsonl          signed transcript mirror
//   …/local_<taskId>/.claude/**/*.jsonl   full Claude Code tree incl. subagents
// Title comes from the sibling …/local_<taskId>.json metadata file.
export async function loadCoworkData(fileList) {
  const all = Array.from(fileList);
  const src = { entries: [], durations: [], titles: new Map() };
  let tasks = 0;
  const metaByPath = new Map(all.filter(f => /\/local_[^/]+\.json$/.test(f.webkitRelativePath)).map(f => [f.webkitRelativePath, f]));
  for (const af of all.filter(f => f.webkitRelativePath.endsWith('/audit.jsonl'))) {
    tasks++;
    const parts = af.webkitRelativePath.split('/');
    const dirName = parts[parts.length - 2];
    const taskId = dirName.replace(/^local_/, '');
    src.entries.push(...parseCoworkEntries(parseLines(await af.text()), taskId));
    const mf = metaByPath.get(parts.slice(0, -2).join('/') + '/' + dirName + '.json');
    if (mf) {
      try {
        const meta = JSON.parse(await mf.text());
        if (meta.title) src.titles.set(taskId, meta.title);
      } catch {}
    }
  }
  const treeFiles = all.filter(f => /\/(local_[^/]+)\/\.claude\/.+\.jsonl$/.test(f.webkitRelativePath));
  const agentMetaByPath = new Map(all.filter(f => f.webkitRelativePath.endsWith('.meta.json')).map(f => [f.webkitRelativePath, f]));
  for (const tf of treeFiles) {
    const path = tf.webkitRelativePath;
    const taskId = path.match(/\/(local_[^/]+)\/\.claude\//)[1].replace(/^local_/, '');
    let agentType = 'main';
    if (path.includes('/subagents/')) {
      const mf = agentMetaByPath.get(path.replace(/\.jsonl$/, '.meta.json'));
      agentType = 'agent';
      if (mf) { try { agentType = JSON.parse(await mf.text()).agentType || 'agent'; } catch {} }
    }
    const records = parseLines(await tf.text());
    for (const e of parseEntries(records, agentType)) {
      e.sessionId = taskId;                 // group the whole task as one session
      e.sessionKind = 'cowork';
      e.entrypoint = 'claude-desktop';
      src.entries.push(e);
    }
    for (const d of parseDurations(records)) {
      d.sessionId = taskId;
      src.durations.push(d);
    }
  }
  if (tasks > 0 || src.entries.length > 0) state.srcCowork = src;
  return { tasks, entries: src.entries.length };
}

// ─── Assembly + presentation ────────────────

export function assembleState() {
  const code = state.srcCode, cw = state.srcCowork;
  state.allEntries   = [...(code ? code.entries : []), ...(cw ? cw.entries : [])];
  state.allDurations = [...(code ? code.durations : []), ...(cw && cw.durations ? cw.durations : [])];
  const titles = new Map(code ? code.titles : []);
  if (cw) for (const [sid, t] of cw.titles) titles.set(sid, t);
  state.sessionTitles = titles;
  state.liveTitleSids = new Set([...(code ? code.liveSids : []), ...(cw ? cw.titles.keys() : [])]);
}

// Assemble sources, render, show the dashboard, persist to the archive
export async function presentDashboard(showRefresh = state.srcCodeFromHandle) {
  assembleState();
  finishLoading(showRefresh);
  const archiveHandle = await getArchiveHandle().catch(() => null);
  await writeArchive(archiveHandle);
}

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
  updateCoworkWarning();

  const todayStr = todayKey();
  // The "from" field is prefilled with the earliest loaded date — visually the
  // real start of the data, effectively no filter. Only a user-chosen date is
  // persisted (renderAll stores '' while the value equals the auto-fill), so
  // loading older data later can never be silently hidden.
  let earliest = '';
  for (const e of state.allEntries) {
    if (e.date && (!earliest || e.date < earliest)) earliest = e.date;
  }
  state.autoDateFrom = earliest;
  document.getElementById('date-from').value = localStorage.getItem('clauditor_date_from') || earliest;
  document.getElementById('date-to').value = todayStr;
  document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  document.getElementById('btn-refresh').style.display = showRefresh ? '' : 'none';

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

// ─── Compat wrappers — load and present in one step ─────────────────────────
// Used by the auto-restore on startup, re-authorize, Refresh, and Electron.

export async function loadAndRender(dirHandle) {
  hideError();
  showLoading('Scanning files…');
  try {
    await loadCodeData(dirHandle);
    await presentDashboard(true);
  } catch (e) {
    hideLoading();
    showError('Failed to read data: ' + e.message);
    console.error(e);
  }
}

// Fallback for browsers without showDirectoryPicker (e.g. Safari) using
// <input webkitdirectory> — loads Code logs AND any Cowork audit files in
// the picked tree, then presents immediately.
export async function loadFromFileInput(fileList) {
  hideError();
  showLoading('Scanning files…');
  try {
    const all = Array.from(fileList);
    await loadCodeDataFromFiles(all);
    await loadCoworkData(all);
    await presentDashboard(false);
  } catch (e) {
    hideLoading();
    showError('Failed to read data: ' + e.message);
    console.error(e);
  }
}
