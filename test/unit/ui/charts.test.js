import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asVar, baseOptions, cssToken, destroyAllCharts, destroyChartsIn, escapeChartLabels, makeChart, moneyAxis, moneyTooltip, replayCharts, sparkline, tokenFor,
} from '../../../src/ui/charts.js';
import { EVENTS, emit } from '../../../src/app/events.js';
import { state } from '../../../src/core/state.js';
import ApexCharts from '../../mocks/apexcharts.js';
import { setMedia } from '../../helpers/env.js';
import { mountPanel } from '../../helpers/dom.js';

const setToken = (name, value) => document.documentElement.style.setProperty(name, value);

function host(panel, id) {
  const el = document.createElement('div');
  el.id = id;
  panel.append(el);
  return el;
}

beforeEach(() => {
  state.moneyDecimals = 2;
  destroyAllCharts();
  ApexCharts.reset();
});

describe('tokens', () => {
  it('reads a css token from the root element', () => {
    setToken('--accent', ' #112233 ');
    expect(cssToken('--accent')).toBe('#112233');
  });

  it('maps a color back to its token name and var()', () => {
    setToken('--c-cost', '#aa0000');
    expect(tokenFor('#aa0000')).toBe('--c-cost');
    expect(asVar('#aa0000')).toBe('var(--c-cost)');
  });

  it('leaves a color without a token unchanged', () => {
    setToken('--c-cost', '#aa0000');
    expect(tokenFor('#123456')).toBeNull();
    expect(asVar('#123456')).toBe('#123456');
  });
});

describe('baseOptions', () => {
  it('uses the theme tokens and the light mode by default', () => {
    setToken('--chart-grid', '#cccccc');
    setToken('--text-muted', '#777777');
    const o = baseOptions();
    expect(o.grid.borderColor).toBe('#cccccc');
    expect(o.xaxis.labels.style.colors).toBe('#777777');
    expect(o.theme.mode).toBe('light');
    expect(o.tooltip.theme).toBe('light');
    expect(o.dataLabels.enabled).toBe(false);
  });

  it('switches to dark mode with the html theme', () => {
    document.documentElement.dataset.theme = 'dark';
    const o = baseOptions();
    expect(o.theme.mode).toBe('dark');
    expect(o.tooltip.theme).toBe('dark');
  });

  it('sets the no-data text from the dictionary', () => {
    expect(baseOptions().noData.text).toBe('No data');
  });
});

describe('escapeChartLabels', () => {
  const raw = '<img src=x onerror=alert(1)>';

  it('escapes the tooltip title of the x axis', () => {
    const o = escapeChartLabels({ xaxis: { type: 'category' }, series: [] });
    expect(o.tooltip.x.formatter(raw, {})).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes the output of an own x formatter', () => {
    const o = escapeChartLabels({ tooltip: { x: { formatter: () => '<b>1</b>' } } });
    expect(o.tooltip.x.formatter(1, {})).toBe('&lt;b&gt;1&lt;/b&gt;');
  });

  it('escapes series names in the tooltip', () => {
    const o = escapeChartLabels({ series: [{ name: raw }] });
    expect(o.tooltip.y.title.formatter(raw, {})).toBe('&lt;img src=x onerror=alert(1)&gt;: ');
  });

  it('escapes series names per entry of a tooltip y array', () => {
    const o = escapeChartLabels({ series: [{ name: 'a' }, { name: 'b' }], tooltip: { y: [{ formatter: (v) => v }] } });
    expect(o.tooltip.y).toHaveLength(2);
    expect(o.tooltip.y[1].title.formatter('<b>', {})).toBe('&lt;b&gt;: ');
    expect(o.tooltip.y[0].formatter(5)).toBe(5);
  });

  it('escapes legend names, joining array names', () => {
    const o = escapeChartLabels({});
    expect(o.legend.formatter(raw, {})).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(o.legend.formatter(['<a>', 'b'], {})).toBe('&lt;a&gt; b');
  });

  it('keeps an own legend formatter and escapes its output', () => {
    const o = escapeChartLabels({ legend: { formatter: (n) => `<i>${n}</i>` } });
    expect(o.legend.formatter('x', {})).toBe('&lt;i&gt;x&lt;/i&gt;');
  });

  it('does not wrap the x tooltip of datetime axes without an own formatter', () => {
    const o = escapeChartLabels({ xaxis: { type: 'datetime' } });
    expect(o.tooltip.x?.formatter).toBeUndefined();
  });

  it('does not change the other options', () => {
    const o = escapeChartLabels({ chart: { type: 'bar' }, colors: ['#fff'] });
    expect(o.chart).toEqual({ type: 'bar' });
    expect(o.colors).toEqual(['#fff']);
  });
});

describe('makeChart', () => {
  it('creates and renders a chart on the element with merged options', () => {
    const panel = mountPanel('overview');
    const el = host(panel, 'c1');
    setToken('--chart-grid', '#cccccc');
    const chart = makeChart(el, { chart: { type: 'bar', height: 200 }, series: [{ name: 'a', data: [1] }] });
    expect(ApexCharts.instances).toHaveLength(1);
    expect(chart.rendered).toBe(true);
    expect(chart.opts.chart).toMatchObject({ type: 'bar', height: 200, background: 'transparent' });
    expect(chart.opts.grid.borderColor).toBe('#cccccc');
    expect(chart.opts.series).toEqual([{ name: 'a', data: [1] }]);
    expect(chart.opts.legend.formatter('<b>', {})).toBe('&lt;b&gt;');
  });

  it('turns off animation and square line caps for heatmaps', () => {
    const el = host(mountPanel('overview'), 'c1');
    const chart = makeChart(el, { chart: { type: 'heatmap' }, series: [] });
    expect(chart.opts.chart.animations.enabled).toBe(false);
    expect(chart.opts.stroke.lineCap).toBe('butt');
  });
});

describe('destroyChartsIn', () => {
  it('destroys the charts inside a root and keeps the ones outside', () => {
    const a = mountPanel('overview');
    const b = mountPanel('models');
    const inside = makeChart(host(a, 'c1'), { chart: { type: 'bar' }, series: [] });
    const outside = makeChart(host(b, 'c2'), { chart: { type: 'bar' }, series: [] });
    destroyChartsIn(a);
    expect(inside.destroyed).toBe(true);
    expect(outside.destroyed).toBe(false);
  });

  it('destroys charts whose element was removed from the page', () => {
    const a = mountPanel('overview');
    const el = host(a, 'c1');
    const chart = makeChart(el, { chart: { type: 'bar' }, series: [] });
    el.remove();
    destroyChartsIn(mountPanel('models'));
    expect(chart.destroyed).toBe(true);
  });

  it('does nothing without a root', () => {
    expect(() => destroyChartsIn(null)).not.toThrow();
  });

  it('destroyAllCharts destroys every chart', () => {
    const one = makeChart(host(mountPanel('overview'), 'c1'), { chart: { type: 'bar' }, series: [] });
    const two = makeChart(host(mountPanel('models'), 'c2'), { chart: { type: 'bar' }, series: [] });
    destroyAllCharts();
    expect(one.destroyed && two.destroyed).toBe(true);
  });
});

describe('theme repaint', () => {
  it('updates axis, grid and tooltip colors on a theme change', () => {
    setToken('--chart-grid', '#cccccc');
    setToken('--text-muted', '#777777');
    const chart = makeChart(host(mountPanel('overview'), 'c1'), { chart: { type: 'bar' }, series: [], xaxis: {}, yaxis: {} });
    setToken('--chart-grid', '#222222');
    setToken('--text-muted', '#999999');
    document.documentElement.dataset.theme = 'dark';
    emit(EVENTS.theme, {});
    const patch = chart.updates.at(-1).options;
    expect(patch.theme.mode).toBe('dark');
    expect(patch.grid.borderColor).toBe('#222222');
    expect(patch.xaxis.labels.style.colors).toBe('#999999');
    expect(patch.yaxis.labels.style.colors).toBe('#999999');
    expect(patch.tooltip.theme).toBe('dark');
  });

  it('repaints series colors from their tokens', () => {
    setToken('--c-cost', '#aa0000');
    const chart = makeChart(host(mountPanel('overview'), 'c1'), { chart: { type: 'bar' }, series: [], colors: ['#aa0000'] });
    setToken('--c-cost', '#00aa00');
    emit(EVENTS.theme, {});
    expect(chart.updates.at(-1).options.colors).toEqual(['#00aa00']);
  });

  it('applies the extra options of setThemeOptions style charts', () => {
    const chart = makeChart(host(mountPanel('overview'), 'c1'), { chart: { type: 'bar' }, series: [] });
    chart.themeExtra = () => ({ plotOptions: { bar: { x: 1 } } });
    emit(EVENTS.theme, {});
    expect(chart.updates.at(-1).options.plotOptions).toEqual({ bar: { x: 1 } });
  });

  it('does not repaint destroyed charts', () => {
    const panel = mountPanel('overview');
    const chart = makeChart(host(panel, 'c1'), { chart: { type: 'bar' }, series: [] });
    destroyChartsIn(panel);
    emit(EVENTS.theme, {});
    expect(chart.updates).toHaveLength(0);
  });
});

describe('resize', () => {
  it('redraws the charts once after the resize settles', () => {
    vi.useFakeTimers();
    const chart = makeChart(host(mountPanel('overview'), 'c1'), { chart: { type: 'bar' }, series: [] });
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(249);
    expect(chart.updates).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(chart.updates).toHaveLength(1);
    expect(chart.updates[0]).toMatchObject({ options: {}, redraw: true, animate: false });
  });
});

describe('replayCharts', () => {
  it('rebuilds the charts of a root with their current colors', () => {
    setToken('--c-cost', '#aa0000');
    const panel = mountPanel('overview');
    const old = makeChart(host(panel, 'c1'), { chart: { type: 'bar' }, series: [], colors: ['#aa0000'] });
    setToken('--c-cost', '#00aa00');
    replayCharts(panel);
    expect(old.destroyed).toBe(true);
    expect(ApexCharts.instances).toHaveLength(2);
    expect(ApexCharts.instances[1].opts.colors).toEqual(['#00aa00']);
  });

  it('keeps the charts as they are when the user prefers reduced motion', () => {
    setMedia('(prefers-reduced-motion: reduce)', true);
    const panel = mountPanel('overview');
    const chart = makeChart(host(panel, 'c1'), { chart: { type: 'bar' }, series: [] });
    replayCharts(panel);
    expect(chart.destroyed).toBe(false);
    expect(ApexCharts.instances).toHaveLength(1);
  });

  it('leaves charts outside the root alone', () => {
    const a = mountPanel('overview');
    const b = mountPanel('models');
    makeChart(host(a, 'c1'), { chart: { type: 'bar' }, series: [] });
    const other = makeChart(host(b, 'c2'), { chart: { type: 'bar' }, series: [] });
    replayCharts(a);
    expect(other.destroyed).toBe(false);
  });
});

describe('sparkline', () => {
  it('returns nothing for fewer than two usable values', () => {
    expect(sparkline([])).toBe('');
    expect(sparkline([5])).toBe('');
    expect(sparkline([null, 3, undefined, Number.NaN])).toBe('');
  });

  it('draws one point per value from the left edge to the right edge', () => {
    const svg = sparkline([0, 10], { width: 100, height: 30 });
    expect(svg).toContain('viewBox="0 0 100 30"');
    expect(svg).toContain('points="2.0,27.0 98.0,5.0"');
  });

  it('draws a flat line without dividing by zero', () => {
    expect(sparkline([4, 4, 4])).not.toContain('NaN');
  });
});

describe('money helpers', () => {
  it('formats axis labels as money and compact above one thousand', () => {
    state.moneyDecimals = 2;
    expect(moneyAxis.labels.formatter(5)).toBe('$5.00');
    expect(moneyAxis.labels.formatter(1500)).toBe('$1.5K');
  });

  it('formats tooltip values as money with the setting for decimals', () => {
    state.moneyDecimals = 3;
    expect(moneyTooltip.y.formatter(1.5)).toBe('$1.500');
  });
});
