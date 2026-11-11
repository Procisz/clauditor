import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPENSIVE_COST, sessionColumns, sessionFilter, sessionRows, renderSessionsSubTable, renderAgentBreakdown, effortsSorted } from '../../../src/components/sessions.js';
import { openSessionModal } from '../../../src/components/session-modal.js';
import { bucketTitle, openBucketModal } from '../../../src/components/bucket-modal.js';
import { sessionSummaries } from '../../../src/core/metrics.js';
import { entryCost } from '../../../src/core/config.js';
import { state } from '../../../src/core/state.js';
import { fmtMoney } from '../../../src/core/utils.js';
import { cell } from '../../../src/ui/table.js';
import { click, flush, input, mountPanel } from '../../helpers/dom.js';
import { entryCostingAtLeast, fixtureDurations, fixtureEntries, makeEntry } from '../../helpers/fixtures.js';

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

const SEARCH = () => [
  entryCostingAtLeast(EXPENSIVE_COST * 2, { sessionId: 'ab12cd34ef56gh78', cwd: '/work/alpha', entrypoint: 'cli', model: 'claude-opus-999', ts: '2026-10-15T08:00:00.000Z' }),
  makeEntry({ sessionId: 'hk-session-2', cwd: '/work/beta', entrypoint: 'claude-desktop', model: 'claude-haiku-999', ts: '2026-10-15T09:00:00.000Z' }),
  makeEntry({ sessionId: 'task-7', cwd: '', sessionKind: 'cowork', entrypoint: 'claude-desktop', model: 'claude-sonnet-999', ts: '2026-10-15T10:00:00.000Z' }),
];

const chip = (scope, id) => scope.querySelector(`.sub-filter-chip[data-chip="${id}"]`);
const chipByLabel = (scope, label) => [...scope.querySelectorAll('.sub-filter-chip')].find((b) => b.textContent === label);
const chipLabels = (scope) => [...scope.querySelectorAll('.sub-filter-chip')].map((b) => b.textContent);
const firstCells = (scope) => [...scope.querySelectorAll('tbody tr')].map((tr) => tr.children[0].textContent);

function listHost(entries, options = {}) {
  const panel = mountPanel('models');
  const host = document.createElement('div');
  panel.append(host);
  renderSessionsSubTable(host, entries, options);
  return host;
}

describe('sessionFilter', () => {
  it('offers the type, source, family and expensive chips by default', () => {
    expect(sessionFilter().chips.map((c) => c.id)).toEqual(['code', 'cowork', 'cli', 'desktop', 'opus', 'sonnet', 'haiku', 'expensive']);
  });

  it('drops the type chips and the type key when the type column is omitted', () => {
    const filter = sessionFilter({ omit: ['type'] });
    expect(filter.chips.map((c) => c.id)).not.toContain('code');
    expect(filter.chips.map((c) => c.id)).not.toContain('cowork');
    expect(filter.keys).not.toContain('type');
    expect(filter.keys).toContain('source');
  });

  it('drops the family chips and the models key when the models column is omitted', () => {
    const filter = sessionFilter({ omit: ['models'] });
    expect(filter.chips.map((c) => c.id)).not.toContain('opus');
    expect(filter.keys).not.toContain('models');
  });

  it('keeps only the expensive chip when every optional column is omitted', () => {
    expect(sessionFilter({ omit: ['type', 'source', 'models'] }).chips.map((c) => c.id)).toEqual(['expensive']);
  });

  it('searches the name, the session id, the project and the effort unless the effort column is omitted', () => {
    expect(sessionFilter().keys).toEqual(['name', 'id', 'project', 'type', 'source', 'models', 'effort']);
    expect(sessionFilter({ omit: ['effort'] }).keys).not.toContain('effort');
  });

  it('uses the sessions search placeholder', () => {
    expect(sessionFilter().placeholder).toBe('Search sessions');
  });

  it('counts a session at exactly EXPENSIVE_COST as expensive and one just below it as not', () => {
    expect(EXPENSIVE_COST).toBe(1);
    const expensive = sessionFilter().chips.find((c) => c.id === 'expensive');
    expect(expensive.test({ cost: cell(EXPENSIVE_COST) })).toBe(true);
    expect(expensive.test({ cost: cell(EXPENSIVE_COST - 0.01) })).toBe(false);
  });
});

describe('session list search and chips', () => {
  it('finds a session by its id, which the visible name only shortens', () => {
    const host = listHost(SEARCH());
    expect(firstCells(host).sort()).toEqual(['ab12cd34', 'hk-sessi', 'task-7']);
    input(host.querySelector('.sub-filter-input'), 'ef56gh78');
    expect(firstCells(host)).toEqual(['ab12cd34']);
  });

  it('finds a session by its project only when the project column is shown', () => {
    const hidden = listHost(SEARCH());
    input(hidden.querySelector('.sub-filter-input'), 'beta');
    expect(hidden.querySelectorAll('tbody tr[data-i]')).toHaveLength(0);
    expect(hidden.querySelector('tbody').textContent).toBe('No matches');

    const shown = listHost(SEARCH(), { omit: [] });
    input(shown.querySelector('.sub-filter-input'), 'beta');
    expect(firstCells(shown)).toEqual(['hk-sessi']);
  });

  it('shows the type, source, family and expensive chips that match a row', () => {
    const host = listHost(SEARCH());
    expect(chipLabels(host)).toEqual(['Code', 'Cowork', 'CLI', 'Desktop app', 'Opus', 'Sonnet', 'Haiku', 'Expensive only']);
  });

  it('hides the chips that match no row', () => {
    const host = listHost(SEARCH().filter((e) => e.model === 'claude-haiku-999'));
    expect(chipLabels(host)).toEqual(['Code', 'Desktop app', 'Haiku']);
  });

  it('keeps the desktop sessions with the Desktop app chip', () => {
    const host = listHost(SEARCH());
    click(chip(host, 'desktop'));
    expect(firstCells(host)).toEqual(['hk-sessi']);
  });

  it('keeps the cowork tasks with the Cowork chip', () => {
    const host = listHost(SEARCH());
    click(chip(host, 'cowork'));
    expect(firstCells(host)).toEqual(['task-7']);
  });

  it('combines the type and the source chips by AND', () => {
    const host = listHost(SEARCH());
    click(chip(host, 'cowork'));
    click(chip(host, 'desktop'));
    expect(host.querySelector('tbody').textContent).toBe('No matches');
  });

  it('keeps the sessions at or above a dollar with the Expensive only chip', () => {
    const host = listHost(SEARCH());
    click(chipByLabel(host, 'Expensive only'));
    expect(firstCells(host)).toEqual(['ab12cd34']);
  });

  it('keeps both families with the Opus and Haiku chips together', () => {
    const host = listHost(SEARCH());
    click(chip(host, 'opus'));
    click(chip(host, 'haiku'));
    expect(firstCells(host)).toEqual(['ab12cd34', 'hk-sessi']);
  });
});

describe('renderAgentBreakdown search and chips', () => {
  const agentEntries = () => [
    SEARCH()[0],
    makeEntry({ sessionId: 'ab12cd34ef56gh78', cwd: '/work/alpha', model: 'claude-haiku-999', agentType: 'Explore' }),
  ];

  it('offers the family chips of the model in each agent row', () => {
    const host = document.createElement('div');
    mountPanel('sessions').append(host);
    renderAgentBreakdown(host, agentEntries());
    expect(firstCells(host)).toHaveLength(2);
    expect(chipLabels(host)).toEqual(['Opus', 'Haiku']);
    click(chip(host, 'haiku'));
    expect(firstCells(host)).toEqual(['Explore']);
  });

  it('searches the agent names', () => {
    const host = document.createElement('div');
    mountPanel('sessions').append(host);
    renderAgentBreakdown(host, agentEntries());
    input(host.querySelector('.sub-filter-input'), 'explore');
    expect(firstCells(host)).toEqual(['Explore']);
  });
});

describe('session modal search and chips', () => {
  it('searches the models of a session and combines the query with a family chip', () => {
    const entries = [
      makeEntry({ sessionId: 'mix-1', model: 'claude-opus-999' }),
      makeEntry({ sessionId: 'mix-1', model: 'claude-haiku-999' }),
    ];
    const box = openSessionModal('mix-1', entries, []);
    const models = box.querySelector('[data-host="models"]');
    expect(firstCells(models)).toHaveLength(2);
    expect(models.querySelector('.sub-filter-input').placeholder).toBe('Search models');
    input(models.querySelector('.sub-filter-input'), 'haiku');
    expect(firstCells(models)).toEqual(['haiku']);
    click(chipByLabel(models, 'Opus'));
    expect(models.querySelector('tbody').textContent).toBe('No matches');
  });

  it('searches the agent types of the modal but offers no chips there', () => {
    const entries = [
      makeEntry({ sessionId: 'mix-2', model: 'claude-opus-999' }),
      makeEntry({ sessionId: 'mix-2', model: 'claude-haiku-999', agentType: 'Explore' }),
    ];
    const box = openSessionModal('mix-2', entries, []);
    const agents = box.querySelector('[data-host="agents"]');
    expect(agents.querySelector('.sub-filter-chip')).toBeNull();
    expect(agents.querySelector('.sub-filter-input').placeholder).toBe('Search agents');
    input(agents.querySelector('.sub-filter-input'), 'explore');
    expect(firstCells(agents)).toEqual(['Explore']);
  });
});

describe('bucket modal search and chips', () => {
  it('offers the source and expensive chips but no type or family chips', () => {
    const box = openBucketModal('2026-10-15', 'daily', SEARCH());
    expect(chipLabels(box.querySelector('[data-host="sessions"]'))).toEqual(['CLI', 'Desktop app', 'Expensive only']);
  });

  it('filters the sessions of the bucket by source and searches them by id', () => {
    const box = openBucketModal('2026-10-15', 'daily', SEARCH());
    const host = box.querySelector('[data-host="sessions"]');
    click(chipByLabel(host, 'Desktop app'));
    expect(firstCells(host)).toEqual(['hk-sessi']);
    input(host.querySelector('.sub-filter-input'), 'task-7');
    expect(host.querySelectorAll('tbody tr[data-i]')).toHaveLength(0);
    expect(host.querySelector('tbody').textContent).toBe('No matches');
  });
});
