import { describe, expect, it } from 'vitest';
import {
  bucketize, bucketKeyOf, cacheHitRate, cacheSavings, costByTokenType, groupTotals, histogram, hourWeekdayMatrix,
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
