import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachLegend, distributedApply, seriesItems, sliceApply } from '../../../src/ui/legend.js';
import { destroyAllCharts, makeChart, replayCharts } from '../../../src/ui/charts.js';
import ApexCharts from '../../mocks/apexcharts.js';
import { click, mountPanel } from '../../helpers/dom.js';

const ITEMS = [
  { label: 'Input', color: '#aa0000' },
  { label: 'Output', color: '#00aa00' },
  { label: 'Cache', color: '#0000aa' },
];

function setup(items = ITEMS, options = {}) {
  const panel = mountPanel('overview');
  const el = document.createElement('div');
  el.id = 'legend-host';
  panel.append(el);
  const chart = makeChart(el, { chart: { type: 'bar' }, series: items.map((i) => ({ name: i.label, data: [1] })) });
  const bar = attachLegend(chart, { items, ...options });
  return { panel, el, chart, bar };
}

const buttons = (bar) => [...bar.querySelectorAll('[data-legend]')];
const pressed = (bar) => buttons(bar).map((b) => b.getAttribute('aria-pressed'));

beforeEach(() => {
  destroyAllCharts();
  ApexCharts.reset();
});

describe('attachLegend', () => {
  it('builds a legend bar before the chart with one button per item', () => {
    const { el, bar } = setup();
    expect(bar.classList.contains('ch-legend')).toBe(true);
    expect(bar.nextElementSibling).toBe(el);
    expect(bar.dataset.for).toBe('legend-host');
    expect(buttons(bar).map((b) => b.textContent.trim())).toEqual(['Input', 'Output', 'Cache']);
    expect(pressed(bar)).toEqual(['true', 'true', 'true']);
  });

  it('paints the dots with the item colors', () => {
    const { bar } = setup();
    expect(bar.querySelectorAll('.ch-legend-dot')[1].style.background).toBe('rgb(0, 170, 0)');
  });

  it('builds no legend for fewer than two items', () => {
    const { bar, panel } = setup([ITEMS[0]]);
    expect(bar).toBeNull();
    expect(panel.querySelector('.ch-legend')).toBeNull();
  });

  it('labels the group and the show all button in the current language', () => {
    const { bar } = setup();
    expect(bar.getAttribute('aria-label')).toBe('What the chart shows');
    expect(bar.querySelector('[data-legend-all]').textContent).toBe('All');
  });

  it('escapes item labels', () => {
    const items = [{ label: '<b>x</b>', color: '#aa0000' }, ITEMS[1]];
    const { bar } = setup(items);
    expect(bar.querySelector('[data-legend="0"] .ch-legend-text').textContent).toBe('<b>x</b>');
    expect(bar.querySelector('.ch-legend-text b')).toBeNull();
  });
});

describe('toggling series', () => {
  it('hides a series on click and shows it on the next', () => {
    const { bar, chart } = setup();
    click(buttons(bar)[0]);
    expect(pressed(bar)).toEqual(['false', 'true', 'true']);
    expect(chart.hidden.has('Input')).toBe(true);
    expect(buttons(bar)[0].classList.contains('is-off')).toBe(true);
    click(buttons(bar)[0]);
    expect(pressed(bar)).toEqual(['true', 'true', 'true']);
    expect(chart.hidden.has('Input')).toBe(false);
  });

  it('refuses to hide the last visible series', () => {
    const { bar, chart } = setup();
    click(buttons(bar)[0]);
    click(buttons(bar)[1]);
    expect(pressed(bar)).toEqual(['false', 'false', 'true']);
    expect(buttons(bar)[2].getAttribute('aria-disabled')).toBe('true');
    click(buttons(bar)[2]);
    expect(pressed(bar)).toEqual(['false', 'false', 'true']);
    expect(chart.hidden.has('Cache')).toBe(false);
  });

  it('allows hiding again after one is shown', () => {
    const { bar } = setup();
    click(buttons(bar)[0]);
    click(buttons(bar)[1]);
    click(buttons(bar)[0]);
    expect(buttons(bar)[2].hasAttribute('aria-disabled')).toBe(false);
    click(buttons(bar)[2]);
    expect(pressed(bar)).toEqual(['true', 'false', 'false']);
  });

  it('shows all series with the All button, which is disabled when nothing is hidden', () => {
    const { bar, chart } = setup();
    const all = bar.querySelector('[data-legend-all]');
    expect(all.disabled).toBe(true);
    click(buttons(bar)[0]);
    click(buttons(bar)[1]);
    expect(all.disabled).toBe(false);
    click(all);
    expect(pressed(bar)).toEqual(['true', 'true', 'true']);
    expect(chart.hidden.size).toBe(0);
    expect(all.disabled).toBe(true);
  });

  it('pushes the visible items through apply and the patch to the chart', () => {
    const apply = vi.fn((visible) => ({ labels: visible.map((i) => ITEMS[i].label) }));
    const onApply = vi.fn();
    const { bar, chart } = setup(ITEMS, { apply, onApply });
    click(buttons(bar)[1]);
    expect(apply).toHaveBeenLastCalledWith([0, 2], chart);
    expect(chart.updates.at(-1)).toMatchObject({ options: { labels: ['Input', 'Cache'] }, redraw: false, animate: false });
    expect(onApply).toHaveBeenCalledWith([0, 2], chart);
    expect(chart.hidden.size).toBe(0);
  });

  it('shows everything through apply on All', () => {
    const apply = (visible) => ({ labels: visible });
    const { bar, chart } = setup(ITEMS, { apply });
    click(buttons(bar)[0]);
    click(bar.querySelector('[data-legend-all]'));
    expect(chart.updates.at(-1).options.labels).toEqual([0, 1, 2]);
  });
});

describe('legend after a rebuild', () => {
  it('keeps hidden series hidden on the rebuilt chart and re-attaches the legend', () => {
    const { panel, bar } = setup();
    click(buttons(bar)[0]);
    replayCharts(panel);
    expect(ApexCharts.instances).toHaveLength(2);
    const fresh = ApexCharts.instances[1];
    expect(fresh.hidden.has('Input')).toBe(true);
    const bars = panel.querySelectorAll('.ch-legend');
    expect(bars).toHaveLength(1);
    expect(pressed(bars[0])).toEqual(['false', 'true', 'true']);
  });
});

describe('legend helpers', () => {
  it('seriesItems pairs labels with colors and cycles the colors', () => {
    expect(seriesItems(['a', 'b', 'c'], ['#1', '#2'])).toEqual([
      { label: 'a', color: '#1' }, { label: 'b', color: '#2' }, { label: 'c', color: '#1' },
    ]);
  });

  it('seriesItems falls back to the accent color', () => {
    expect(seriesItems(['a'], [])).toEqual([{ label: 'a', color: 'var(--accent)' }]);
  });

  it('distributedApply keeps the data, categories and colors of the visible items', () => {
    const apply = distributedApply({ labels: ['a', 'b', 'c'], data: [1, 2, 3], colors: ['#1', '#2', '#3'], name: 'Cost' });
    expect(apply([0, 2])).toEqual({
      series: [{ name: 'Cost', data: [1, 3] }],
      xaxis: { categories: ['a', 'c'] },
      colors: ['#1', '#3'],
    });
  });

  it('distributedApply merges extra options for the visible items', () => {
    const apply = distributedApply({ labels: ['a', 'b'], data: [1, 2], colors: ['#1'], name: 'Cost', extra: (v) => ({ count: v.length }) });
    expect(apply([1]).count).toBe(1);
    expect(apply([1]).colors).toEqual(['#1']);
  });

  it('sliceApply keeps the slices, labels and colors of the visible items', () => {
    const apply = sliceApply({ labels: ['a', 'b', 'c'], data: [10, 20, 30], colors: ['#1', '#2', '#3'] });
    expect(apply([1, 2])).toEqual({ series: [20, 30], labels: ['b', 'c'], colors: ['#2', '#3'] });
  });
});
