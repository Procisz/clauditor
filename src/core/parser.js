// ─────────────────────────────────────────────
// PARSE — extract usage entries and aggregation helpers
// ─────────────────────────────────────────────
import { calcCost } from './config.js';
import { state } from './state.js';
import { dayKey, todayKey, getWeekKey, getMonthKey } from './dates.js';

// Identity keys shared by the loader dedupe and the archive's append-only
// writes. Streaming writes multiple partial entries per message ID, and the
// archive re-reads entries that may still exist in live files — every "have
// I seen this record" check MUST go through these two functions so the three
// call sites (loader dedupe, archive write, archive merge) can never drift.
export function entryKey(e)    { return e.msgId || (e.ts + '|' + e.sessionId); }
export function durationKey(d) { return d.ts + '|' + d.sessionId; }

export function parseEntries(records, agentType = 'main') {
  const entries = [];
  for (const r of records) {
    if (r.type !== 'assistant') continue;
    const usage = r.message?.usage;
    if (!usage) continue;
    entries.push({
      ts:         r.timestamp || '',
      date:       dayKey(r.timestamp || ''),
      model:      r.message?.model || 'unknown',
      sessionId:  r.sessionId || '',
      cwd:        r.cwd || '',
      slug:       r.slug || '',
      msgId:      r.message?.id || '',
      agentType,
      entrypoint: r.entrypoint || '',
      sessionKind: 'code',
      input:      usage.input_tokens || 0,
      output:     usage.output_tokens || 0,
      cacheWrite: usage.cache_creation_input_tokens || 0,
      cacheRead:  usage.cache_read_input_tokens || 0,
    });
  }
  return entries;
}

// Session titles: Claude Desktop (and newer CLI builds) periodically write
// {type:'custom-title', customTitle, sessionId} records — the same names the
// Desktop sidebar shows. The record is re-stamped over time, so last one wins.
export function parseSessionTitles(records) {
  const titles = new Map();
  for (const r of records) {
    if (r.type !== 'custom-title') continue;
    if (!r.customTitle || !r.sessionId) continue;
    titles.set(r.sessionId, r.customTitle);
  }
  return titles;
}

export function parseDurations(records) {
  const durations = [];
  for (const r of records) {
    if (r.type !== 'system' || r.subtype !== 'turn_duration') continue;
    if (!r.durationMs) continue;
    durations.push({
      ts:        r.timestamp || '',
      date:      dayKey(r.timestamp || ''),
      sessionId: r.sessionId || '',
      cwd:       r.cwd || '',
      durationMs: r.durationMs,
    });
  }
  return durations;
}

// Cowork audit.jsonl transcripts (Desktop app local-agent-mode-sessions).
// Same assistant/usage shape as Claude Code logs, but session ids are
// snake_case and per-command — all records of a task are grouped under the
// task's own id so one Cowork task = one session row.
export function parseCoworkEntries(records, taskId) {
  const entries = [];
  for (const r of records) {
    if (r.type !== 'assistant') continue;
    const usage = r.message?.usage;
    if (!usage) continue;
    entries.push({
      ts:         r.timestamp || '',
      date:       dayKey(r.timestamp || ''),
      model:      r.message?.model || 'unknown',
      sessionId:  taskId,
      cwd:        '',
      slug:       '',
      msgId:      r.message?.id || '',
      agentType:  'main',
      entrypoint: 'claude-desktop',
      sessionKind: 'cowork',
      input:      usage.input_tokens || 0,
      output:     usage.output_tokens || 0,
      cacheWrite: usage.cache_creation_input_tokens || 0,
      cacheRead:  usage.cache_read_input_tokens || 0,
    });
  }
  return entries;
}

// Session taxonomy. Type: 'Chat' | 'Cowork' | 'Code' — what kind of Claude
// session produced the logs. ~/.claude/projects holds only Claude Code
// sessions; Cowork tasks live in the Desktop app's local-agent-mode-sessions
// store (loaded via cowork.js, entries tagged sessionKind:'cowork'); Chat
// conversations are server-side only and have no local data.
export function sessionType(kind) {
  return kind === 'cowork' ? 'Cowork' : 'Code';
}

// Source: 'Desktop app' | 'CLI' — where the Code session ran. Desktop Code-tab
// sessions stamp entrypoint:'claude-desktop' on every record; terminal
// sessions stamp 'cli' or (in older CLI versions) nothing at all.
export function sessionOrigin(entrypoint) {
  return (entrypoint || '').toLowerCase() === 'claude-desktop' ? 'Desktop app' : 'CLI';
}

export function getFilteredEntries() {
  const from = document.getElementById('date-from').value;
  const to   = document.getElementById('date-to').value;
  if (!from && !to) return state.allEntries;
  return state.allEntries.filter(e => {
    if (from && e.date < from) return false;
    if (to   && e.date > to)   return false;
    return true;
  });
}

export function getCurrentBucketKey() {
  const today = todayKey();
  if (state.view === 'daily')  return today;
  if (state.view === 'weekly') return getWeekKey(today);
  return getMonthKey(today);
}

export function bucketEntries(entries) {
  const map = new Map();
  for (const e of entries) {
    let key;
    if (state.view === 'daily')        key = e.date;
    else if (state.view === 'weekly')  key = getWeekKey(e.date);
    else                               key = getMonthKey(e.date);

    if (!map.has(key)) map.set(key, { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, baseCost: 0 });
    const b = map.get(key);
    b.input      += e.input;
    b.output     += e.output;
    b.cacheWrite += e.cacheWrite;
    b.cacheRead  += e.cacheRead;
    b.baseCost   += calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model);
  }
  // Fill gaps — always extend to current bucket even if it has no data
  if (map.size === 0) return { labels: [], data: map };

  const keys = [...map.keys()].sort();
  const curKey = getCurrentBucketKey();
  const dateFrom = localStorage.getItem('clauditor_date_from') || document.getElementById('date-from')?.value || '';
  const inputBucketKey = dateFrom
    ? (state.view === 'daily' ? dateFrom : state.view === 'weekly' ? getWeekKey(dateFrom) : getMonthKey(dateFrom))
    : null;
  const from = inputBucketKey && inputBucketKey < keys[0] ? inputBucketKey : keys[0];
  const to = curKey > keys[keys.length - 1] ? curKey : keys[keys.length - 1];
  const filledSet = new Set();
  // Iteration is pure calendar math on day strings — UTC internals are safe here
  const toDateStr = v => state.view === 'monthly' ? v + '-01' : v;
  let cur = new Date(toDateStr(from) + 'T00:00:00Z');
  const end = new Date(toDateStr(to) + 'T00:00:00Z');
  while (cur <= end) {
    let key;
    if (state.view === 'daily')        key = cur.toISOString().slice(0, 10);
    else if (state.view === 'weekly')  key = getWeekKey(cur.toISOString().slice(0, 10));
    else                               key = cur.toISOString().slice(0, 7);
    filledSet.add(key);
    if (state.view === 'daily')        cur.setUTCDate(cur.getUTCDate() + 1);
    else if (state.view === 'weekly')  cur.setUTCDate(cur.getUTCDate() + 7);
    else                               cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return { labels: [...filledSet], data: map };
}
