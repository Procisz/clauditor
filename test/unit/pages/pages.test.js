import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pages } from '../../../src/pages/index.js';
import { inRange, previousRange } from '../../../src/core/metrics.js';
import { state } from '../../../src/core/state.js';
import { setLang, t } from '../../../src/i18n/index.js';
import messages from '../../../src/i18n/messages/index.js';
import { destroyAllCharts } from '../../../src/ui/charts.js';
import ApexCharts from '../../mocks/apexcharts.js';
import { click, flush, mountPanel } from '../../helpers/dom.js';
import { fixtureDurations, fixtureEntries, makeEntry } from '../../helpers/fixtures.js';

const HOSTS = {
  overview: ['ov-cost-trend', 'ov-token-trend', 'ov-model-mix', 'ov-top-projects', 'ov-hour-weekday', 'ov-calendar'],
  today: ['td-hourly', 'td-cumulative', 'td-model', 'td-tokens', 'td-response', 'td-cache', 'td-timeline', 'td-calls'],
  models: ['md-share', 'md-over-time', 'md-cost-per-request', 'md-token-mix', 'md-effort'],
  projects: ['pj-treemap', 'pj-over-time', 'pj-cost-vs-sessions', 'pj-models'],
  sessions: ['ss-length', 'ss-cost-dist', 'ss-agent-types', 'ss-subagent-share', 'ss-per-bucket', 'ss-source'],
  costs: ['cs-budget', 'cs-forecast', 'cs-token-cost', 'cs-cache', 'cs-weekday', 'cs-tokens'],
};

const APEX_HOSTS = {
  overview: ['ov-cost-trend', 'ov-token-trend', 'ov-model-mix', 'ov-top-projects'],
  today: ['td-hourly', 'td-cumulative', 'td-model', 'td-tokens', 'td-response', 'td-cache', 'td-timeline', 'td-calls'],
  models: ['md-share', 'md-over-time', 'md-cost-per-request', 'md-token-mix', 'md-effort'],
  projects: ['pj-treemap', 'pj-over-time', 'pj-cost-vs-sessions', 'pj-models'],
  sessions: ['ss-length', 'ss-cost-dist', 'ss-agent-types', 'ss-subagent-share', 'ss-per-bucket', 'ss-source'],
  costs: ['cs-forecast', 'cs-token-cost', 'cs-cache', 'cs-weekday'],
};

const ROUTE_ORDER = ['overview', 'today', 'models', 'projects', 'sessions', 'costs'];
const RANGE = { from: '2026-10-09', to: '2026-10-15', view: 'daily' };

function makeContext(all, overrides = {}) {
  const previous = previousRange(RANGE);
  state.allEntries = all;
  state.allDurations = fixtureDurations();
  return {
    entries: inRange(all, RANGE),
    allEntries: all,
    durations: state.allDurations,
    range: RANGE,
    previous: { ...previous, entries: inRange(all, previous) },
    markup: 1,
    budget: 0,
    today: '2026-10-15',
    rerender: vi.fn(),
    openSession: vi.fn(),
    ...overrides,
  };
}

async function renderPage(page, ctx) {
  const mount = mountPanel(page.id);
  page.render(mount, ctx);
  await flush();
  return mount;
}

const cardTitles = (mount) => [...mount.querySelectorAll('.card-title')].map((el) => el.textContent.trim());

beforeEach(() => {
  destroyAllCharts();
  ApexCharts.reset();
  state.selectedDate = '2026-10-15';
  state.view = 'daily';
  state.openRows = {};
  state.markup = 1;
  state.budget = 0;
  state.sessionTitles = new Map();
});

describe('page registry', () => {
  it('lists the six pages in route order', () => {
    expect(pages.map((p) => p.id)).toEqual(ROUTE_ORDER);
  });

  it.each(ROUTE_ORDER)('page %s follows the page contract', (id) => {
    const page = pages.find((p) => p.id === id);
    expect(page.titleKey).toBe(`nav.${id}`);
    expect(page.icon).toMatch(/^i-/);
    expect(typeof page.render).toBe('function');
    expect(typeof page.usesRange).toBe('boolean');
  });

  it('is the only page that ignores the period bar: Today', () => {
    expect(pages.filter((p) => !p.usesRange).map((p) => p.id)).toEqual(['today']);
  });
});

describe.each(ROUTE_ORDER)('%s page', (id) => {
  const page = () => pages.find((p) => p.id === id);

  it('renders the fixture entries without throwing and creates its chart hosts', async () => {
    const mount = await renderPage(page(), makeContext(fixtureEntries()));
    for (const host of HOSTS[id]) expect(mount.querySelector(`#${host}`), host).not.toBeNull();
  });

  it('draws charts into its chart hosts', async () => {
    const mount = await renderPage(page(), makeContext(fixtureEntries()));
    for (const host of APEX_HOSTS[id]) {
      const chart = ApexCharts.instances.find((c) => c.el?.id === host);
      expect(chart, host).toBeDefined();
      expect(mount.contains(chart.el)).toBe(true);
    }
  });

  it('renders with no entries without throwing', async () => {
    const mount = await renderPage(page(), makeContext([], { entries: [], previous: { from: '2026-10-02', to: '2026-10-08', entries: [] } }));
    expect(mount.textContent.trim()).not.toBe('');
  });

  it('renders with a markup and a budget set', async () => {
    state.markup = 1.5;
    state.budget = 40;
    const ctx = makeContext(fixtureEntries(), { markup: 1.5, budget: 40 });
    const mount = await renderPage(page(), ctx);
    for (const host of HOSTS[id]) expect(mount.querySelector(`#${host}`), host).not.toBeNull();
  });

  it('renders in the weekly and monthly views', async () => {
    for (const view of ['weekly', 'monthly']) {
      state.view = view;
      const mount = await renderPage(page(), makeContext(fixtureEntries(), { range: { ...RANGE, view } }));
      expect(mount.children.length).toBeGreaterThan(0);
      document.body.innerHTML = '';
    }
  });

  it('shows its card titles in Hungarian after switching the language', async () => {
    const english = cardTitles(await renderPage(page(), makeContext(fixtureEntries())));
    document.body.innerHTML = '';
    destroyAllCharts();
    setLang('hu');
    const hungarian = cardTitles(await renderPage(page(), makeContext(fixtureEntries())));
    const huTexts = new Set(Object.values(messages.hu));
    expect(hungarian).toHaveLength(english.length);
    expect(hungarian.length).toBeGreaterThan(0);
    for (const title of hungarian) expect(huTexts.has(title) || title.includes(' · '), title).toBe(true);
    expect(hungarian).not.toEqual(english);
  });
});

const EMPTY_MESSAGE = { models: 'common.noData', projects: 'common.noData', sessions: 'sessions.noSessions', costs: 'common.noData' };

describe.each(Object.keys(EMPTY_MESSAGE))('%s page without entries', (id) => {
  const page = () => pages.find((p) => p.id === id);
  const empty = () => makeContext([], { entries: [], previous: { from: '2026-10-02', to: '2026-10-08', entries: [] } });

  it('shows only an empty state with the page title and no chart', async () => {
    const mount = await renderPage(page(), empty());
    expect(mount.querySelectorAll('.card')).toHaveLength(1);
    expect(mount.textContent).toContain(t(`nav.${id}`));
    expect(mount.textContent).toContain(messages.en[EMPTY_MESSAGE[id]]);
    expect(ApexCharts.instances).toHaveLength(0);
  });

  it('shows the empty state in Hungarian', async () => {
    setLang('hu');
    const mount = await renderPage(page(), empty());
    expect(mount.textContent).toContain(messages.hu[`nav.${id}`]);
    expect(mount.textContent).toContain(messages.hu[EMPTY_MESSAGE[id]]);
  });
});

describe('Today page', () => {
  const today = () => pages.find((p) => p.id === 'today');

  it('navigates to the previous day and asks for a re-render', async () => {
    const ctx = makeContext(fixtureEntries());
    const mount = await renderPage(today(), ctx);
    expect(mount.querySelector('#td-next').disabled).toBe(true);
    click(mount.querySelector('#td-prev'));
    expect(state.selectedDate).toBe('2026-10-14');
    expect(ctx.rerender).toHaveBeenCalledTimes(1);
  });

  it('opens on the chosen day and enables the next and today buttons', async () => {
    state.selectedDate = '2026-10-14';
    const mount = await renderPage(today(), makeContext(fixtureEntries()));
    expect(mount.querySelector('#td-picker').value).toBe('2026-10-14');
    expect(mount.querySelector('#td-next').disabled).toBe(false);
    expect(mount.querySelector('#td-jump').disabled).toBe(false);
  });

  it('jumps back to today', async () => {
    state.selectedDate = '2026-10-12';
    const ctx = makeContext(fixtureEntries());
    const mount = await renderPage(today(), ctx);
    click(mount.querySelector('#td-jump'));
    expect(state.selectedDate).toBe('2026-10-15');
    expect(ctx.rerender).toHaveBeenCalled();
  });

  it('falls back to today when the selected day is in the future or invalid', async () => {
    state.selectedDate = '2027-01-01';
    const mount = await renderPage(today(), makeContext(fixtureEntries()));
    expect(state.selectedDate).toBe('2026-10-15');
    expect(mount.querySelector('#td-picker').value).toBe('2026-10-15');
    state.selectedDate = 'garbage';
    document.body.innerHTML = '';
    const again = await renderPage(today(), makeContext(fixtureEntries()));
    expect(again.querySelector('#td-picker').value).toBe('2026-10-15');
  });
});

describe('table pages', () => {
  const find = (id) => pages.find((p) => p.id === id);

  it('Models keeps expanded rows in state.openRows.models as a Set', async () => {
    const mount = await renderPage(find('models'), makeContext(fixtureEntries()));
    const row = mount.querySelector('tr.dt-row');
    expect(row).not.toBeNull();
    click(row);
    expect(state.openRows.models).toBeInstanceOf(Set);
    expect(state.openRows.models.has(row.dataset.rowId)).toBe(true);
  });

  it('Projects keeps expanded rows in state.openRows.projects as a Set', async () => {
    const mount = await renderPage(find('projects'), makeContext(fixtureEntries()));
    const row = mount.querySelector('tr.dt-row');
    expect(row).not.toBeNull();
    click(row);
    expect(state.openRows.projects).toBeInstanceOf(Set);
    expect(state.openRows.projects.has(row.dataset.rowId)).toBe(true);
  });

  it('Models reopens a row that was open before', async () => {
    const first = await renderPage(find('models'), makeContext(fixtureEntries()));
    const rowId = first.querySelector('tr.dt-row').dataset.rowId;
    click(first.querySelector('tr.dt-row'));
    document.body.innerHTML = '';
    const second = await renderPage(find('models'), makeContext(fixtureEntries()));
    expect(second.querySelector(`tr.dt-row[data-row-id="${rowId}"]`).getAttribute('aria-expanded')).toBe('true');
  });

  it('Models lists the models of the period with the most expensive first', async () => {
    const entries = [
      makeEntry({ ts: '2026-10-15T08:00:00Z', model: 'gpt-oss:20b', input: 5000, output: 100 }),
      makeEntry({ ts: '2026-10-15T08:10:00Z', input: 100, output: 100 }),
    ];
    const mount = await renderPage(find('models'), makeContext(entries));
    const rows = [...mount.querySelectorAll('tr.dt-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('opus');
  });

  it('Sessions shows the sessions table and the agent types table', async () => {
    const mount = await renderPage(find('sessions'), makeContext(fixtureEntries()));
    expect(mount.querySelectorAll('.dtable')).toHaveLength(2);
  });
});
