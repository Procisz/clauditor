// ─────────────────────────────────────────────
// PARSE — extract usage entries and aggregation helpers
// ─────────────────────────────────────────────
import { calcCost } from './config.js';
import { state } from './state.js';

export function parseEntries(records, agentType = 'main') {
  const entries = [];
  for (const r of records) {
    if (r.type !== 'assistant') continue;
    const usage = r.message?.usage;
    if (!usage) continue;
    entries.push({
      ts:         r.timestamp || '',
      date:       (r.timestamp || '').slice(0, 10),
      model:      r.message?.model || 'unknown',
      sessionId:  r.sessionId || '',
      cwd:        r.cwd || '',
      slug:       r.slug || '',
      msgId:      r.message?.id || '',
      agentType,
      input:      usage.input_tokens || 0,
      output:     usage.output_tokens || 0,
      cacheWrite: usage.cache_creation_input_tokens || 0,
      cacheRead:  usage.cache_read_input_tokens || 0,
    });
  }
  return entries;
}

export function parseDurations(records) {
  const durations = [];
  for (const r of records) {
    if (r.type !== 'system' || r.subtype !== 'turn_duration') continue;
    if (!r.durationMs) continue;
    durations.push({
      ts:        r.timestamp || '',
      date:      (r.timestamp || '').slice(0, 10),
      sessionId: r.sessionId || '',
      cwd:       r.cwd || '',
      durationMs: r.durationMs,
    });
  }
  return durations;
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

export function getWeekKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=Sun
  const diff = d - day + (day === 0 ? -6 : 1); // Mon
  const mon = new Date(Date.UTC(y, m - 1, diff));
  return mon.toISOString().slice(0, 10);
}

export function getMonthKey(dateStr) { return dateStr.slice(0, 7); }

export function getCurrentBucketKey() {
  const today = new Date().toISOString().slice(0, 10);
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
  // Use UTC dates with explicit day suffix for monthly keys to avoid timezone/invalid-date issues
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
