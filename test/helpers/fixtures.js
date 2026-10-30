import { dayKey } from '../../src/core/dates.js';

export const PRICED_MODEL = 'claude-opus-999';
export const LOCAL_MODEL = 'gpt-oss:20b';

let counter = 0;

export function makeEntry(overrides = {}) {
  const ts = overrides.ts ?? '2026-10-15T08:30:00.000Z';
  counter++;
  return {
    ts,
    date: dayKey(ts),
    model: PRICED_MODEL,
    sessionId: 'sess-1',
    cwd: '/work/alpha',
    slug: '',
    msgId: `msg-${counter}`,
    agentType: 'main',
    entrypoint: 'cli',
    effort: '',
    sessionKind: 'code',
    input: 1000,
    output: 500,
    cacheWrite: 0,
    cacheWrite1h: 0,
    cacheRead: 0,
    ...overrides,
  };
}

export function fixtureEntries() {
  return [
    makeEntry({ ts: '2026-10-15T07:10:00.000Z', sessionId: 'sess-a', cwd: '/work/alpha', input: 2000, output: 800, cacheWrite: 400, cacheWrite1h: 100, cacheRead: 3000, effort: 'high' }),
    makeEntry({ ts: '2026-10-15T08:20:00.000Z', sessionId: 'sess-a', cwd: '/work/alpha', agentType: 'Explore', input: 500, output: 200, cacheRead: 900 }),
    makeEntry({ ts: '2026-10-14T09:00:00.000Z', sessionId: 'sess-b', cwd: '/work/beta', entrypoint: 'claude-desktop', input: 1500, output: 600, cacheRead: 100 }),
    makeEntry({ ts: '2026-10-13T11:00:00.000Z', sessionId: 'sess-c', cwd: '/work/beta', input: 700, output: 300 }),
    makeEntry({ ts: '2026-10-10T12:00:00.000Z', sessionId: 'task-1', cwd: '', sessionKind: 'cowork', entrypoint: 'claude-desktop', input: 900, output: 400 }),
    makeEntry({ ts: '2026-09-20T12:00:00.000Z', sessionId: 'sess-d', cwd: '/work/gamma', input: 1200, output: 500 }),
    makeEntry({ ts: '2026-10-15T09:00:00.000Z', sessionId: 'sess-e', cwd: '/work/local', model: LOCAL_MODEL, input: 4000, output: 1000 }),
  ];
}

export function fixtureDurations() {
  return [
    { ts: '2026-10-15T07:12:00.000Z', date: '2026-10-15', sessionId: 'sess-a', cwd: '/work/alpha', durationMs: 42_000 },
    { ts: '2026-10-14T09:02:00.000Z', date: '2026-10-14', sessionId: 'sess-b', cwd: '/work/beta', durationMs: 18_000 },
  ];
}
