import { groupTotals } from '../../core/metrics.js';
import { fmtInt, fmtMoney, fmtNum, projectKey } from '../../core/utils.js';
import { chartCard } from '../../ui/dom.js';
import { cssToken, makeChart, moneyAxis, moneyTooltip } from '../../ui/charts.js';
import { attachLegend, seriesItems } from '../../ui/legend.js';
import { seriesColors } from '../../ui/ramp.js';
import { t, tn } from '../../i18n/index.js';
import { bucketAxis, bucketSeries, groupEntries, modelColors, modelLabels } from '../models/helpers.js';
import { projectLabels } from './data.js';

const TREEMAP_LIMIT = 20;
const BUBBLE_LIMIT = 20;
const OVER_TIME_LIMIT = 5;
const MODELS_LIMIT = 8;

export function projectCards() {
  return [
    chartCard({
      span: 7, color: 'var(--c-cost)', iconId: 'i-projects', id: 'pj-treemap',
      title: t('projects.treemap.title'), sub: t('projects.treemap.sub'), tip: t('projects.treemap.tip'),
    }),
    chartCard({
      span: 5, color: 'var(--c-output)', iconId: 'i-sessions', id: 'pj-cost-vs-sessions',
      title: t('projects.bubble.title'), sub: t('projects.bubble.sub'), tip: t('projects.bubble.tip'),
    }),
    chartCard({
      span: 12, color: 'var(--c-cost)', iconId: 'i-trend-up', id: 'pj-over-time',
      title: t('projects.overTime.title'), sub: t('projects.overTime.sub'), tip: t('projects.overTime.tip'),
    }),
    chartCard({
      span: 12, color: 'var(--accent)', iconId: 'i-models', id: 'pj-models',
      title: t('projects.models.title'), sub: t('projects.models.sub'), tip: t('projects.models.tip'),
    }),
  ].join('');
}

function treemapChart(mount, stats) {
  const top = stats.slice(0, TREEMAP_LIMIT);
  const labels = projectLabels(top.map((s) => s.key));
  const colors = seriesColors(top.length);
  makeChart(mount.querySelector('#pj-treemap'), {
    chart: { type: 'treemap', height: 360 },
    series: [{ name: t('projects.treemap.series'), data: top.map((s, i) => ({ x: labels[i], y: s.final })) }],
    colors,
    plotOptions: { treemap: { distributed: true, enableShades: false } },
    dataLabels: { enabled: true, formatter: (text, opts) => [text, fmtMoney(opts.value)], style: { fontSize: '12px' } },
    legend: { show: false },
    tooltip: moneyTooltip,
  });
}

function bubbleChart(mount, stats) {
  const top = stats.slice(0, BUBBLE_LIMIT);
  const labels = projectLabels(top.map((s) => s.key));
  const colors = seriesColors(top.length);
  makeChart(mount.querySelector('#pj-cost-vs-sessions'), {
    chart: { type: 'bubble', height: 360 },
    series: top.map((s, i) => ({ name: labels[i], data: [[s.sessions, s.final, s.tokens]] })),
    colors,
    fill: { opacity: 0.7 },
    plotOptions: { bubble: { minBubbleRadius: 6, maxBubbleRadius: 36 } },
    xaxis: {
      type: 'numeric',
      tickAmount: Math.min(8, Math.max(2, ...top.map((s) => s.sessions))),
      title: { text: t('projects.bubble.x') },
      labels: { formatter: (v) => fmtInt(Math.round(v)) },
    },
    yaxis: { ...moneyAxis, title: { text: t('projects.bubble.y') } },
    legend: { show: false },
    tooltip: {
      x: { formatter: (v) => tn('projects.sessionsCount', Math.round(v)) },
      y: { formatter: (v) => fmtMoney(v) },
      z: { title: `${t('projects.bubble.z')}: `, formatter: (v) => fmtNum(v) },
    },
  });
}

function overTimeChart(mount, ctx, stats) {
  const keys = stats.map((s) => s.key);
  const topKeys = keys.slice(0, OVER_TIME_LIMIT);
  const labels = projectLabels(topKeys);
  const byProject = groupEntries(ctx.entries, projectKey);
  const groups = topKeys.map((k, i) => ({ name: labels[i], entries: byProject.get(k) ?? [] }));
  const colors = seriesColors(topKeys.length + (keys.length > OVER_TIME_LIMIT ? 1 : 0));
  if (keys.length > OVER_TIME_LIMIT) {
    const top = new Set(topKeys);
    groups.push({ name: t('projects.other'), entries: ctx.entries.filter((e) => !top.has(projectKey(e))) });
    colors[colors.length - 1] = cssToken('--text-faint');
  }
  const { keys: bucketKeys, series } = bucketSeries(groups, ctx);
  const names = groups.map((g) => g.name);
  const chart = makeChart(mount.querySelector('#pj-over-time'), {
    chart: { type: 'area', height: 320, stacked: true },
    series,
    colors,
    stroke: { width: 2, curve: 'smooth' },
    fill: { type: 'solid', opacity: 0.55 },
    xaxis: bucketAxis(bucketKeys),
    yaxis: moneyAxis,
    legend: { show: false },
    tooltip: { shared: true, intersect: false, ...moneyTooltip },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
}

function modelsChart(mount, ctx, stats) {
  const top = stats.slice(0, MODELS_LIMIT);
  const labels = projectLabels(top.map((s) => s.key));
  const byProject = groupEntries(ctx.entries, projectKey);
  const perProject = top.map((s) => new Map(groupTotals(byProject.get(s.key) ?? [], (e) => e.model, ctx.markup).map((g) => [g.key, g.final])));
  const modelTotals = new Map();
  for (const m of perProject) for (const [model, v] of m) modelTotals.set(model, (modelTotals.get(model) ?? 0) + v);
  const models = [...modelTotals.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model);
  const names = modelLabels(models);
  const colors = modelColors(models);
  const chart = makeChart(mount.querySelector('#pj-models'), {
    chart: { type: 'bar', height: Math.max(220, 96 + top.length * 44), stacked: true },
    series: models.map((model, i) => ({ name: names[i], data: perProject.map((m) => m.get(model) ?? 0) })),
    colors,
    plotOptions: { bar: { horizontal: true, barHeight: '60%' } },
    xaxis: { categories: labels, ...moneyAxis },
    legend: { show: false },
    tooltip: { shared: true, intersect: false, ...moneyTooltip },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
}

export function renderProjectCharts(mount, ctx, stats) {
  treemapChart(mount, stats);
  bubbleChart(mount, stats);
  overTimeChart(mount, ctx, stats);
  modelsChart(mount, ctx, stats);
}
