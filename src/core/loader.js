import { collectJsonlFiles, readJsonlFile } from './fs.js';
import { parseEntries, parseDurations, parseSessionTitles, parseCoworkEntries, entryKey, parseJsonlLines } from './parser.js';
import { state } from './state.js';
import { showLoading, hideLoading, showDashboard, showError, hideError, updatePricingWarning, updateCoworkWarning } from './utils.js';
import { getArchiveHandle, readArchive, writeArchive } from './archive.js';
import { todayKey } from './dates.js';
import { getUnknownModels } from './config.js';

let _renderCallback = null;
export function setRenderCallback(fn) { _renderCallback = fn; }

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

export async function loadCodeDataFromFiles(all) {
  const archiveHandle = await getArchiveHandle().catch(() => null);
  const dateFrom = localStorage.getItem('clauditor_date_from') || '';
  const fromMonth = dateFrom ? dateFrom.slice(0, 7) : '';
  const { entries, durations, titles } = await readArchive(archiveHandle, fromMonth);
  const src = { entries: [...entries], durations: [...durations], titles: new Map(titles), liveSids: new Set() };

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
    const records = parseJsonlLines(await file.text());
    src.entries.push(...parseEntries(records, agentType));
    src.durations.push(...parseDurations(records));
    for (const [sid, t] of parseSessionTitles(records)) { src.titles.set(sid, t); src.liveSids.add(sid); }
  }
  state.srcCode = src;
  state.srcCodeFromHandle = false;
  return { files: jsonlFiles.length, entries: src.entries.length };
}

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
    src.entries.push(...parseCoworkEntries(parseJsonlLines(await af.text()), taskId));
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
    const records = parseJsonlLines(await tf.text());
    for (const e of parseEntries(records, agentType)) {
      e.sessionId = taskId;
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

export function assembleState() {
  const code = state.srcCode, cw = state.srcCowork;
  state.allEntries   = [...(code ? code.entries : []), ...(cw ? cw.entries : [])];
  state.allDurations = [...(code ? code.durations : []), ...(cw && cw.durations ? cw.durations : [])];
  const titles = new Map(code ? code.titles : []);
  if (cw) for (const [sid, t] of cw.titles) titles.set(sid, t);
  state.sessionTitles = titles;
  state.liveTitleSids = new Set([...(code ? code.liveSids : []), ...(cw ? cw.titles.keys() : [])]);
}

export async function presentDashboard(showRefresh = state.srcCodeFromHandle) {
  assembleState();
  finishLoading(showRefresh);
  const archiveHandle = await getArchiveHandle().catch(() => null);
  await writeArchive(archiveHandle);
}

function finishLoading(showRefresh) {

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
