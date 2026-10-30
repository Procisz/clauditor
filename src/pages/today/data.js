import { shiftDay } from '../../core/dates.js';
import { cacheHitRate, hourly, totals } from '../../core/metrics.js';
import { calcSessionTime } from '../../core/utils.js';

export const WINDOW_DAYS = 7;

export function splitDays(allEntries, day, windowSpan = WINDOW_DAYS) {
  const previousDay = shiftDay(day, -1);
  const windowFrom = shiftDay(day, -windowSpan);
  const current = [];
  const previous = [];
  const window = [];
  let first = '';
  for (const e of allEntries) {
    if (!e.date) continue;
    if (!first || e.date < first) first = e.date;
    if (e.date === day) current.push(e);
    else if (e.date === previousDay) previous.push(e);
    if (e.date >= windowFrom && e.date < day) window.push(e);
  }
  let windowDays = 0;
  if (first) {
    for (let i = 1; i <= windowSpan; i++) {
      if (shiftDay(day, -i) >= first) windowDays++;
    }
  }
  return { current, previous, window, windowDays, previousDay };
}

export function durationsOf(durations, day) {
  return durations.filter((d) => d.date === day);
}

export function averageDayByHour(windowEntries, windowDays, markup) {
  const sums = hourly(windowEntries, markup);
  return sums.map((v) => (windowDays > 0 ? v / windowDays : 0));
}

export function dayFigures(entries, durations, markup) {
  const sum = totals(entries, markup);
  const responseMs = durations.length > 0
    ? durations.reduce((acc, d) => acc + d.durationMs, 0) / durations.length
    : 0;
  return {
    totals: sum,
    sessionTimeMs: calcSessionTime(entries),
    responseMs,
    hitRate: cacheHitRate(sum),
    avgCost: sum.requests > 0 ? sum.final / sum.requests : null,
  };
}

const validTime = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function dayFraction(ts) {
  const d = validTime(ts);
  return d ? d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 : null;
}

export function cumulativePoints(entries, costOf, endX) {
  const timed = [];
  for (const e of entries) {
    const d = validTime(e.ts);
    if (d) timed.push({ ms: d.getTime(), x: dayFraction(e.ts), cost: costOf(e) });
  }
  if (timed.length === 0) return [];
  timed.sort((a, b) => a.ms - b.ms);
  let running = 0;
  const points = [{ x: 0, y: 0 }];
  for (const p of timed) {
    running += p.cost;
    points.push({ x: +p.x.toFixed(4), y: +running.toFixed(6) });
  }
  points.push({ x: endX, y: +running.toFixed(6) });
  return points;
}

export function responseByHour(durations) {
  const buckets = Array.from({ length: 24 }, () => []);
  for (const d of durations) {
    const t = validTime(d.ts);
    if (t) buckets[t.getHours()].push(d.durationMs);
  }
  return {
    avg: buckets.map((v) => (v.length ? +(v.reduce((s, x) => s + x, 0) / v.length / 1000).toFixed(2) : 0)),
    max: buckets.map((v) => (v.length ? +(Math.max(...v) / 1000).toFixed(2) : 0)),
  };
}

export function cacheRateByHour(entries) {
  const acc = Array.from({ length: 24 }, () => ({ input: 0, cacheWrite: 0, cacheRead: 0 }));
  for (const e of entries) {
    const d = validTime(e.ts);
    if (!d) continue;
    const slot = acc[d.getHours()];
    slot.input += e.input || 0;
    slot.cacheWrite += e.cacheWrite || 0;
    slot.cacheRead += e.cacheRead || 0;
  }
  return acc.map((slot) => {
    const rate = cacheHitRate(slot);
    return rate == null ? null : +(rate * 100).toFixed(1);
  });
}

export function callPoints(entries, costOf) {
  const points = [];
  for (const e of entries) {
    const x = dayFraction(e.ts);
    if (x == null) continue;
    points.push({ x: +x.toFixed(3), y: +costOf(e).toFixed(6), z: e.output || 0, sid: e.sessionId || '' });
  }
  return points;
}
