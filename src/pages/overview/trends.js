import { bucketKeyOf, bucketize, groupTotals } from '../../core/metrics.js';
import { fmtInt, fmtMoney, fmtNum, projectKey, projectName } from '../../core/utils.js';
import { t } from '../../i18n/index.js';
import { openBucketModal } from '../../components/bucket-modal.js';
import { modelTone } from '../../ui/dom.js';
import { attachLegend, seriesItems } from '../../ui/legend.js';
import { rampColor } from '../../ui/ramp.js';
import { cssToken, makeChart, moneyAxis, moneyTooltip } from '../../ui/charts.js';
import { bucketLabel } from './format.js';

const MODEL_LIMIT = 6;
const PROJECT_LIMIT = 8;

function periodBuckets(ctx) {
  const { range, previous, markup, entries } = ctx;
  const current = bucketize(entries, { from: range.from, to: range.to, view: range.view, markup });
  const prior = previous.from
    ? bucketize(previous.entries, { from: previous.from, to: previous.to, view: range.view, markup })
    : null;
  const priorAt = (pick) => (prior ? current.keys.map((_, i) => {
    const key = prior.keys[i];
    return key === undefined ? null : pick(prior.byKey.get(key));
  }) : null);
  return { keys: current.keys, current: (pick) => current.keys.map((k) => pick(current.byKey.get(k))), priorAt };
}

const axisLabels = (keys, view) => keys.map((key) => bucketLabel(key, view));

export function renderCostTrend(host, ctx) {
  const { keys, current, priorAt } = periodBuckets(ctx);
  const view = ctx.range.view;
  const todayIndex = keys.indexOf(bucketKeyOf(ctx.today, view));
  const prior = priorAt((b) => b.final);
  const costColor = cssToken('--c-cost');
  const names = [t('overview.series.current')];
  const series = [{ name: names[0], type: 'column', data: current((b) => b.final) }];
  const colors = [({ dataPointIndex }) => (dataPointIndex === todayIndex ? cssToken('--warn') : cssToken('--c-cost'))];
  if (prior) {
    names.push(t('overview.series.previous'));
    series.push({ name: names[1], type: 'line', data: prior });
    colors.push(cssToken('--c-prev'));
  }
  const chart = makeChart(host, {
    chart: {
      type: 'line',
      height: 300,
      events: {
        dataPointSelection: (_e, _c, config) => {
          if (config.seriesIndex !== 0) return;
          const key = keys[config.dataPointIndex];
          if (key) openBucketModal(key, view, ctx.entries, { onOpen: ctx.openSession, markup: ctx.markup });
        },
      },
    },
    series,
    colors,
    stroke: { width: [0, 2.5], dashArray: [0, 6], curve: 'straight' },
    markers: { size: 0 },
    plotOptions: { bar: { borderRadius: 3, columnWidth: '70%' } },
    xaxis: { categories: axisLabels(keys, view) },
    yaxis: moneyAxis,
    tooltip: { shared: true, intersect: false, ...moneyTooltip },
    legend: { show: false },
  });
  attachLegend(chart, { items: seriesItems(names, [costColor, cssToken('--c-prev')]) });
  return chart;
}

export function renderTokenTrend(host, ctx) {
  const { keys, current, priorAt } = periodBuckets(ctx);
  const view = ctx.range.view;
  const parts = [
    { name: t('overview.series.input'), token: '--c-input', pick: (b) => b.input },
    { name: t('overview.series.output'), token: '--c-output', pick: (b) => b.output },
    { name: t('overview.series.cacheWrite5m'), token: '--c-cache-write', pick: (b) => b.cacheWrite5m },
    { name: t('overview.series.cacheWrite1h'), token: '--c-cache-write-1h', pick: (b) => b.cacheWrite1h },
    { name: t('overview.series.cacheRead'), token: '--c-cache-read', pick: (b) => b.cacheRead },
  ];
  const series = parts.map((p) => ({ name: p.name, type: 'column', data: current(p.pick) }));
  const colors = parts.map((p) => cssToken(p.token));
  const names = parts.map((p) => p.name);
  const prior = priorAt((b) => b.tokens);
  if (prior) {
    series.push({ name: t('overview.series.previousTotal'), type: 'line', data: prior });
    colors.push(cssToken('--c-prev'));
    names.push(t('overview.series.previousTotal'));
  }
  const chart = makeChart(host, {
    chart: { type: 'line', height: 300, stacked: true },
    series,
    colors,
    stroke: { width: [...parts.map(() => 0), 2.5], dashArray: [...parts.map(() => 0), 6], curve: 'straight' },
    markers: { size: 0 },
    plotOptions: { bar: { borderRadius: 0, columnWidth: '70%' } },
    xaxis: { categories: axisLabels(keys, view) },
    yaxis: { labels: { formatter: (v) => fmtNum(v) } },
    tooltip: { shared: true, intersect: false, y: { formatter: (v) => fmtInt(v) } },
    legend: { show: false },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
  return chart;
}

function modelColors(models) {
  const used = new Set();
  return models.map((model, i) => {
    const tone = modelTone(model);
    if (used.has(tone)) return rampColor(i, models.length);
    used.add(tone);
    return cssToken(`--m-${tone}`);
  });
}

const modelName = (id) => String(id).replace(/^claude-/, '');

export function renderModelMix(host, ctx) {
  const { range, entries, markup } = ctx;
  const ranked = groupTotals(entries, (e) => e.model || '(unknown)', markup);
  const top = ranked.slice(0, MODEL_LIMIT).map((g) => g.key);
  const groups = new Map(top.map((model) => [model, []]));
  const rest = [];
  for (const e of entries) {
    const bucket = groups.get(e.model || '(unknown)');
    if (bucket) bucket.push(e);
    else rest.push(e);
  }
  const keys = bucketize(entries, { from: range.from, to: range.to, view: range.view, markup }).keys;
  const seriesFor = (list) => {
    const { byKey } = bucketize(list, { from: range.from, to: range.to, view: range.view, markup });
    return keys.map((k) => byKey.get(k)?.final ?? 0);
  };
  const names = top.map(modelName);
  const colors = modelColors(top);
  const series = top.map((model, i) => ({ name: names[i], data: seriesFor(groups.get(model)) }));
  if (rest.length) {
    names.push(t('overview.series.other'));
    colors.push(cssToken('--text-faint'));
    series.push({ name: t('overview.series.other'), data: seriesFor(rest) });
  }
  const chart = makeChart(host, {
    chart: { type: 'area', height: 300, stacked: true },
    series,
    colors,
    stroke: { width: 1.5, curve: 'smooth' },
    fill: { type: 'solid', opacity: 0.75 },
    xaxis: { categories: axisLabels(keys, range.view) },
    yaxis: moneyAxis,
    tooltip: { shared: true, intersect: false, ...moneyTooltip },
    legend: { show: false },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
  return chart;
}

export function renderTopProjects(host, ctx) {
  const ranked = groupTotals(ctx.entries, projectKey, ctx.markup);
  const top = ranked.slice(0, PROJECT_LIMIT);
  const restCost = ranked.slice(PROJECT_LIMIT).reduce((sum, g) => sum + g.final, 0);
  const labels = top.map((g) => projectName(g.key));
  const values = top.map((g) => g.final);
  const colors = top.map(() => cssToken('--c-cost'));
  if (ranked.length > PROJECT_LIMIT) {
    labels.push(t('overview.series.other'));
    values.push(restCost);
    colors.push(cssToken('--text-faint'));
  }
  return makeChart(host, {
    chart: { type: 'bar', height: Math.max(220, labels.length * 34 + 40) },
    series: [{ name: t('overview.series.cost'), data: values }],
    colors,
    plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 3, barHeight: '70%' } },
    xaxis: { categories: labels, labels: { formatter: (v) => fmtMoney(Number(v)) } },
    yaxis: { labels: { maxWidth: 170 } },
    tooltip: moneyTooltip,
    legend: { show: false },
  });
}
