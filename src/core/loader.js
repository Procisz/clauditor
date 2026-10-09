import { collectJsonlFiles } from './fs.js';
import { parseEntries, parseDurations, parseSessionTitles, parseCoworkEntries, entryKey } from './parser.js';
import { readLogFiles, mapLimit } from './logcache.js';
import { state } from './state.js';
import { showLoading, hideLoading, setLoadingText, showDashboard, showError, hideError, updatePricingWarning, updateCoworkWarning, fmtInt } from './utils.js';
import { getArchiveHandle, readArchive, writeArchive } from './archive.js';
import { todayKey } from './dates.js';
import { getUnknownModels } from './config.js';

let _renderCallback = null;
export function setRenderCallback(fn) { _renderCallback = fn; }

async function archiveBase() {
  const archiveHandle = await getArchiveHandle().catch(() => null);
  const dateFrom = localStorage.getItem('clauditor_date_from') || '';
  const fromMonth = dateFrom ? dateFrom.slice(0, 7) : '';
  const { entries, durations, titles } = await readArchive(archiveHandle, fromMonth);
  return { entries: [...entries], durations: [...durations], titles: new Map(titles), liveSids: new Set() };
}

const parseCodeFile = (records, item) => ({
  entries: parseEntries(records, item.args),
  durations: parseDurations(records),
  titles: [...parseSessionTitles(records)],
});

function addCodeResults(src, results) {
  for (const r of results) {
    for (const e of r.entries) src.entries.push(e);
    for (const d of r.durations) src.durations.push(d);
    for (const [sid, t] of r.titles) { src.titles.set(sid, t); src.liveSids.add(sid); }
  }
}

export async function loadCodeData(dirHandle, onProgress) {
  const src = await archiveBase();
  const files = await collectJsonlFiles(dirHandle);
  const items = files.map(f => ({ path: f.path, args: f.agentType, getFile: () => f.handle.getFile() }));
  const { results, stats } = await readLogFiles('code-fsa', items, parseCodeFile, { onProgress });
  addCodeResults(src, results);
  state.srcCode = src;
  state.srcCodeFromHandle = true;
  return { files: files.length, entries: src.entries.length, cache: stats };
}

export async function loadCodeDataFromFiles(all, onProgress) {
  const src = await archiveBase();
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
  const items = jsonlFiles.map(file => {
    const path = file.webkitRelativePath;
    const agentType = path.includes('/subagents/') ? (metaMap.get(path.replace('.jsonl', '')) || 'agent') : 'main';
    return { path, file, args: agentType };
  });
  const { results, stats } = await readLogFiles('code-files', items, parseCodeFile, { onProgress });
  addCodeResults(src, results);
  state.srcCode = src;
  state.srcCodeFromHandle = false;
  return { files: jsonlFiles.length, entries: src.entries.length, cache: stats };
}

const parseCoworkFile = (records, item) => item.kind === 'audit'
  ? { entries: parseCoworkEntries(records, item.taskId), durations: [], titles: [] }
  : {
      entries: parseEntries(records, item.agentType).map(e => ({ ...e, sessionId: item.taskId, sessionKind: 'cowork', entrypoint: 'claude-desktop' })),
      durations: parseDurations(records).map(d => ({ ...d, sessionId: item.taskId })),
      titles: [],
    };

export async function loadCoworkData(fileList, onProgress) {
  const all = Array.from(fileList);
  const src = { entries: [], durations: [], titles: new Map() };
  const metaByPath = new Map(all.filter(f => /\/local_[^/]+\.json$/.test(f.webkitRelativePath)).map(f => [f.webkitRelativePath, f]));
  const auditFiles = all.filter(f => f.webkitRelativePath.endsWith('/audit.jsonl'));
  const auditItems = auditFiles.map(file => {
    const parts = file.webkitRelativePath.split('/');
    const dirName = parts[parts.length - 2];
    const taskId = dirName.replace(/^local_/, '');
    return { path: file.webkitRelativePath, file, kind: 'audit', taskId, args: 'audit|' + taskId, metaPath: parts.slice(0, -2).join('/') + '/' + dirName + '.json' };
  });
  await mapLimit(auditItems, 8, async item => {
    const mf = metaByPath.get(item.metaPath);
    if (!mf) return;
    try {
      const meta = JSON.parse(await mf.text());
      if (meta.title) src.titles.set(item.taskId, meta.title);
    } catch {}
  });

  const agentMetaByPath = new Map(all.filter(f => f.webkitRelativePath.endsWith('.meta.json')).map(f => [f.webkitRelativePath, f]));
  const treeFiles = all.filter(f => /\/(local_[^/]+)\/\.claude\/.+\.jsonl$/.test(f.webkitRelativePath));
  const treeItems = await mapLimit(treeFiles, 8, async file => {
    const path = file.webkitRelativePath;
    const taskId = path.match(/\/(local_[^/]+)\/\.claude\//)[1].replace(/^local_/, '');
    let agentType = 'main';
    if (path.includes('/subagents/')) {
      agentType = 'agent';
      const mf = agentMetaByPath.get(path.replace(/\.jsonl$/, '.meta.json'));
      if (mf) { try { agentType = JSON.parse(await mf.text()).agentType || 'agent'; } catch {} }
    }
    return { path, file, kind: 'tree', taskId, agentType, args: 'tree|' + taskId + '|' + agentType };
  });

  const { results } = await readLogFiles('cowork-files', [...auditItems, ...treeItems], parseCoworkFile, { onProgress });
  for (const r of results) {
    for (const e of r.entries) src.entries.push(e);
    for (const d of r.durations) src.durations.push(d);
  }
  const tasks = auditItems.length;
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
    await loadCodeData(dirHandle, (done, total) => {
      if (done === total || done % 25 === 0) setLoadingText(`Reading logs… ${fmtInt(done)} / ${fmtInt(total)} files`);
    });
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
