import { describe, expect, it } from 'vitest';
import {
  averageByPeriod, bucketize, bucketKeyOf, cacheHitRate, cacheSavings, costByTokenType, groupTotals, histogram, hourWeekdayMatrix,
  hourly, inRange, monthForecast, pctChange, previousRange, sessionSummaries, totals, weekdayAverages,
} from '../../../src/core/metrics.js';
import { entryCost, entryCostByType } from '../../../src/core/config.js';
import { LOCAL_MODEL, makeEntry } from '../../helpers/fixtures.js';

const cost = (entries) => entries.reduce((sum, e) => sum + entryCost(e), 0);

describe('fixtures', () => {
  it('prices the synthetic model above zero and the local model at zero', () => {
    expect(entryCost(makeEntry())).toBeGreaterThan(0);
    expect(entryCost(makeEntry({ model: LOCAL_MODEL }))).toBe(0);
  });
});

describe('previousRange', () => {
  it('returns the same number of days right before a week', () => {
    expect(previousRange({ from: '2026-10-08', to: '2026-10-14' })).toEqual({ from: '2026-10-01', to: '2026-10-07' });
  });

  it('returns the day before for a single day', () => {
    expect(previousRange({ from: '2026-10-15', to: '2026-10-15' })).toEqual({ from: '2026-10-14', to: '2026-10-14' });
  });

  it('crosses a month edge', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-03' })).toEqual({ from: '2026-10-29', to: '2026-10-31' });
  });

  it('crosses a year edge', () => {
    expect(previousRange({ from: '2027-01-01', to: '2027-01-02' })).toEqual({ from: '2026-12-30', to: '2026-12-31' });
  });

  it('returns empty bounds for a missing or reversed range', () => {
    expect(previousRange({ from: '', to: '2026-10-14' })).toEqual({ from: '', to: '' });
    expect(previousRange({ from: '2026-10-14', to: '2026-10-08' })).toEqual({ from: '', to: '' });
  });
});

describe('inRange', () => {
  const entries = [makeEntry({ ts: '2026-10-01T10:00:00Z' }), makeEntry({ ts: '2026-10-05T10:00:00Z' }), makeEntry({ ts: '2026-10-09T10:00:00Z' })];

  it('keeps entries on both boundary days', () => {
    expect(inRange(entries, { from: '2026-10-01', to: '2026-10-05' }).map((e) => e.date)).toEqual(['2026-10-01', '2026-10-05']);
  });

  it('returns everything for an open range', () => {
    expect(inRange(entries, {})).toHaveLength(3);
  });

  it('supports an open end', () => {
    expect(inRange(entries, { from: '2026-10-05' }).map((e) => e.date)).toEqual(['2026-10-05', '2026-10-09']);
  });
});

describe('bucketKeyOf', () => {
  it('maps a date to the day, its Monday or its month', () => {
    expect(bucketKeyOf('2026-10-15', 'daily')).toBe('2026-10-15');
    expect(bucketKeyOf('2026-10-15', 'weekly')).toBe('2026-10-12');
    expect(bucketKeyOf('2026-10-15', 'monthly')).toBe('2026-10');
  });
});

describe('totals', () => {
  const entries = [
    makeEntry({ sessionId: 's1', input: 100, output: 50, cacheWrite: 40, cacheWrite1h: 10, cacheRead: 200 }),
    makeEntry({ sessionId: 's1', input: 10, output: 5, cacheWrite: 0, cacheRead: 20 }),
    makeEntry({ sessionId: 's2', input: 1, output: 2, cacheWrite: 3, cacheRead: 4 }),
  ];

  it('sums tokens, counts requests and distinct sessions', () => {
    const t = totals(entries, 1);
    expect(t).toMatchObject({ input: 111, output: 57, cacheWrite: 43, cacheRead: 224, requests: 3, sessions: 2 });
    expect(t.tokens).toBe(111 + 57 + 43 + 224);
  });

  it('splits cache writes into the 5 minute and 1 hour parts', () => {
    const t = totals(entries, 1);
    expect(t.cacheWrite1h).toBe(10);
    expect(t.cacheWrite5m).toBe(33);
    expect(t.cacheWrite5m + t.cacheWrite1h).toBe(t.cacheWrite);
  });

  it('applies the markup to the final cost only', () => {
    const t = totals(entries, 1.5);
    expect(t.base).toBeCloseTo(cost(entries), 12);
    expect(t.final).toBeCloseTo(cost(entries) * 1.5, 12);
  });

  it('returns zeros for no entries', () => {
    expect(totals([], 1)).toMatchObject({ base: 0, final: 0, tokens: 0, requests: 0, sessions: 0 });
  });
});

describe('bucketize', () => {
  const entries = [
    makeEntry({ ts: '2026-10-01T10:00:00Z', input: 100, output: 0 }),
    makeEntry({ ts: '2026-10-04T10:00:00Z', input: 200, output: 0 }),
  ];

  it('fills empty days in the daily view', () => {
    const { keys, byKey } = bucketize(entries, { from: '2026-10-01', to: '2026-10-05', view: 'daily' });
    expect(keys).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    expect(byKey.get('2026-10-02').requests).toBe(0);
    expect(byKey.get('2026-10-02').base).toBe(0);
    expect(byKey.get('2026-10-04').input).toBe(200);
  });

  it('uses Monday keys in the weekly view and keeps empty weeks', () => {
    const weekly = [makeEntry({ ts: '2026-10-01T10:00:00Z' }), makeEntry({ ts: '2026-10-20T10:00:00Z' })];
    const { keys, byKey } = bucketize(weekly, { from: '2026-10-01', to: '2026-10-20', view: 'weekly' });
    expect(keys).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(byKey.get('2026-09-28').requests).toBe(1);
    expect(byKey.get('2026-10-05').requests).toBe(0);
    expect(byKey.get('2026-10-19').requests).toBe(1);
  });

  it('uses month keys in the monthly view and keeps empty months', () => {
    const monthly = [makeEntry({ ts: '2026-08-15T10:00:00Z' }), makeEntry({ ts: '2026-10-02T10:00:00Z' })];
    const { keys, byKey } = bucketize(monthly, { from: '2026-08-15', to: '2026-10-02', view: 'monthly' });
    expect(keys).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(byKey.get('2026-09').requests).toBe(0);
  });

  it('derives the range from the entries when none is given', () => {
    const { keys } = bucketize(entries, { view: 'daily' });
    expect(keys[0]).toBe('2026-10-01');
    expect(keys.at(-1)).toBe('2026-10-04');
  });

  it('returns no keys for no entries and no range', () => {
    expect(bucketize([], { view: 'daily' }).keys).toEqual([]);
  });

  it('ignores entries outside the range and applies the markup', () => {
    const { byKey } = bucketize(entries, { from: '2026-10-04', to: '2026-10-04', view: 'daily', markup: 2 });
    expect([...byKey.keys()]).toEqual(['2026-10-04']);
    expect(byKey.get('2026-10-04').final).toBeCloseTo(entryCost(entries[1]) * 2, 12);
  });
});

describe('groupTotals', () => {
  it('sorts groups by final cost descending', () => {
    const entries = [
      makeEntry({ cwd: '/a', input: 10, output: 0 }),
      makeEntry({ cwd: '/b', input: 1000, output: 0 }),
      makeEntry({ cwd: '/a', input: 10, output: 0 }),
    ];
    const list = groupTotals(entries, (e) => e.cwd, 1);
    expect(list.map((g) => g.key)).toEqual(['/b', '/a']);
    expect(list[1].requests).toBe(2);
  });
});

describe('cacheHitRate', () => {
  it('is cache reads over input, cache writes and cache reads', () => {
    expect(cacheHitRate({ input: 25, cacheWrite: 25, cacheRead: 50 })).toBe(0.5);
  });

  it('is null when there is no context at all', () => {
    expect(cacheHitRate({ input: 0, cacheWrite: 0, cacheRead: 0 })).toBeNull();
  });

  it('is 0 when nothing was read from the cache', () => {
    expect(cacheHitRate({ input: 10, cacheWrite: 0, cacheRead: 0 })).toBe(0);
  });
});

describe('pctChange', () => {
  it('returns a fraction', () => {
    expect(pctChange(150, 100)).toBe(0.5);
    expect(pctChange(50, 100)).toBe(-0.5);
  });

  it('is null when the previous value is 0', () => {
    expect(pctChange(10, 0)).toBeNull();
  });

  it('is null when a value is missing', () => {
    expect(pctChange(10, null)).toBeNull();
    expect(pctChange(Number.NaN, 5)).toBeNull();
  });
});

describe('hourly and hourWeekdayMatrix use local time', () => {
  const late = makeEntry({ ts: '2026-10-15T22:30:00.000Z' });

  it('puts an evening UTC entry on the next local day in Europe/Budapest', () => {
    const m = hourWeekdayMatrix([late], 1);
    expect(m).toHaveLength(7);
    expect(m[0]).toHaveLength(24);
    expect(m[4][0]).toBeCloseTo(entryCost(late), 12);
    expect(m[3][22]).toBe(0);
  });

  it('starts the week on Monday', () => {
    const monday = makeEntry({ ts: '2026-10-12T08:00:00.000Z' });
    const sunday = makeEntry({ ts: '2026-10-18T08:00:00.000Z' });
    const m = hourWeekdayMatrix([monday, sunday], 1);
    expect(m[0][10]).toBeCloseTo(entryCost(monday), 12);
    expect(m[6][10]).toBeCloseTo(entryCost(sunday), 12);
  });

  it('buckets hourly costs by local hour and applies the markup', () => {
    const h = hourly([late], 2);
    expect(h).toHaveLength(24);
    expect(h[0]).toBeCloseTo(entryCost(late) * 2, 12);
    expect(h[22]).toBe(0);
  });
});

describe('weekdayAverages', () => {
  const monday = makeEntry({ ts: '2026-10-05T10:00:00Z' });

  it('divides by the number of calendar days of each weekday, empty days counting as 0', () => {
    const avg = weekdayAverages([monday], { from: '2026-10-05', to: '2026-10-18' }, 1);
    expect(avg[0]).toBeCloseTo(entryCost(monday) / 2, 12);
    expect(avg.slice(1)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('counts only the days inside a short range', () => {
    const avg = weekdayAverages([monday], { from: '2026-10-05', to: '2026-10-07' }, 1);
    expect(avg[0]).toBeCloseTo(entryCost(monday), 12);
  });

  it('applies the markup', () => {
    const avg = weekdayAverages([monday], { from: '2026-10-05', to: '2026-10-05' }, 3);
    expect(avg[0]).toBeCloseTo(entryCost(monday) * 3, 12);
  });

  it('returns seven zeros without entries or range', () => {
    expect(weekdayAverages([], {}, 1)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('histogram', () => {
  it('counts values into half-open buckets with the lower edge inclusive', () => {
    expect(histogram([0.5, 1, 4.99, 5, 100], [1, 5])).toEqual([1, 2, 2]);
  });

  it('returns edges plus one zero counts for no values', () => {
    expect(histogram([], [1, 2, 3])).toEqual([0, 0, 0, 0]);
  });

  it('puts everything in the last bucket above the highest edge', () => {
    expect(histogram([10, 20], [1, 5])).toEqual([0, 0, 2]);
  });
});

describe('monthForecast', () => {
  const entries = [
    makeEntry({ ts: '2026-09-30T10:00:00Z' }),
    makeEntry({ ts: '2026-10-02T10:00:00Z' }),
    makeEntry({ ts: '2026-10-10T10:00:00Z' }),
    makeEntry({ ts: '2026-10-11T10:00:00Z' }),
  ];

  it('projects the month from the daily average up to today', () => {
    const spent = entryCost(entries[1]) + entryCost(entries[2]);
    const f = monthForecast(entries, '2026-10-10', 1);
    expect(f.month).toBe('2026-10');
    expect(f.daysInMonth).toBe(31);
    expect(f.dayOfMonth).toBe(10);
    expect(f.spent).toBeCloseTo(spent, 12);
    expect(f.dailyAvg).toBeCloseTo(spent / 10, 12);
    expect(f.projected).toBeCloseTo((spent / 10) * 31, 12);
  });

  it('builds a running cumulative series with one point per elapsed day', () => {
    const f = monthForecast(entries, '2026-10-10', 1);
    expect(f.cumulative).toHaveLength(10);
    expect(f.cumulative[0]).toBe(0);
    expect(f.cumulative[1]).toBeCloseTo(entryCost(entries[1]), 12);
    expect(f.cumulative[8]).toBeCloseTo(entryCost(entries[1]), 12);
    expect(f.cumulative[9]).toBeCloseTo(f.spent, 12);
  });

  it('knows the length of a leap February', () => {
    expect(monthForecast([], '2028-02-15', 1).daysInMonth).toBe(29);
    expect(monthForecast([], '2026-02-15', 1).daysInMonth).toBe(28);
  });

  it('applies the markup', () => {
    expect(monthForecast(entries, '2026-10-10', 2).spent).toBeCloseTo((entryCost(entries[1]) + entryCost(entries[2])) * 2, 12);
  });
});

describe('cacheSavings', () => {
  const withCache = makeEntry({ input: 1000, output: 100, cacheRead: 50_000 });
  const noCache = makeEntry({ input: 1000, output: 100, cacheRead: 0 });

  it('equals the cost of reading the cache as fresh input minus the real cost', () => {
    const expected = entryCost({ ...withCache, input: withCache.input + withCache.cacheRead, cacheRead: 0 }) - entryCost(withCache);
    expect(expected).toBeGreaterThan(0);
    expect(cacheSavings([withCache], 1)).toBeCloseTo(expected, 12);
  });

  it('is 0 without cache reads', () => {
    expect(cacheSavings([noCache], 1)).toBe(0);
  });

  it('is 0 for a local model', () => {
    expect(cacheSavings([makeEntry({ model: LOCAL_MODEL, cacheRead: 50_000 })], 1)).toBe(0);
  });

  it('scales with the markup', () => {
    expect(cacheSavings([withCache], 2)).toBeCloseTo(cacheSavings([withCache], 1) * 2, 12);
  });
});

describe('costByTokenType', () => {
  it('splits the cost by type and the parts add up to the total', () => {
    const e = makeEntry({ input: 1000, output: 400, cacheWrite: 300, cacheWrite1h: 100, cacheRead: 2000 });
    const c = costByTokenType([e], 1);
    const parts = entryCostByType(e);
    expect(c.input).toBeCloseTo(parts.input, 12);
    expect(c.cacheWrite1h).toBeCloseTo(parts.cacheWrite1h, 12);
    expect(c.total).toBeCloseTo(entryCost(e), 12);
  });

  it('multiplies every part by the markup', () => {
    const e = makeEntry();
    expect(costByTokenType([e], 2).total).toBeCloseTo(entryCost(e) * 2, 12);
  });
});

describe('sessionSummaries', () => {
  const entries = [
    makeEntry({ sessionId: 'cli', cwd: '/work/a', entrypoint: 'cli', ts: '2026-10-15T08:00:00Z', output: 100, effort: 'high' }),
    makeEntry({ sessionId: 'cli', cwd: '/work/a', entrypoint: 'cli', ts: '2026-10-15T08:10:00Z', output: 100, agentType: 'Explore' }),
    makeEntry({ sessionId: 'desk', cwd: '/work/b', entrypoint: 'claude-desktop', ts: '2026-10-15T09:00:00Z', input: 10, output: 1 }),
    makeEntry({ sessionId: 'task', cwd: '', sessionKind: 'cowork', entrypoint: 'claude-desktop', ts: '2026-10-15T10:00:00Z', input: 5, output: 1 }),
  ];
  const list = sessionSummaries(entries, 1);
  const byId = Object.fromEntries(list.map((s) => [s.sessionId, s]));

  it('derives the source from the entrypoint and the cowork kind', () => {
    expect(byId.cli.source).toBe('cli');
    expect(byId.desk.source).toBe('desktop');
    expect(byId.task.source).toBe('cowork');
    expect(byId.task.kind).toBe('cowork');
  });

  it('uses the project key of the session', () => {
    expect(byId.cli.project).toBe('/work/a');
    expect(byId.task.project).toBe('cowork:task');
  });

  it('measures duration from first to last request', () => {
    expect(byId.cli.durationMs).toBe(10 * 60_000);
    expect(byId.desk.durationMs).toBe(0);
    expect(byId.cli.start).toBe('2026-10-15T08:00:00Z');
    expect(byId.cli.end).toBe('2026-10-15T08:10:00Z');
  });

  it('breaks a session down by agent type with totals', () => {
    expect([...byId.cli.agents.keys()].sort()).toEqual(['Explore', 'main']);
    expect(byId.cli.agents.get('Explore').requests).toBe(1);
    expect(byId.cli.agents.get('main').final).toBeCloseTo(entryCost(entries[0]), 12);
    expect(byId.cli.requests).toBe(2);
  });

  it('counts effort levels and unknown effort', () => {
    expect(byId.cli.effort.get('high')).toBe(1);
    expect(byId.cli.effortUnknown).toBe(1);
  });

  it('sorts sessions by final cost descending', () => {
    const finals = list.map((s) => s.final);
    expect(finals).toEqual([...finals].sort((a, b) => b - a));
    expect(list[0].sessionId).toBe('cli');
  });

  it('applies the markup to final costs', () => {
    const doubled = sessionSummaries(entries, 2).find((s) => s.sessionId === 'cli');
    expect(doubled.final).toBeCloseTo(byId.cli.base * 2, 12);
  });
});

describe('quarterly bucketKeyOf and bucketize', () => {
  it('maps each month to its calendar quarter', () => {
    expect(bucketKeyOf('2026-01-31', 'quarterly')).toBe('2026-Q1');
    expect(bucketKeyOf('2026-03-31', 'quarterly')).toBe('2026-Q1');
    expect(bucketKeyOf('2026-04-01', 'quarterly')).toBe('2026-Q2');
    expect(bucketKeyOf('2026-06-30', 'quarterly')).toBe('2026-Q2');
    expect(bucketKeyOf('2026-07-01', 'quarterly')).toBe('2026-Q3');
    expect(bucketKeyOf('2026-10-15', 'quarterly')).toBe('2026-Q4');
    expect(bucketKeyOf('2026-12-31', 'quarterly')).toBe('2026-Q4');
  });

  it('rolls the quarter over the year edge', () => {
    const { keys } = bucketize([], { from: '2026-11-01', to: '2027-02-28', view: 'quarterly' });
    expect(keys).toEqual(['2026-Q4', '2027-Q1']);
  });

  it('zero-fills quarters without entries and sums the others', () => {
    const entries = [
      makeEntry({ ts: '2026-05-10T10:00:00Z', input: 1000, output: 0 }),
      makeEntry({ ts: '2026-12-02T10:00:00Z', input: 300, output: 200 }),
    ];
    const { keys, byKey } = bucketize(entries, { from: '2026-05-01', to: '2026-12-31', view: 'quarterly' });
    expect(keys).toEqual(['2026-Q2', '2026-Q3', '2026-Q4']);
    expect(byKey.get('2026-Q2')).toMatchObject({ requests: 1, tokens: 1000 });
    expect(byKey.get('2026-Q3')).toMatchObject({ requests: 0, final: 0, tokens: 0 });
    expect(byKey.get('2026-Q4')).toMatchObject({ requests: 1, tokens: 500 });
  });
});

describe('averageByPeriod', () => {
  const A = makeEntry({ ts: '2026-09-20T10:00:00Z', input: 1000, output: 500 });
  const B = makeEntry({ ts: '2026-10-05T10:00:00Z', input: 2000, output: 500 });
  const C = makeEntry({ ts: '2026-10-06T10:00:00Z', input: 500, output: 0 });
  const entries = [A, B, C];
  const range = { from: '2026-09-15', to: '2026-11-10' };
  const costA = entryCost(A);
  const costBC = entryCost(B) + entryCost(C);
  const total = costA + costBC;

  it('averages month, week and day buckets over the whole range, empty buckets as zero', () => {
    const result = averageByPeriod(entries, { ...range, markup: 1 });
    expect(result.month.count).toBe(3);
    expect(result.month.cost).toBeCloseTo(total / 3, 12);
    expect(result.month.tokens).toBe(1500);
    expect(result.week.count).toBe(9);
    expect(result.week.cost).toBeCloseTo(total / 9, 12);
    expect(result.week.tokens).toBe(500);
    expect(result.day.count).toBe(57);
    expect(result.day.cost).toBeCloseTo(total / 57, 12);
    expect(result.day.tokens).toBeCloseTo(4500 / 57, 9);
  });

  it('averages the quarter card over every quarter of the range', () => {
    const { quarter } = averageByPeriod(entries, range);
    expect(quarter.count).toBe(2);
    expect(quarter.cost).toBeCloseTo(total / 2, 12);
    expect(quarter.tokens).toBe(2250);
  });

  it('lists Q1 to Q4 with zeros for quarters outside the range', () => {
    const { quarters } = averageByPeriod(entries, range);
    expect(quarters).toHaveLength(4);
    expect(quarters[0]).toEqual({ q: 1, cost: 0, tokens: 0, count: 0, series: [] });
    expect(quarters[1]).toEqual({ q: 2, cost: 0, tokens: 0, count: 0, series: [] });
    expect(quarters[2].q).toBe(3);
    expect(quarters[2].count).toBe(1);
    expect(quarters[2].cost).toBeCloseTo(costA, 12);
    expect(quarters[2].tokens).toBe(1500);
    expect(quarters[3].q).toBe(4);
    expect(quarters[3].count).toBe(1);
    expect(quarters[3].cost).toBeCloseTo(costBC, 12);
    expect(quarters[3].tokens).toBe(3000);
  });

  it('averages quarters of different years with the same number together', () => {
    const may2026 = makeEntry({ ts: '2026-05-10T10:00:00Z', input: 600, output: 400 });
    const may2027 = makeEntry({ ts: '2027-05-10T10:00:00Z', input: 2000, output: 1000 });
    const { quarters, quarter } = averageByPeriod([may2026, may2027], { from: '2026-04-01', to: '2027-06-30' });
    expect(quarters[1]).toMatchObject({ q: 2, count: 2, tokens: 2000 });
    expect(quarters[1].cost).toBeCloseTo((entryCost(may2026) + entryCost(may2027)) / 2, 12);
    expect(quarters[0]).toMatchObject({ q: 1, count: 1, tokens: 0, cost: 0 });
    expect(quarter.count).toBe(5);
    expect(quarter.tokens).toBe(800);
  });

  it('applies the markup to every cost', () => {
    const plain = averageByPeriod(entries, range);
    const doubled = averageByPeriod(entries, { ...range, markup: 2 });
    expect(doubled.quarter.cost).toBeCloseTo(plain.quarter.cost * 2, 12);
    expect(doubled.day.cost).toBeCloseTo(plain.day.cost * 2, 12);
    expect(doubled.quarter.tokens).toBe(plain.quarter.tokens);
  });

  it('gives zeros for no entries and no bounds', () => {
    const zero = { cost: 0, tokens: 0, count: 0, series: [] };
    const result = averageByPeriod([]);
    expect(result).toEqual({
      quarter: zero,
      month: zero,
      week: zero,
      day: zero,
      quarters: [1, 2, 3, 4].map((q) => ({ q, ...zero })),
    });
  });

  it('counts the empty buckets of a range with no entries as zero', () => {
    const result = averageByPeriod([], range);
    expect(result.month).toEqual({ cost: 0, tokens: 0, count: 3, series: [0, 0, 0] });
    expect(result.quarter).toEqual({ cost: 0, tokens: 0, count: 2, series: [0, 0] });
  });

  it('gives zeros for a reversed range', () => {
    const result = averageByPeriod(entries, { from: '2026-11-10', to: '2026-09-15' });
    expect(result.day).toEqual({ cost: 0, tokens: 0, count: 0, series: [] });
    expect(result.quarter).toEqual({ cost: 0, tokens: 0, count: 0, series: [] });
  });

  it('uses the entry bounds when the range is empty', () => {
    const result = averageByPeriod(entries);
    expect(result.month.count).toBe(2);
    expect(result.week.count).toBe(4);
    expect(result.day.count).toBe(17);
    expect(result.quarter.count).toBe(2);
    expect(result.month.tokens).toBe(2250);
  });

  it('gives one bucket of each size for a single day', () => {
    const result = averageByPeriod([A], { from: '2026-09-20', to: '2026-09-20' });
    expect(result.day).toEqual({ cost: costA, tokens: 1500, count: 1, series: [costA] });
    expect(result.week).toEqual({ cost: costA, tokens: 1500, count: 1, series: [costA] });
    expect(result.month).toEqual({ cost: costA, tokens: 1500, count: 1, series: [costA] });
    expect(result.quarter).toEqual({ cost: costA, tokens: 1500, count: 1, series: [costA] });
  });

  it('gives the series of per-bucket final cost for the month, quarter and week cards', () => {
    const result = averageByPeriod(entries, range);
    expect(result.month.series).toHaveLength(result.month.count);
    expect(result.month.series).toHaveLength(3);
    expect(result.month.series[0]).toBeCloseTo(costA, 12);
    expect(result.month.series[1]).toBeCloseTo(costBC, 12);
    expect(result.month.series[2]).toBe(0);
    expect(result.quarter.series).toHaveLength(result.quarter.count);
    expect(result.quarter.series[0]).toBeCloseTo(costA, 12);
    expect(result.quarter.series[1]).toBeCloseTo(costBC, 12);
    expect(result.week.series).toHaveLength(result.week.count);
    expect(result.week.series.reduce((sum, value) => sum + value, 0)).toBeCloseTo(total, 12);
  });

  it('gives one day series value per day of the range, in day order', () => {
    const result = averageByPeriod(entries, range);
    expect(result.day.series).toHaveLength(result.day.count);
    expect(result.day.series).toHaveLength(57);
    expect(result.day.series[5]).toBeCloseTo(costA, 12);
    expect(result.day.series[20]).toBeCloseTo(entryCost(B), 12);
    expect(result.day.series[21]).toBeCloseTo(entryCost(C), 12);
    expect(result.day.series[0]).toBe(0);
    expect(result.day.series.reduce((sum, value) => sum + value, 0)).toBeCloseTo(total, 12);
  });

  it('gives the series of each quarter in the list, empty for quarters outside the range', () => {
    const { quarters } = averageByPeriod(entries, range);
    expect(quarters[0].series).toEqual([]);
    expect(quarters[1].series).toEqual([]);
    expect(quarters[2].series).toHaveLength(quarters[2].count);
    expect(quarters[2].series[0]).toBeCloseTo(costA, 12);
    expect(quarters[3].series).toHaveLength(quarters[3].count);
    expect(quarters[3].series[0]).toBeCloseTo(costBC, 12);
  });

  it('gives the series of the same quarter number across years, one value per bucket', () => {
    const may2026 = makeEntry({ ts: '2026-05-10T10:00:00Z', input: 600, output: 400 });
    const may2027 = makeEntry({ ts: '2027-05-10T10:00:00Z', input: 2000, output: 1000 });
    const { quarters } = averageByPeriod([may2026, may2027], { from: '2026-04-01', to: '2027-06-30' });
    expect(quarters[1].series).toEqual([entryCost(may2026), entryCost(may2027)]);
  });

  it('applies the markup to every series value', () => {
    const plain = averageByPeriod(entries, range);
    const doubled = averageByPeriod(entries, { ...range, markup: 2 });
    expect(doubled.month.series[0]).toBeCloseTo(plain.month.series[0] * 2, 12);
    expect(doubled.month.series[1]).toBeCloseTo(plain.month.series[1] * 2, 12);
    expect(doubled.day.series[20]).toBeCloseTo(plain.day.series[20] * 2, 12);
    expect(doubled.quarters[3].series[0]).toBeCloseTo(plain.quarters[3].series[0] * 2, 12);
  });

  it('gives one zero series value for an empty single-day range and an empty series without bounds', () => {
    const result = averageByPeriod([], { from: '2026-09-15', to: '2026-09-15' });
    expect(result.day.series).toEqual([0]);
    expect(result.quarter.series).toEqual([0]);
    expect(averageByPeriod([]).month.series).toEqual([]);
  });
});
