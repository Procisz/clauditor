import { ApexCharts, CHART_COLORS, getApexBaseOpts } from '../../core/charts.js';
import { state } from '../../core/state.js';
import { entryCost } from '../../core/config.js';
import { projectKey, projectName, fmtMoney, fmtInt, fmtFixed } from '../../core/utils.js';
import { getCurrentBucketKey } from '../../core/parser.js';
import { todayKey, getMonthKey } from '../../core/dates.js';
import { showDetail } from './detail.js';

let chartCost       = null;
let chartTokens     = null;
let chartCache      = null;
let chartTreemap    = null;
let chartCumulative = null;

function applyOrCreate(stored, elId, opts) {
  const el = document.getElementById(elId);
  if (!el) return stored;
  if (stored) {
    stored.updateOptions(opts, false, true);
    return stored;
  }
  const chart = new ApexCharts(el, opts);
  chart.render();
  return chart;
}

export function destroyOverviewCharts() {
  if (chartCost)       { chartCost.destroy();       chartCost       = null; }
  if (chartTokens)     { chartTokens.destroy();     chartTokens     = null; }
  if (chartCache)      { chartCache.destroy();       chartCache      = null; }
  if (chartTreemap)    { chartTreemap.destroy();     chartTreemap    = null; }
  if (chartCumulative) { chartCumulative.destroy();  chartCumulative = null; }
}

export function resizeOverviewCharts() {
  const r = (chart, id) => {
    if (!chart) return;
    const w = document.getElementById(id)?.offsetWidth;
    if (w) chart.updateOptions({ chart: { width: w } }, false, false);
  };
  r(chartCost,       'chart-cost');
  r(chartTokens,     'chart-tokens');
  r(chartCache,      'chart-cache');
  r(chartTreemap,    'chart-treemap');
  r(chartCumulative, 'chart-cumulative');
}

export function renderCostChart(labels, data) {
  const finalCosts = labels.map(l => +((data.get(l)?.baseCost || 0) * state.markup).toFixed(4));
  const curKey  = getCurrentBucketKey();
  const curIdx  = labels.indexOf(curKey);
  const base    = getApexBaseOpts();

  chartCost = applyOrCreate(chartCost, 'chart-cost', {
    chart: {
      ...base.chart, type: 'bar', height: 280,
      events: { dataPointSelection: (_e, _c, cfg) => showDetail(labels[cfg.dataPointIndex]) },
    },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: base.dataLabels,
    tooltip:    { ...base.tooltip, y: { formatter: v => fmtMoney(v, 4) } },
    series:     [{ name: 'Cost ($)', data: finalCosts }],
    colors:     [({ dataPointIndex }) => dataPointIndex === curIdx ? '#fbbf24' : '#818cf8'],
    xaxis:      { ...base.xaxis, categories: labels, tickAmount: 12 },
    yaxis:      { ...base.yaxis, labels: { ...base.yaxis.labels, formatter: v => fmtMoney(v, 2) } },
    plotOptions: { bar: { borderRadius: 3, columnWidth: '70%' } },
    legend:     { show: false },
    states:     { active: { filter: { type: 'darken', value: 0.8 } } },
  });
}

export function renderTokenChart(labels, data) {
  const inp = labels.map(l => data.get(l)?.input      || 0);
  const out = labels.map(l => data.get(l)?.output     || 0);
  const cw1 = labels.map(l => data.get(l)?.cacheWrite1h || 0);
  const cw5 = labels.map(l => Math.max(0, (data.get(l)?.cacheWrite || 0) - (data.get(l)?.cacheWrite1h || 0)));
  const cr  = labels.map(l => data.get(l)?.cacheRead  || 0);
  const base = getApexBaseOpts();

  chartTokens = applyOrCreate(chartTokens, 'chart-tokens', {
    chart:      { ...base.chart, type: 'bar', height: 280, stacked: true },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: base.dataLabels,
    tooltip:    { ...base.tooltip, y: { formatter: v => fmtInt(v) + ' tokens' } },
    series: [
      { name: 'Input',       data: inp, color: CHART_COLORS[0] },
      { name: 'Output',      data: out, color: CHART_COLORS[1] },
      { name: 'Cache Write · 5m', data: cw5, color: CHART_COLORS[2] },
      { name: 'Cache Write · 1h', data: cw1, color: CHART_COLORS[6] },
      { name: 'Cache Read',  data: cr,  color: CHART_COLORS[4] },
    ],
    xaxis:       { ...base.xaxis, categories: labels, tickAmount: 12 },
    yaxis:       { ...base.yaxis, labels: { ...base.yaxis.labels, formatter: v => v >= 1e6 ? fmtFixed(v/1e6, 1)+'M' : v >= 1e3 ? fmtFixed(v/1e3, 0)+'K' : v } },
    plotOptions: { bar: { borderRadius: 0, columnWidth: '70%' } },
    legend:      { ...base.legend, position: 'top' },
  });
}

export function renderCacheChart(labels, data) {
  const tot      = l => { const b = data.get(l); return b ? (b.input||0)+(b.cacheWrite||0)+(b.cacheRead||0) : 0; };
  const freshPct = labels.map(l => { const t = tot(l); const b = data.get(l); return t > 0 ? +((b.input/t)*100).toFixed(1) : 0; });
  const writePct = labels.map(l => { const t = tot(l); const b = data.get(l); return t > 0 ? +((b.cacheWrite/t)*100).toFixed(1) : 0; });
  const readPct  = labels.map(l => { const t = tot(l); const b = data.get(l); return t > 0 ? +((b.cacheRead/t)*100).toFixed(1) : 0; });
  const base = getApexBaseOpts();

  chartCache = applyOrCreate(chartCache, 'chart-cache', {
    chart:      { ...base.chart, type: 'bar', height: 280, stacked: true, stackType: '100%' },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: base.dataLabels,
    tooltip:    { ...base.tooltip, y: { formatter: v => fmtFixed(v, 1) + '%' } },
    series: [
      { name: 'Fresh Input %', data: freshPct, color: CHART_COLORS[3] },
      { name: 'Cache Write %', data: writePct, color: CHART_COLORS[2] },
      { name: 'Cache Read %',  data: readPct,  color: CHART_COLORS[1] },
    ],
    xaxis:       { ...base.xaxis, categories: labels, tickAmount: 12 },
    yaxis:       { ...base.yaxis, max: 100, labels: { ...base.yaxis.labels, formatter: v => v + '%' } },
    plotOptions: { bar: { borderRadius: 0, columnWidth: '70%' } },
    legend:      { ...base.legend, position: 'top' },
  });
}

export function renderTreemap(entries) {
  const map = new Map();
  for (const e of entries) {
    const key  = projectName(projectKey(e));
    const cost = entryCost(e) * state.markup;
    map.set(key, (map.get(key) || 0) + cost);
  }

  const data = [...map.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([x, y]) => ({ x, y: +y.toFixed(4) }));

  const base = getApexBaseOpts();

  chartTreemap = applyOrCreate(chartTreemap, 'chart-treemap', {
    chart:      { ...base.chart, type: 'treemap', height: 220 },
    theme:      base.theme,
    series:     [{ data }],
    colors:     CHART_COLORS,
    dataLabels: {
      enabled: true,
      style:   { fontSize: '11px', fontFamily: 'inherit', colors: ['#fff'] },
      formatter: (text, op) => [text, fmtMoney(op.value, 2)],
    },
    plotOptions: { treemap: { enableShades: true, shadeIntensity: 0.25 } },
    tooltip:    { ...base.tooltip, y: { formatter: v => fmtMoney(v, 4) } },
    legend:     { show: false },
    noData:     base.noData,
  });
}

export function renderCumulativeSpend() {
  const today       = new Date();
  const thisMonth   = getMonthKey(todayKey());
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth  = today.getDate();

  const dayCosts = new Map();
  for (const e of state.allEntries) {
    if (!e.date.startsWith(thisMonth)) continue;
    const cost = entryCost(e) * state.markup;
    dayCosts.set(e.date, (dayCosts.get(e.date) || 0) + cost);
  }

  let running = 0;
  const spendData = Array.from({ length: dayOfMonth }, (_, i) => {
    const dateStr = thisMonth + '-' + String(i + 1).padStart(2, '0');
    running += dayCosts.get(dateStr) || 0;
    return { x: i + 1, y: +running.toFixed(4) };
  });

  const budget = parseFloat(document.getElementById('budget-input').value);
  const series = [{ name: 'Cumulative Spend', data: spendData, type: 'area' }];
  if (budget > 0 && isFinite(budget)) {
    series.push({
      name: 'Budget Pace',
      type: 'line',
      data: Array.from({ length: daysInMonth }, (_, i) => ({ x: i + 1, y: +(budget / daysInMonth * (i + 1)).toFixed(2) })),
    });
  }

  const base = getApexBaseOpts();
  const tick = base.yaxis.labels.style.colors;

  const zoomToolbar = { show: true, tools: { download: false, selection: false, zoom: true, zoomin: true, zoomout: true, pan: false, reset: true }, autoSelected: 'zoom' };

  chartCumulative = applyOrCreate(chartCumulative, 'chart-cumulative', {
    chart:      { ...base.chart, type: 'line', height: 220, toolbar: zoomToolbar },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: base.dataLabels,
    series,
    colors:     [CHART_COLORS[0], '#94a3b8'],
    stroke:     { width: [2, 1.5], curve: ['smooth', 'straight'], dashArray: [0, 6] },
    fill:       { type: ['gradient', 'none'], gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0, stops: [0, 100] } },
    xaxis: {
      ...base.xaxis,
      tickAmount: Math.min(dayOfMonth, 10),
      labels:     { style: { colors: tick, fontSize: '11px' }, formatter: v => 'D' + Math.floor(v) },
    },
    yaxis:   { ...base.yaxis, labels: { ...base.yaxis.labels, formatter: v => fmtMoney(v, 0) } },
    tooltip: { ...base.tooltip, y: { formatter: v => fmtMoney(v, 4) } },
    legend:  { ...base.legend, position: 'top' },
    noData:  base.noData,
  });
}
