import { entryCost, entryCostByType, cacheWrite1h, cacheWrite5m } from './config.js';
import { getWeekKey, getMonthKey, shiftDay } from './dates.js';
import { projectKey } from './utils.js';

const DAY_MS = 86_400_000;

const dayNumber = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

const weekdayOf = (dateStr) => (new Date(dayNumber(dateStr) * DAY_MS).getUTCDay() + 6) % 7;

const daysInMonthOf = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export function previousRange({ from, to }) {
  if (!from || !to) return { from: '', to: '' };
  const days = Math.round(dayNumber(to) - dayNumber(from)) + 1;
  if (days < 1) return { from: '', to: '' };
  return { from: shiftDay(from, -days), to: shiftDay(from, -1) };
}

export function inRange(entries, { from = '', to = '' } = {}) {
  if (!from && !to) return entries;
  return entries.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
}

export function bucketKeyOf(date, view) {
  if (view === 'weekly') return getWeekKey(date);
  if (view === 'monthly') return getMonthKey(date);
  return date;
}

function emptyAcc() {
  return { base: 0, input: 0, output: 0, cacheWrite: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, requests: 0, sessionIds: new Set() };
}

function addToAcc(acc, e) {
  acc.base += entryCost(e);
  acc.input += e.input || 0;
  acc.output += e.output || 0;
  acc.cacheWrite += e.cacheWrite || 0;
  acc.cacheWrite5m += cacheWrite5m(e);
  acc.cacheWrite1h += cacheWrite1h(e);
  acc.cacheRead += e.cacheRead || 0;
  acc.requests++;
  if (e.sessionId) acc.sessionIds.add(e.sessionId);
}

function finishAcc(acc, markup) {
  const { sessionIds, ...rest } = acc;
  return {
    ...rest,
    final: acc.base * markup,
    tokens: acc.input + acc.output + acc.cacheWrite + acc.cacheRead,
    sessions: sessionIds.size,
  };
}

export function totals(entries, markup = 1) {
  const acc = emptyAcc();
  for (const e of entries) addToAcc(acc, e);
  return finishAcc(acc, markup);
}

function nextBucketKey(key, view) {
  if (view === 'weekly') return shiftDay(key, 7);
  if (view === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return shiftDay(key, 1);
}

function entryBounds(entries) {
  let lo = '';
  let hi = '';
  for (const e of entries) {
    if (!e.date) continue;
    if (!lo || e.date < lo) lo = e.date;
    if (!hi || e.date > hi) hi = e.date;
  }
  return { from: lo, to: hi };
}

export function bucketize(entries, { from = '', to = '', view = 'daily', markup = 1 } = {}) {
  const bounds = !from || !to ? entryBounds(entries) : { from, to };
  const first = from || bounds.from;
  const last = to || bounds.to;
  const keys = [];
  if (first && last && first <= last) {
    const endKey = bucketKeyOf(last, view);
    let key = bucketKeyOf(first, view);
    while (key <= endKey) {
      keys.push(key);
      key = nextBucketKey(key, view);
    }
  }
  const accs = new Map(keys.map((k) => [k, emptyAcc()]));
  for (const e of entries) {
    if (!e.date) continue;
    const acc = accs.get(bucketKeyOf(e.date, view));
    if (acc) addToAcc(acc, e);
  }
  const byKey = new Map();
  for (const [k, acc] of accs) byKey.set(k, finishAcc(acc, markup));
  return { keys, byKey };
}

export function groupTotals(entries, keyFn, markup = 1) {
  const accs = new Map();
  for (const e of entries) {
    const key = keyFn(e);
    let acc = accs.get(key);
    if (!acc) accs.set(key, (acc = emptyAcc()));
    addToAcc(acc, e);
  }
  const list = [];
  for (const [key, acc] of accs) list.push({ key, ...finishAcc(acc, markup) });
  return list.sort((a, b) => b.final - a.final || String(a.key).localeCompare(String(b.key)));
}

export function cacheHitRate(t) {
  const context = (t.input || 0) + (t.cacheWrite || 0) + (t.cacheRead || 0);
  return context > 0 ? t.cacheRead / context : null;
}

export function pctChange(cur, prev) {
  if (prev == null || prev === 0 || !Number.isFinite(prev) || !Number.isFinite(cur)) return null;
  return (cur - prev) / prev;
}

const validDate = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function hourly(entries, markup = 1) {
  const out = new Array(24).fill(0);
  for (const e of entries) {
    const d = validDate(e.ts);
    if (d) out[d.getHours()] += entryCost(e) * markup;
  }
  return out;
}

export function hourWeekdayMatrix(entries, markup = 1) {
  const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const e of entries) {
    const d = validDate(e.ts);
    if (d) matrix[(d.getDay() + 6) % 7][d.getHours()] += entryCost(e) * markup;
  }
  return matrix;
}

export function weekdayAverages(entries, { from = '', to = '' } = {}, markup = 1) {
  const bounds = !from || !to ? entryBounds(entries) : { from, to };
  const first = from || bounds.from;
  const last = to || bounds.to;
  const sums = new Array(7).fill(0);
  const days = new Array(7).fill(0);
  if (!first || !last || first > last) return sums;
  const lastDay = dayNumber(last);
  for (let n = dayNumber(first); n <= lastDay; n++) days[(new Date(n * DAY_MS).getUTCDay() + 6) % 7]++;
  for (const e of inRange(entries, { from: first, to: last })) {
    if (e.date) sums[weekdayOf(e.date)] += entryCost(e) * markup;
  }
  return sums.map((sum, i) => (days[i] > 0 ? sum / days[i] : 0));
}

function sessionSource(entrypoint, kind) {
  if (kind === 'cowork') return 'cowork';
  return String(entrypoint || '').toLowerCase() === 'claude-desktop' ? 'desktop' : 'cli';
}

export function sessionSummaries(entries, markup = 1) {
  const map = new Map();
  for (const e of entries) {
    const id = e.sessionId || '';
    let s = map.get(id);
    if (!s) {
      s = {
        sessionId: id,
        kind: 'code',
        entrypoint: '',
        project: '',
        start: '',
        end: '',
        slug: '',
        acc: emptyAcc(),
        models: new Map(),
        effort: new Map(),
        effortUnknown: 0,
        agents: new Map(),
      };
      map.set(id, s);
    }
    if (e.sessionKind === 'cowork') s.kind = 'cowork';
    if (!s.entrypoint && e.entrypoint) s.entrypoint = e.entrypoint;
    if (!s.slug && e.slug) s.slug = e.slug;
    if (!s.project && (e.cwd || e.sessionKind === 'cowork')) s.project = projectKey(e);
    if (e.ts && (!s.start || e.ts < s.start)) s.start = e.ts;
    if (e.ts && e.ts > s.end) s.end = e.ts;
    const cost = entryCost(e);
    const tokens = (e.input || 0) + (e.output || 0) + (e.cacheWrite || 0) + (e.cacheRead || 0);
    addToAcc(s.acc, e);
    const model = s.models.get(e.model) ?? { requests: 0, tokens: 0, output: 0, base: 0 };
    model.requests++;
    model.tokens += tokens;
    model.output += e.output || 0;
    model.base += cost;
    s.models.set(e.model, model);
    const agentType = e.agentType || 'main';
    const agent = s.agents.get(agentType) ?? { requests: 0, tokens: 0, output: 0, base: 0 };
    agent.requests++;
    agent.tokens += tokens;
    agent.output += e.output || 0;
    agent.base += cost;
    s.agents.set(agentType, agent);
    if (e.effort) s.effort.set(e.effort, (s.effort.get(e.effort) ?? 0) + 1);
    else s.effortUnknown++;
  }

  const withFinal = (m) => {
    const sorted = [...m.entries()].sort((a, b) => b[1].base - a[1].base);
    return new Map(sorted.map(([k, v]) => [k, { ...v, final: v.base * markup }]));
  };

  const list = [];
  for (const s of map.values()) {
    const sum = finishAcc(s.acc, markup);
    const startMs = s.start ? new Date(s.start).getTime() : NaN;
    const endMs = s.end ? new Date(s.end).getTime() : NaN;
    list.push({
      sessionId: s.sessionId,
      kind: s.kind,
      source: sessionSource(s.entrypoint, s.kind),
      project: s.project || '(unknown)',
      slug: s.slug,
      start: s.start,
      end: s.end,
      durationMs: Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : 0,
      requests: sum.requests,
      tokens: sum.tokens,
      input: sum.input,
      output: sum.output,
      cacheWrite: sum.cacheWrite,
      cacheWrite1h: sum.cacheWrite1h,
      cacheRead: sum.cacheRead,
      base: sum.base,
      final: sum.final,
      models: withFinal(s.models),
      effort: s.effort,
      effortUnknown: s.effortUnknown,
      agents: withFinal(s.agents),
    });
  }
  return list.sort((a, b) => b.final - a.final || a.sessionId.localeCompare(b.sessionId));
}

export function histogram(values, edges) {
  const counts = new Array(edges.length + 1).fill(0);
  for (const v of values) {
    let i = 0;
    while (i < edges.length && v >= edges[i]) i++;
    counts[i]++;
  }
  return counts;
}

export function monthForecast(entries, today, markup = 1) {
  const month = today.slice(0, 7);
  const daysInMonth = daysInMonthOf(month);
  const dayOfMonth = Number(today.slice(8, 10));
  const perDay = new Array(dayOfMonth).fill(0);
  for (const e of entries) {
    if (!e.date || !e.date.startsWith(month) || e.date > today) continue;
    perDay[Number(e.date.slice(8, 10)) - 1] += entryCost(e) * markup;
  }
  let running = 0;
  const cumulative = perDay.map((v) => (running += v));
  const spent = running;
  const dailyAvg = dayOfMonth > 0 ? spent / dayOfMonth : 0;
  return { month, daysInMonth, dayOfMonth, spent, dailyAvg, projected: dailyAvg * daysInMonth, cumulative };
}

export function costByTokenType(entries, markup = 1) {
  const out = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, total: 0 };
  for (const e of entries) {
    const c = entryCostByType(e);
    out.input += c.input;
    out.output += c.output;
    out.cacheWrite5m += c.cacheWrite5m;
    out.cacheWrite1h += c.cacheWrite1h;
    out.cacheRead += c.cacheRead;
  }
  out.input *= markup;
  out.output *= markup;
  out.cacheWrite5m *= markup;
  out.cacheWrite1h *= markup;
  out.cacheRead *= markup;
  out.total = out.input + out.output + out.cacheWrite5m + out.cacheWrite1h + out.cacheRead;
  return out;
}

export function cacheSavings(entries, markup = 1) {
  let saved = 0;
  for (const e of entries) {
    if (!e.cacheRead) continue;
    saved += entryCost({ ...e, input: (e.input || 0) + e.cacheRead, cacheRead: 0 }) - entryCost(e);
  }
  return saved * markup;
}
