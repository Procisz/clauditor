import { monthForecast, weekdayAverages } from '../../core/metrics.js';
import { fmtFixed, fmtMoney } from '../../core/utils.js';
import { cssToken, makeChart, moneyAxis } from '../../ui/charts.js';
import { attachLegend, seriesItems } from '../../ui/legend.js';
import { t } from '../../i18n/index.js';
import { TOKEN_TOKENS, TOKEN_TYPES, cacheSeries, tokenCostSeries } from './data.js';
import { bucketLabel, tokenTypeLabel, weekdayLabels } from './format.js';

const HEIGHT = 300;

const xCategories = (keys, view) => ({
  categories: keys.map((key) => bucketLabel(key, view)),
  tickAmount: Math.min(keys.length, 12),
});

const percentText = (v) => (v == null ? '-' : `${fmtFixed(v, 1)}%`);

export function renderForecast(el, { allEntries, markup, today, budget }) {
  const forecast = monthForecast(allEntries, today, markup);
  const { daysInMonth, dayOfMonth, spent, projected } = forecast;
  const names = [t('costs.forecast.actual'), t('costs.forecast.projection')];
  const colors = [cssToken('--c-cost'), cssToken('--warn')];
  const series = [
    { name: names[0], type: 'area', data: forecast.cumulative.map((y, i) => ({ x: i + 1, y })) },
    { name: names[1], type: 'line', data: [{ x: dayOfMonth, y: spent }, { x: daysInMonth, y: projected }] },
  ];
  const dash = [0, 6];
  const width = [2, 2];
  if (budget > 0) {
    names.push(t('costs.forecast.budget'));
    colors.push(cssToken('--neg'));
    series.push({ name: names[2], type: 'line', data: [{ x: 1, y: budget }, { x: daysInMonth, y: budget }] });
    dash.push(3);
    width.push(1.5);
  }
  const chart = makeChart(el, {
    chart: { type: 'line', height: HEIGHT },
    series,
    colors,
    stroke: { width, curve: 'straight', dashArray: dash },
    fill: { type: series.map((s) => (s.type === 'area' ? 'gradient' : 'solid')), gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0, stops: [0, 100] } },
    xaxis: {
      type: 'numeric',
      min: 1,
      max: Math.max(daysInMonth, 2),
      tickAmount: Math.min(daysInMonth - 1, 10),
      labels: { formatter: (v) => String(Math.round(v)) },
    },
    yaxis: { min: 0, ...moneyAxis },
    legend: { show: false },
    tooltip: {
      shared: true,
      intersect: false,
      x: { formatter: (v) => t('costs.forecast.day', { day: Math.round(v) }) },
      y: { formatter: (v) => (v == null ? '-' : fmtMoney(v)) },
    },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
  return chart;
}

export function renderTokenCost(el, entries, range, markup) {
  const { keys, series } = tokenCostSeries(entries, range, markup);
  const names = TOKEN_TYPES.map(tokenTypeLabel);
  const colors = TOKEN_TYPES.map((type) => cssToken(TOKEN_TOKENS[type]));
  const chart = makeChart(el, {
    chart: { type: 'bar', height: HEIGHT, stacked: true },
    series: TOKEN_TYPES.map((type, i) => ({ name: names[i], data: series[type] })),
    colors,
    plotOptions: { bar: { borderRadius: 2, columnWidth: '70%' } },
    xaxis: xCategories(keys, range.view),
    yaxis: moneyAxis,
    legend: { show: false },
    tooltip: { shared: true, intersect: false, y: { formatter: (v) => fmtMoney(v) } },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
  return chart;
}

export function renderCache(el, entries, range, markup) {
  const { keys, savings, hitRate } = cacheSeries(entries, range, markup);
  const names = [t('costs.cache.savings'), t('costs.cache.hitRate')];
  const colors = [cssToken('--c-cache-read'), cssToken('--accent')];
  const chart = makeChart(el, {
    chart: { type: 'line', height: HEIGHT },
    series: [
      { name: names[0], type: 'column', data: savings },
      { name: names[1], type: 'line', data: hitRate },
    ],
    colors,
    stroke: { width: [0, 3], curve: 'smooth' },
    plotOptions: { bar: { borderRadius: 3, columnWidth: '65%' } },
    xaxis: xCategories(keys, range.view),
    yaxis: [
      { seriesName: names[0], min: 0, ...moneyAxis },
      { seriesName: names[1], opposite: true, min: 0, max: 100, labels: { formatter: (v) => `${fmtFixed(v, 0)}%` } },
    ],
    legend: { show: false },
    tooltip: {
      shared: true,
      intersect: false,
      y: [
        { formatter: (v) => (v == null ? '-' : fmtMoney(v)) },
        { formatter: percentText },
      ],
    },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
  return chart;
}

export function renderWeekday(el, entries, range, markup) {
  return makeChart(el, {
    chart: { type: 'bar', height: HEIGHT },
    series: [{ name: t('costs.weekday.series'), data: weekdayAverages(entries, range, markup) }],
    colors: [cssToken('--c-cost')],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    xaxis: { categories: weekdayLabels() },
    yaxis: { min: 0, ...moneyAxis },
    legend: { show: false },
    tooltip: { y: { formatter: (v) => fmtMoney(v) } },
  });
}
