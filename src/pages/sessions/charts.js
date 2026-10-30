import { fmtFixed, fmtInt, fmtMoney } from '../../core/utils.js';
import { openBucketModal } from '../../components/bucket-modal.js';
import { agentLabel } from '../../components/sessions.js';
import { cssToken, makeChart, moneyAxis } from '../../ui/charts.js';
import { attachLegend, seriesItems, sliceApply } from '../../ui/legend.js';
import { seriesColors } from '../../ui/ramp.js';
import { t, tn } from '../../i18n/index.js';

const HEIGHT = 300;
const MAX_SLICES = 8;

const countTooltip = { y: { formatter: (v) => tn('sessions.count', v) } };

const countAxis = {
  min: 0,
  forceNiceScale: true,
  decimalsInFloat: 0,
  labels: { formatter: (v) => fmtInt(v) },
};

const xTicks = (keys) => ({ categories: keys, tickAmount: Math.min(keys.length, 12) });

function donut(el, { labels, values, colors, tooltip }) {
  const chart = makeChart(el, {
    chart: { type: 'donut', height: HEIGHT },
    series: values,
    labels,
    colors,
    legend: { show: false },
    tooltip: { y: { formatter: tooltip } },
    plotOptions: { pie: { donut: { size: '66%' } } },
    dataLabels: { enabled: true, formatter: (v) => `${fmtFixed(v, 0)}%` },
  });
  attachLegend(chart, {
    items: seriesItems(labels, colors),
    apply: sliceApply({ labels, data: values, colors }),
  });
  return chart;
}

export function renderDistribution(el, { labels, counts, color, name }) {
  return makeChart(el, {
    chart: { type: 'bar', height: HEIGHT },
    series: [{ name, data: counts }],
    colors: [color],
    xaxis: { categories: labels },
    yaxis: countAxis,
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    legend: { show: false },
    tooltip: countTooltip,
  });
}

export function renderAgentTypes(el, agentTotals) {
  const shown = agentTotals.filter((g) => g.final > 0);
  const top = shown.slice(0, MAX_SLICES);
  const rest = shown.slice(MAX_SLICES).reduce((sum, g) => sum + g.final, 0);
  const labels = top.map((g) => agentLabel(g.key));
  const values = top.map((g) => g.final);
  const colors = seriesColors(top.length);
  if (rest > 0) {
    labels.push(t('sessions.other'));
    values.push(rest);
    colors.push(cssToken('--text-faint'));
  }
  return donut(el, { labels, values, colors, tooltip: (v) => fmtMoney(v) });
}

export function renderSources(el, counts) {
  const kinds = ['cli', 'desktop', 'cowork'].filter((k) => counts[k] > 0);
  return donut(el, {
    labels: kinds.map((k) => t(`sessions.source.${k}`)),
    values: kinds.map((k) => counts[k]),
    colors: kinds.map((k) => cssToken({ cli: '--c-cost', desktop: '--c-output', cowork: '--c-cache-read' }[k])),
    tooltip: (v) => tn('sessions.count', v),
  });
}

export function renderSubagentShare(el, series) {
  const names = [t('sessions.seriesMain'), t('sessions.seriesSubagents')];
  const colors = [cssToken('--c-cost'), cssToken('--c-cache-write')];
  const chart = makeChart(el, {
    chart: { type: 'area', height: HEIGHT, stacked: true, stackType: '100%' },
    series: [
      { name: names[0], data: series.main },
      { name: names[1], data: series.sub },
    ],
    colors,
    stroke: { width: 2, curve: 'smooth' },
    fill: { type: 'solid', opacity: 0.55 },
    xaxis: xTicks(series.keys),
    yaxis: { max: 100, labels: { formatter: (v) => `${fmtFixed(v, 0)}%` } },
    legend: { show: false },
    tooltip: { y: { formatter: (v) => fmtMoney(v) } },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
  return chart;
}

export function renderPerBucket(el, series, { view, entries, markup, onOpen }) {
  const names = [t('sessions.seriesSessions'), t('sessions.seriesAvgCost')];
  const colors = [cssToken('--c-output'), cssToken('--c-cost')];
  const chart = makeChart(el, {
    chart: {
      type: 'line',
      height: HEIGHT,
      events: {
        dataPointSelection: (_e, _c, config) => {
          const key = series.keys[config.dataPointIndex];
          if (key) openBucketModal(key, view, entries, { onOpen, markup });
        },
      },
    },
    series: [
      { name: names[0], type: 'column', data: series.sessions },
      { name: names[1], type: 'line', data: series.average },
    ],
    colors,
    stroke: { width: [0, 3], curve: 'smooth' },
    plotOptions: { bar: { borderRadius: 3, columnWidth: '65%' } },
    xaxis: xTicks(series.keys),
    yaxis: [
      { ...countAxis, seriesName: names[0] },
      { seriesName: names[1], opposite: true, min: 0, labels: moneyAxis.labels },
    ],
    legend: { show: false },
    tooltip: {
      shared: true,
      intersect: false,
      y: [
        { formatter: (v) => (v == null ? '-' : tn('sessions.count', v)) },
        { formatter: (v) => (v == null ? '-' : fmtMoney(v)) },
      ],
    },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
  return chart;
}
