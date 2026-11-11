import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderModelDonut, renderTokenDonut } from '../../../src/pages/today/charts.js';
import { entryCost } from '../../../src/core/config.js';
import { state } from '../../../src/core/state.js';
import { fmtMoney, fmtNum } from '../../../src/core/utils.js';
import { t } from '../../../src/i18n/index.js';
import { destroyAllCharts } from '../../../src/ui/charts.js';
import ApexCharts from '../../mocks/apexcharts.js';
import { click, flushAll, mountPanel } from '../../helpers/dom.js';
import { LOCAL_MODEL, PRICED_MODEL, fixtureEntries, makeEntry } from '../../helpers/fixtures.js';

const TOKENS = { input: 300, output: 100, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 600 };

function mountDonuts() {
  const panel = mountPanel('today');
  panel.innerHTML = '<div id="td-model"></div><div id="td-tokens"></div>';
  return panel;
}

const lastOpts = () => ApexCharts.instances.at(-1).opts;

const legendTexts = (panel) => [...panel.querySelectorAll('.ch-legend-text')].map((el) => el.textContent.trim());

const share = (part, total) => `${((part / total) * 100).toFixed(2)}%`;

beforeEach(() => {
  destroyAllCharts();
  ApexCharts.reset();
  state.markup = 1;
});

afterEach(() => {
  state.decimalSep = '.';
  destroyAllCharts();
});

describe('today token donut percents', () => {
  it('labels each legend item with its share of the total tokens', async () => {
    const panel = mountDonuts();
    renderTokenDonut(panel, TOKENS);
    await flushAll();
    expect(legendTexts(panel)).toEqual([
      `${t('components.tokenInput')}: 30.00%`,
      `${t('components.tokenOutput')}: 10.00%`,
      `${t('components.tokenCacheWrite5m')}: 0.00%`,
      `${t('components.tokenCacheWrite1h')}: 0.00%`,
      `${t('components.tokenCacheRead')}: 60.00%`,
    ]);
  });

  it('shows the share in the hover tooltip next to the token count', () => {
    renderTokenDonut(mountDonuts(), TOKENS);
    const format = lastOpts().tooltip.y.formatter;
    expect(format(300)).toBe('300 tokens (30.00%)');
    expect(format(0)).toBe('0 tokens (0.00%)');
  });

  it('uses the decimal separator setting in the shares', async () => {
    state.decimalSep = ',';
    const panel = mountDonuts();
    renderTokenDonut(panel, TOKENS);
    await flushAll();
    expect(legendTexts(panel)[0]).toBe(`${t('components.tokenInput')}: 30,00%`);
    expect(lastOpts().tooltip.y.formatter(300)).toBe('300 tokens (30,00%)');
  });

  it('keeps the center total as the formatted sum of the token counts', () => {
    renderTokenDonut(mountDonuts(), TOKENS);
    const total = lastOpts().plotOptions.pie.donut.labels.total.formatter;
    expect(total({ globals: { seriesTotals: [300, 100, 0, 0, 600] } })).toBe(fmtNum(1000));
  });

  it('draws no ring and no legend when every count is zero', async () => {
    const panel = mountDonuts();
    renderTokenDonut(panel, { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 });
    await flushAll();
    expect(lastOpts().series).toEqual([]);
    expect(panel.querySelector('.ch-legend')).toBeNull();
  });

  it('keeps the slices and the legend texts when a legend item is hidden', async () => {
    const panel = mountDonuts();
    renderTokenDonut(panel, TOKENS);
    await flushAll();
    const before = legendTexts(panel);
    click(panel.querySelector('.ch-legend [data-legend="0"]'));
    await flushAll();
    expect(legendTexts(panel)).toEqual(before);
    expect(ApexCharts.instances.at(-1).w.config.series).toEqual([100, 0, 0, 600]);
  });
});

describe('today model donut percents', () => {
  it('shows 100.00% for the priced model and 0.00% for the local model', async () => {
    const panel = mountDonuts();
    renderModelDonut(panel, [makeEntry(), makeEntry({ model: LOCAL_MODEL })], 1);
    await flushAll();
    expect(legendTexts(panel)).toEqual([`${PRICED_MODEL}: 100.00%`, `${LOCAL_MODEL}: 0.00%`]);
  });

  it('gives each legend item the share of the summed entry cost', async () => {
    const entries = fixtureEntries();
    const panel = mountDonuts();
    renderModelDonut(panel, entries, 1);
    await flushAll();
    const total = entries.reduce((sum, e) => sum + entryCost(e), 0);
    const byModel = new Map();
    for (const e of entries) byModel.set(e.model, (byModel.get(e.model) ?? 0) + entryCost(e));
    const expected = [...byModel.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([model, cost]) => `${model}: ${share(cost, total)}`);
    expect(legendTexts(panel)).toEqual(expected);
  });

  it('shows the cost and the share in the hover tooltip', () => {
    renderModelDonut(mountDonuts(), [makeEntry(), makeEntry({ model: LOCAL_MODEL })], 1);
    const [priced] = lastOpts().series;
    expect(lastOpts().tooltip.y.formatter(priced)).toBe(`${fmtMoney(priced)} (100.00%)`);
    expect(lastOpts().tooltip.y.formatter(0)).toBe(`${fmtMoney(0)} (0.00%)`);
  });

  it('keeps the center total as the formatted money sum', () => {
    renderModelDonut(mountDonuts(), [makeEntry(), makeEntry({ model: LOCAL_MODEL })], 1);
    const total = lastOpts().plotOptions.pie.donut.labels.total.formatter;
    const [priced] = lastOpts().series;
    expect(total({ globals: { seriesTotals: [priced, 0] } })).toBe(fmtMoney(priced));
  });

  it('draws no ring and no legend when the total cost is zero', async () => {
    const panel = mountDonuts();
    renderModelDonut(panel, [makeEntry({ model: LOCAL_MODEL })], 1);
    await flushAll();
    expect(lastOpts().series).toEqual([]);
    expect(panel.querySelector('.ch-legend')).toBeNull();
  });
});
