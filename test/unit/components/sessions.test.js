import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionColumns, sessionRows, renderSessionsSubTable, renderAgentBreakdown, effortsSorted } from '../../../src/components/sessions.js';
import { openSessionModal } from '../../../src/components/session-modal.js';
import { bucketTitle, openBucketModal } from '../../../src/components/bucket-modal.js';
import { sessionSummaries } from '../../../src/core/metrics.js';
import { entryCost } from '../../../src/core/config.js';
import { state } from '../../../src/core/state.js';
import { fmtMoney } from '../../../src/core/utils.js';
import { click, flush, mountPanel } from '../../helpers/dom.js';
import { fixtureDurations, fixtureEntries, makeEntry } from '../../helpers/fixtures.js';

beforeEach(() => {
  state.markup = 1;
  state.sessionTitles = new Map();
});

describe('sessionColumns and sessionRows', () => {
  it('omits the requested columns', () => {
    expect(sessionColumns().map((c) => c.key)).toContain('project');
    expect(sessionColumns({ omit: ['project'] }).map((c) => c.key)).not.toContain('project');
  });

  it('has a cost column with the key used for the default sort', () => {
    expect(sessionColumns().some((c) => c.key === 'cost')).toBe(true);
  });

  it('builds a row per summary with its id and summary attached', () => {
    const summaries = sessionSummaries(fixtureEntries(), 1);
    const rows = sessionRows(summaries);
    expect(rows).toHaveLength(summaries.length);
    expect(rows[0].sessionId).toBe(summaries[0].sessionId);
    expect(rows[0].summary).toBe(summaries[0]);
    expect(rows[0].cost.v).toBeCloseTo(summaries[0].final, 12);
  });

  it('names a session by its custom title before its id', () => {
    state.sessionTitles = new Map([['sess-a', 'My title']]);
    const row = sessionRows(sessionSummaries(fixtureEntries(), 1)).find((r) => r.sessionId === 'sess-a');
    expect(row.name.html).toContain('My title');
  });
});

describe('renderSessionsSubTable', () => {
  it('lists the sessions most expensive first and opens one on click', async () => {
    const panel = mountPanel('models');
    const host = document.createElement('div');
    panel.append(host);
    const onOpen = vi.fn();
    const entries = fixtureEntries().filter((e) => e.cwd === '/work/alpha' || e.cwd === '/work/beta');
    renderSessionsSubTable(host, entries, { onOpen });
    const rows = host.querySelectorAll('tbody tr');
    const summaries = sessionSummaries(entries, 1);
    expect(rows).toHaveLength(summaries.length);
    click(rows[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(summaries[0].sessionId);
  });
});

describe('renderAgentBreakdown', () => {
  it('shows one row per agent type and model with its cost', async () => {
    const host = document.createElement('div');
    mountPanel('sessions').append(host);
    const entries = fixtureEntries().filter((e) => e.sessionId === 'sess-a');
    renderAgentBreakdown(host, entries);
    const text = host.textContent;
    expect(text).toContain(fmtMoney(entries.filter((e) => e.agentType === 'main').reduce((s, e) => s + entryCost(e), 0)));
    expect(host.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(2);
  });
});

describe('effortsSorted', () => {
  it('orders effort levels from the highest to the lowest', () => {
    const sorted = effortsSorted(new Map([['low', 1], ['max', 2], ['medium', 3], ['xhigh', 4]]));
    expect(sorted.map(([level]) => level)).toEqual(['max', 'xhigh', 'medium', 'low']);
  });
});

describe('openSessionModal', () => {
  it('returns null for an unknown or missing session id', () => {
    expect(openSessionModal('', fixtureEntries(), [])).toBeNull();
    expect(openSessionModal('nope', fixtureEntries(), [])).toBeNull();
  });

  it('opens a modal with the session cost and its models and agents', async () => {
    const entries = fixtureEntries();
    const box = openSessionModal('sess-a', entries, fixtureDurations());
    expect(box).not.toBeNull();
    expect(document.querySelector('dialog').hasAttribute('open')).toBe(true);
    const expected = entries.filter((e) => e.sessionId === 'sess-a').reduce((s, e) => s + entryCost(e), 0);
    expect(box.textContent).toContain(fmtMoney(expected));
    expect(box.querySelectorAll('.sub-tbl').length).toBeGreaterThanOrEqual(2);
  });

  it('applies the markup option to the cost', () => {
    const entries = [makeEntry({ sessionId: 's', input: 1_000_000, output: 0 })];
    const box = openSessionModal('s', entries, [], { markup: 2 });
    expect(box.textContent).toContain(fmtMoney(entryCost(entries[0]) * 2));
  });
});

describe('openBucketModal', () => {
  it('titles a day and a week differently', () => {
    expect(bucketTitle('2026-10-15', 'daily')).toContain('2026-10-15');
    expect(bucketTitle('2026-10-12', 'weekly')).toContain('2026-10-12');
    expect(bucketTitle('2026-10-12', 'weekly')).not.toBe(bucketTitle('2026-10-12', 'daily'));
  });

  it('shows the sessions of one day with their total cost', () => {
    const entries = fixtureEntries();
    const box = openBucketModal('2026-10-15', 'daily', entries);
    const inBucket = entries.filter((e) => e.date === '2026-10-15');
    expect(box.textContent).toContain(fmtMoney(inBucket.reduce((s, e) => s + entryCost(e), 0)));
    expect(box.querySelector('.modal-title').textContent).toContain('2026-10-15');
  });

  it('collects the entries of a whole week for the weekly view', () => {
    const entries = fixtureEntries();
    const box = openBucketModal('2026-10-12', 'weekly', entries);
    const inWeek = entries.filter((e) => e.date >= '2026-10-12' && e.date <= '2026-10-18');
    expect(box.textContent).toContain(fmtMoney(inWeek.reduce((s, e) => s + entryCost(e), 0)));
  });
});
