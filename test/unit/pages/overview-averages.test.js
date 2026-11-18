import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import overview from '../../../src/pages/overview/index.js';
import { inRange, previousRange } from '../../../src/core/metrics.js';
import { entryCost } from '../../../src/core/config.js';
import { state } from '../../../src/core/state.js';
import { fmtFixed, fmtMoney, fmtNum } from '../../../src/core/utils.js';
import { t } from '../../../src/i18n/index.js';
import { destroyAllCharts } from '../../../src/ui/charts.js';
import ApexCharts from '../../mocks/apexcharts.js';
import { flush, mountPanel, textOf } from '../../helpers/dom.js';
import { makeEntry } from '../../helpers/fixtures.js';

const A = makeEntry({ ts: '2026-09-20T10:00:00Z', sessionId: 'sess-a', input: 1000, output: 500 });
const B = makeEntry({ ts: '2026-10-05T10:00:00Z', sessionId: 'sess-b', input: 2000, output: 500 });
const C = makeEntry({ ts: '2026-10-06T10:00:00Z', sessionId: 'sess-c', input: 500, output: 0 });
const ENTRIES = [A, B, C];
const RANGE = { from: '2026-09-15', to: '2026-11-10', view: 'daily' };
const OCTOBER = { from: '2026-10-01', to: '2026-10-31', view: 'daily' };
const COST_A = entryCost(A);
const COST_BC = entryCost(B) + entryCost(C);
const COST_ALL = COST_A + COST_BC;
const TOKENS_ALL = 1500 + 2500 + 500;
const KEY = 'clauditor_average_type';

function makeContext(all, range = RANGE, previous = null) {
  state.allEntries = all;
  const before = previous ?? previousRange(range);
  return {
    entries: inRange(all, range),
    allEntries: all,
    durations: [],
    range,
    previous: { ...before, entries: before.from ? inRange(all, before) : [] },
    markup: 1,
    budget: 0,
    today: '2026-10-15',
    rerender: vi.fn(),
    openSession: vi.fn(),
  };
}

async function renderWith(ctx) {
  const mount = mountPanel('overview');
  overview.render(mount, ctx);
  await flush();
  return mount;
}

const renderOverview = (all, range = RANGE) => renderWith(makeContext(all, range));

const avgCard = (mount) => mount.querySelector('#ov-average').closest('.card');
const avgSelect = (mount) => avgCard(mount).querySelector('.avg-select');
const avgCost = (mount) => textOf(mount.querySelector('.avg-cost'));
const avgTokens = (mount) => textOf(mount.querySelector('.avg-tokens'));
const quarterRows = (mount) => [...mount.querySelectorAll('.avg-quarter')].map(textOf);
const chooseType = (mount, id) => {
  const select = avgSelect(mount);
  select.value = id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
const averageSeries = () => ApexCharts.instances.find((chart) => chart.opts.series?.[0]?.name === t('overview.avg.type.month'));

beforeEach(() => {
  destroyAllCharts();
  ApexCharts.reset();
  localStorage.clear();
  state.view = 'daily';
  state.openRows = {};
  state.markup = 1;
  state.budget = 0;
  state.sessionTitles = new Map();
});

afterEach(() => {
  destroyAllCharts();
});

describe('Overview top KPI row after the average card moved out', () => {
  it('keeps exactly the five KPI cards in the top row, in cost, requests, sessions, tokens, cache hit order', async () => {
    const mount = await renderOverview(ENTRIES);
    const row = mount.querySelector('.kpi-row');
    const labels = [...row.querySelectorAll(':scope > .stat .stat-label')].map(textOf);
    expect(labels).toHaveLength(5);
    expect(labels[0]).toMatch(/^Cost/);
    expect(labels[1]).toMatch(/^Requests/);
    expect(labels[2]).toMatch(/^Sessions/);
    expect(labels[3]).toMatch(/^Tokens/);
    expect(labels[4]).toMatch(/^Cache hit rate/);
    expect(textOf(row)).not.toContain('Average cost');
  });

  it('marks the top KPI row with the five-column modifier class', async () => {
    const mount = await renderOverview(ENTRIES);
    expect(mount.querySelector('.kpi-row').classList.contains('kpi-row-5')).toBe(true);
  });

  it('keeps a sparkline in each of the five KPI cards', async () => {
    const mount = await renderOverview(ENTRIES);
    const cards = [...mount.querySelectorAll('.kpi-row > .stat')];
    expect(cards).toHaveLength(5);
    for (const card of cards) expect(card.querySelector('svg.spark polyline')).not.toBeNull();
  });
});

describe('Overview average card placement and dropdown', () => {
  it('renders the average card above the budget strip in the grid', async () => {
    const mount = await renderOverview(ENTRIES);
    const items = [...mount.querySelector('.grid12').children];
    const card = avgCard(mount);
    const budget = items.find((el) => el.textContent.includes(t('overview.budget.title')));
    expect(card).not.toBeNull();
    expect(budget).toBeDefined();
    expect(items.indexOf(card)).toBeLessThan(items.indexOf(budget));
  });

  it('offers the five average types in session, quarter, month, week, day order', async () => {
    const mount = await renderOverview(ENTRIES);
    const options = [...avgSelect(mount).options];
    expect(options.map((o) => o.value)).toEqual(['session', 'quarter', 'month', 'week', 'day']);
    expect(options.map(textOf)).toEqual(['Per session', 'Per quarter', 'Per month', 'Per week', 'Per day']);
  });

  it('selects month by default when nothing is stored', async () => {
    const mount = await renderOverview(ENTRIES);
    expect(avgSelect(mount).value).toBe('month');
  });

  it('falls back to month when the stored value is not a known type', async () => {
    localStorage.setItem(KEY, 'year');
    const mount = await renderOverview(ENTRIES);
    expect(avgSelect(mount).value).toBe('month');
    expect(avgCost(mount)).toBe(fmtMoney(COST_ALL / 3));
  });
});

describe('Overview average card values per type', () => {
  it('shows the average cost per month with the average tokens', async () => {
    const mount = await renderOverview(ENTRIES);
    expect(avgCost(mount)).toBe(fmtMoney(COST_ALL / 3));
    expect(avgTokens(mount)).toBe('Average tokens: 1.5K');
  });

  it('shows the average cost per quarter over the quarters in range', async () => {
    localStorage.setItem(KEY, 'quarter');
    const mount = await renderOverview(ENTRIES);
    expect(avgCost(mount)).toBe(fmtMoney(COST_ALL / 2));
    expect(avgTokens(mount)).toBe(`Average tokens: ${fmtNum(2250)}`);
  });

  it('shows the average cost per week over the weeks in range', async () => {
    localStorage.setItem(KEY, 'week');
    const mount = await renderOverview(ENTRIES);
    expect(avgCost(mount)).toBe(fmtMoney(COST_ALL / 9));
    expect(avgTokens(mount)).toBe('Average tokens: 500');
  });

  it('shows the average cost per day over the days in range', async () => {
    localStorage.setItem(KEY, 'day');
    const mount = await renderOverview(ENTRIES);
    expect(avgCost(mount)).toBe(fmtMoney(COST_ALL / 57));
  });

  it('shows the average tokens per day over the days in range', async () => {
    localStorage.setItem(KEY, 'day');
    const mount = await renderOverview(ENTRIES);
    expect(avgTokens(mount)).toBe(`Average tokens: ${fmtNum(TOKENS_ALL / 57)}`);
  });

  it('shows the average cost per session over the distinct sessions in range', async () => {
    localStorage.setItem(KEY, 'session');
    const mount = await renderOverview(ENTRIES);
    expect(avgCost(mount)).toBe(fmtMoney(COST_ALL / 3));
    expect(avgTokens(mount)).toBe('Average tokens: 1.5K');
  });

  it('shows the label and tip of the selected type in the card body', async () => {
    const mount = await renderOverview(ENTRIES);
    expect(textOf(mount.querySelector('.avg-label'))).toBe('Average cost per month');
    expect(mount.querySelector('.avg-label .info-dot').dataset.tip).toBe(t('overview.avg.monthTip'));
  });
});

describe('Overview average card quarter rows', () => {
  it('lists only the quarters with entries for the quarter type, in Q1 to Q4 order', async () => {
    localStorage.setItem(KEY, 'quarter');
    const mount = await renderOverview(ENTRIES);
    expect(quarterRows(mount)).toEqual([
      `Q3: ${fmtMoney(COST_A)}, 1.5K tokens`,
      `Q4: ${fmtMoney(COST_BC)}, 3.0K tokens`,
    ]);
  });

  it('lists only the Q4 row when the selected range is October', async () => {
    localStorage.setItem(KEY, 'quarter');
    const mount = await renderOverview(ENTRIES, OCTOBER);
    expect(quarterRows(mount)).toEqual([`Q4: ${fmtMoney(COST_BC)}, 3.0K tokens`]);
  });

  it('shows no quarter rows for the other types', async () => {
    for (const id of ['session', 'month', 'week', 'day']) {
      localStorage.setItem(KEY, id);
      const mount = await renderOverview(ENTRIES);
      expect(mount.querySelectorAll('.avg-quarter')).toHaveLength(0);
    }
  });
});

describe('Overview average card dropdown behaviour', () => {
  it('swaps the number when the dropdown changes and stores the choice', async () => {
    const mount = await renderOverview(ENTRIES);
    chooseType(mount, 'day');
    expect(avgCost(mount)).toBe(fmtMoney(COST_ALL / 57));
    expect(localStorage.getItem(KEY)).toBe('day');
  });

  it('reads the stored choice back on a fresh render', async () => {
    const first = await renderOverview(ENTRIES);
    chooseType(first, 'week');
    const second = await renderOverview(ENTRIES);
    expect(avgSelect(second).value).toBe('week');
    expect(avgCost(second)).toBe(fmtMoney(COST_ALL / 9));
  });

  it('redraws the chart in place so only one average chart exists after a change', async () => {
    const mount = await renderOverview(ENTRIES);
    chooseType(mount, 'quarter');
    chooseType(mount, 'session');
    const averageCharts = ApexCharts.instances.filter((chart) => !chart.destroyed && chart.el?.closest('#ov-average'));
    expect(averageCharts).toHaveLength(1);
    expect(averageCharts[0].opts.series[0].name).toBe(t('overview.avg.type.session'));
  });
});

describe('Overview average card chart', () => {
  it('draws a column series of the monthly period costs', async () => {
    const mount = await renderOverview(ENTRIES);
    const chart = averageSeries();
    expect(chart).toBeDefined();
    expect(mount.querySelector('.avg-chart')).not.toBeNull();
    expect(chart.opts.series[0].type).toBe('column');
    expect(chart.opts.series[0].data).toEqual([COST_A, COST_BC, 0]);
    expect(chart.opts.xaxis.categories).toHaveLength(3);
  });

  it('shows no previous-period line in the average chart', async () => {
    await renderOverview(ENTRIES);
    expect(averageSeries().opts.series).toHaveLength(1);
  });

  it('draws an empty chart without NaN when the range has no entries', async () => {
    const mount = await renderOverview([], { from: '', to: '', view: 'daily' });
    const chart = averageSeries();
    expect(chart).toBeDefined();
    expect(chart.opts.series[0].data).toEqual([]);
    expect(avgCost(mount)).toBe(fmtMoney(0));
    expect(avgTokens(mount)).toBe('Average tokens: 0');
    expect(textOf(mount)).not.toContain('NaN');
  });
});

describe('Overview average card follows the selected range', () => {
  it('narrows to October for the month and day averages', async () => {
    const mount = await renderOverview(ENTRIES, OCTOBER);
    expect(avgCost(mount)).toBe(fmtMoney(COST_BC));
    expect(avgTokens(mount)).toBe('Average tokens: 3.0K');
    chooseType(mount, 'day');
    expect(avgCost(mount)).toBe(fmtMoney(COST_BC / 31));
  });
});

describe('Overview average card against a previous period', () => {
  const N1 = makeEntry({ ts: '2026-11-10T10:00:00Z', sessionId: 'sess-n', input: 4000, output: 1000 });
  const NOVEMBER = { from: '2026-11-01', to: '2026-11-30', view: 'daily' };
  const COST_N1 = entryCost(N1);
  const cardText = (mount) => textOf(avgCard(mount));

  it('shows the previous-period average as a previous line', async () => {
    const mount = await renderWith(makeContext([B, C, N1], NOVEMBER));
    expect(textOf(mount.querySelector('.avg-foot'))).toContain(`Previous: ${fmtMoney(COST_BC)}`);
    expect(avgCost(mount)).toBe(fmtMoney(COST_N1));
  });

  it('shows the change against the previous period with the cost-down direction for a rise', async () => {
    expect(COST_N1).toBeGreaterThan(COST_BC);
    const mount = await renderWith(makeContext([B, C, N1], NOVEMBER));
    const chip = mount.querySelector('.avg-foot .delta');
    const percent = ((COST_N1 - COST_BC) / COST_BC) * 100;
    expect(chip.dataset.dir).toBe('down');
    expect(textOf(chip)).toBe(`+${fmtFixed(Number(percent.toFixed(1)), 1)}%`);
  });

  it('shows no delta chip and no previous line without a previous period', async () => {
    const mount = await renderWith(makeContext([B, C, N1], NOVEMBER, { from: '', to: '' }));
    expect(mount.querySelector('.avg-foot')).toBeNull();
    expect(mount.querySelector('.delta')).toBeNull();
    expect(cardText(mount)).not.toContain('Previous:');
    expect(avgTokens(mount)).toBe('Average tokens: 5.0K');
  });

  it('shows a zero previous line and no delta chip when the previous period has no entries', async () => {
    const mount = await renderWith(makeContext([N1], NOVEMBER));
    expect(textOf(mount.querySelector('.avg-foot'))).toContain(`Previous: ${fmtMoney(0)}`);
    expect(mount.querySelector('.avg-foot .delta')).toBeNull();
  });
});
