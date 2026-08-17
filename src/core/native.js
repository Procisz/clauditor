// ─────────────────────────────────────────────
// NATIVE — Electron-only auto-loader. The preload script exposes
// window.clauditorFS (list/read restricted to the two data roots); with it
// the app discovers ~/.claude/projects AND the Desktop app's Cowork store
// automatically — no pickers, no permission prompts, no welcome screen.
// ─────────────────────────────────────────────
import { state } from './state.js';
import { parseEntries, parseDurations, parseSessionTitles, parseCoworkEntries } from './parser.js';

export function hasNativeBridge() {
  return typeof window !== 'undefined' && !!window.clauditorFS;
}

function parseLines(text) {
  const records = [];
  if (!text) return records;
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    try { records.push(JSON.parse(l)); } catch {}
  }
  return records;
}

async function walk(fsx, dir, visit) {
  let items;
  try { items = await fsx.list(dir); } catch { return; }  // root may not exist
  for (const it of items) {
    const p = dir + '/' + it.name;
    if (it.dir) await walk(fsx, p, visit);
    else await visit(p, it.name, dir);
  }
}

// Reads both sources into state.srcCode / state.srcCowork; returns counts
export async function nativeInit() {
  const fsx = window.clauditorFS;
  const { projects, cowork } = await fsx.paths();

  const code = { entries: [], durations: [], titles: new Map(), liveSids: new Set() };
  let codeFiles = 0;
  await walk(fsx, projects, async (p, name, dir) => {
    if (!name.endsWith('.jsonl') || name === 'audit.jsonl') return;
    codeFiles++;
    let agentType = 'main';
    if (dir.includes('/subagents')) {
      try {
        const meta = JSON.parse(await fsx.read(p.replace(/\.jsonl$/, '.meta.json')));
        agentType = meta.agentType || 'agent';
      } catch { agentType = 'agent'; }
    }
    const records = parseLines(await fsx.read(p));
    code.entries.push(...parseEntries(records, agentType));
    code.durations.push(...parseDurations(records));
    for (const [sid, t] of parseSessionTitles(records)) { code.titles.set(sid, t); code.liveSids.add(sid); }
  });

  // Cowork tasks keep usage in TWO places: the signed audit.jsonl mirror AND
  // a full private Claude Code tree at local_<id>/.claude/projects/… (which
  // also holds subagent sidechains the audit lacks). Read both — entries
  // dedupe globally by message id at present time.
  const cw = { entries: [], durations: [], titles: new Map() };
  let coworkTasks = 0;
  await walk(fsx, cowork, async (p, name, dir) => {
    if (!name.endsWith('.jsonl')) return;
    if (name === 'audit.jsonl') {
      coworkTasks++;
      const dirName = dir.split('/').pop();
      const taskId = dirName.replace(/^local_/, '');
      cw.entries.push(...parseCoworkEntries(parseLines(await fsx.read(p)), taskId));
      try {
        const parent = dir.slice(0, dir.length - dirName.length - 1);
        const meta = JSON.parse(await fsx.read(parent + '/' + dirName + '.json'));
        if (meta.title) cw.titles.set(taskId, meta.title);
      } catch {}
      return;
    }
    const m = dir.match(/\/(local_[^/]+)\/\.claude\//);
    if (!m) return;  // stray jsonl outside a task's .claude tree
    const taskId = m[1].replace(/^local_/, '');
    let agentType = 'main';
    if (dir.includes('/subagents')) {
      try {
        const meta = JSON.parse(await fsx.read(p.replace(/\.jsonl$/, '.meta.json')));
        agentType = (meta && meta.agentType) || 'agent';
      } catch { agentType = 'agent'; }
    }
    const records = parseLines(await fsx.read(p));
    for (const e of parseEntries(records, agentType)) {
      e.sessionId = taskId;                 // group the whole task as one session
      e.sessionKind = 'cowork';
      e.entrypoint = 'claude-desktop';
      cw.entries.push(e);
    }
    for (const d of parseDurations(records)) {
      d.sessionId = taskId;
      cw.durations.push(d);
    }
  });

  state.srcCode = code;
  state.srcCodeFromHandle = true;  // Refresh re-runs the native read
  state.srcCowork = cw.entries.length > 0 ? cw : null;
  return { codeFiles, codeEntries: code.entries.length, coworkTasks, coworkEntries: cw.entries.length };
}
