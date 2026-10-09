import { state } from './state.js';
import { parseEntries, parseDurations, parseSessionTitles, parseCoworkEntries, parseLogLines } from './parser.js';

export function hasNativeBridge() {
  return typeof window !== 'undefined' && !!window.clauditorFS;
}

async function walk(fsx, dir, visit) {
  let items;
  try { items = await fsx.list(dir); } catch { return; }
  for (const it of items) {
    const p = dir + '/' + it.name;
    if (it.dir) await walk(fsx, p, visit);
    else await visit(p, it.name, dir);
  }
}

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
    const records = parseLogLines(await fsx.read(p));
    code.entries.push(...parseEntries(records, agentType));
    code.durations.push(...parseDurations(records));
    for (const [sid, t] of parseSessionTitles(records)) { code.titles.set(sid, t); code.liveSids.add(sid); }
  });

  const cw = { entries: [], durations: [], titles: new Map() };
  let coworkTasks = 0;
  await walk(fsx, cowork, async (p, name, dir) => {
    if (!name.endsWith('.jsonl')) return;
    if (name === 'audit.jsonl') {
      coworkTasks++;
      const dirName = dir.split('/').pop();
      const taskId = dirName.replace(/^local_/, '');
      cw.entries.push(...parseCoworkEntries(parseLogLines(await fsx.read(p)), taskId));
      try {
        const parent = dir.slice(0, dir.length - dirName.length - 1);
        const meta = JSON.parse(await fsx.read(parent + '/' + dirName + '.json'));
        if (meta.title) cw.titles.set(taskId, meta.title);
      } catch {}
      return;
    }
    const m = dir.match(/\/(local_[^/]+)\/\.claude\//);
    if (!m) return;
    const taskId = m[1].replace(/^local_/, '');
    let agentType = 'main';
    if (dir.includes('/subagents')) {
      try {
        const meta = JSON.parse(await fsx.read(p.replace(/\.jsonl$/, '.meta.json')));
        agentType = (meta && meta.agentType) || 'agent';
      } catch { agentType = 'agent'; }
    }
    const records = parseLogLines(await fsx.read(p));
    for (const e of parseEntries(records, agentType)) {
      e.sessionId = taskId;
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
  state.srcCodeFromHandle = true;
  state.srcCowork = cw.entries.length > 0 ? cw : null;
  return { codeFiles, codeEntries: code.entries.length, coworkTasks, coworkEntries: cw.entries.length };
}
