import { groupTotals } from '../../core/metrics.js';
import { fmtInt, fmtMoney, fmtNum } from '../../core/utils.js';
import { chartCard } from '../../ui/dom.js';
import { cssToken, makeChart, moneyAxis, moneyTooltip } from '../../ui/charts.js';
import { attachLegend, distributedApply, seriesItems, sliceApply } from '../../ui/legend.js';
import { seriesColors } from '../../ui/ramp.js';
import { t } from '../../i18n/index.js';
import { EFFORT_RANK } from '../../components/sessions.js';
import { bucketAxis, bucketSeries, groupEntries, modelColors, modelLabels } from './helpers.js';
import { effortByModel } from './table.js';

export function modelCards() {
  return [
    chartCard({
      span: 5, color: 'var(--c-cost)', iconId: 'i-costs', id: 'md-share',
      title: t('models.share.title'), sub: t('models.share.sub'), tip: t('models.share.tip'),
    }),
    chartCard({
      span: 7, color: 'var(--c-cost)', iconId: 'i-trend-up', id: 'md-over-time',
      title: t('models.overTime.title'), sub: t('models.overTime.sub'), tip: t('models.overTime.tip'),
    }),
    chartCard({
      span: 6, color: 'var(--c-output)', iconId: 'i-sessions', id: 'md-cost-per-request',
      title: t('models.perRequest.title'), sub: t('models.perRequest.sub'), tip: t('models.perRequest.tip'),
    }),
    chartCard({
      span: 6, color: 'var(--c-input)', iconId: 'i-database', id: 'md-token-mix',
      title: t('models.tokenMix.title'), sub: t('models.tokenMix.sub'), tip: t('models.tokenMix.tip'),
    }),
    chartCard({
      span: 12, color: 'var(--accent)', iconId: 'i-models', id: 'md-effort',
      title: t('models.effort.title'), sub: t('models.effort.sub'), tip: t('models.effort.tip'),
    }),
  ].join('');
}

function shareChart(mount, stats, labels, colors) {
  const data = stats.map((s) => s.final);
  const chart = makeChart(mount.querySelector('#md-share'), {
    chart: { type: 'donut', height: 320 },
    series: data,
    labels,
    colors,
    stroke: { width: 2, colors: [cssToken('--surface')] },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show: true,
            name: { show: true },
            value: { show: true, formatter: (v) => fmtMoney(Number(v)) },
            total: {
              show: true,
              label: t('models.share.total'),
              formatter: (w) => fmtMoney(w.globals.seriesTotals.reduce((a, b) => a + b, 0)),
            },
          },
        },
      },
    },
    legend: { show: false },
    tooltip: { y: { formatter: (v) => fmtMoney(v) } },
  });
  attachLegend(chart, { items: seriesItems(labels, colors), apply: sliceApply({ labels, data, colors }) });
}

function overTimeChart(mount, ctx, groups, labels, colors) {
  const { keys, series } = bucketSeries(
    groups.map((g, i) => ({ name: labels[i], entries: g })),
    ctx,
  );
  const chart = makeChart(mount.querySelector('#md-over-time'), {
    chart: { type: 'bar', height: 320, stacked: true },
    series,
    colors,
    plotOptions: { bar: { columnWidth: '70%', borderRadius: 2 } },
    xaxis: bucketAxis(keys),
    yaxis: moneyAxis,
    legend: { show: false },
    tooltip: { shared: true, intersect: false, ...moneyTooltip },
  });
  attachLegend(chart, { items: seriesItems(labels, colors) });
}

function perRequestChart(mount, stats, labelOf, colorOf) {
  const rows = stats
    .map((s) => ({ label: labelOf.get(s.key), color: colorOf.get(s.key), value: s.requests > 0 ? s.final / s.requests : 0 }))
    .sort((a, b) => b.value - a.value);
  const labels = rows.map((r) => r.label);
  const data = rows.map((r) => r.value);
  const colors = rows.map((r) => r.color);
  const name = t('models.perRequest.series');
  const chart = makeChart(mount.querySelector('#md-cost-per-request'), {
    chart: { type: 'bar', height: Math.max(200, 56 + rows.length * 44) },
    series: [{ name, data }],
    colors,
    plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 4, barHeight: '60%' } },
    xaxis: { categories: labels, ...moneyAxis },
    dataLabels: { enabled: true, formatter: (v) => fmtMoney(v), style: { colors: [cssToken('--text')] }, offsetX: 4 },
    legend: { show: false },
    tooltip: moneyTooltip,
  });
  attachLegend(chart, {
    items: seriesItems(labels, colors),
    apply: distributedApply({ labels, data, colors, name }),
  });
}

function tokenMixChart(mount, stats, labelOf) {
  const kinds = [
    { name: t('components.tokenInput'), token: '--c-input', pick: (s) => s.input },
    { name: t('components.tokenOutput'), token: '--c-output', pick: (s) => s.output },
    { name: t('components.tokenCacheWrite5m'), token: '--c-cache-write', pick: (s) => s.cacheWrite5m },
    { name: t('components.tokenCacheWrite1h'), token: '--c-cache-write-1h', pick: (s) => s.cacheWrite1h },
    { name: t('components.tokenCacheRead'), token: '--c-cache-read', pick: (s) => s.cacheRead },
  ];
  const colors = kinds.map((k) => cssToken(k.token));
  const chart = makeChart(mount.querySelector('#md-token-mix'), {
    chart: { type: 'bar', height: Math.max(200, 96 + stats.length * 44), stacked: true, stackType: '100%' },
    series: kinds.map((k) => ({ name: k.name, data: stats.map(k.pick) })),
    colors,
    plotOptions: { bar: { horizontal: true, barHeight: '60%' } },
    xaxis: { categories: stats.map((s) => labelOf.get(s.key)), labels: { formatter: (v) => `${fmtInt(Math.round(v))}%` } },
    legend: { show: false },
    tooltip: { shared: true, intersect: false, y: { formatter: (v) => fmtNum(v) } },
  });
  attachLegend(chart, { items: seriesItems(kinds.map((k) => k.name), colors) });
}

function effortChart(mount, entries, stats, labelOf) {
  const mix = effortByModel(entries);
  const levels = new Set();
  let hasUnknown = false;
  for (const s of stats) {
    const m = mix.get(s.key);
    for (const level of m?.levels.keys() ?? []) levels.add(level);
    if (m?.unknown > 0) hasUnknown = true;
  }
  const ordered = [...levels].sort((a, b) => (EFFORT_RANK[a] || 0) - (EFFORT_RANK[b] || 0) || a.localeCompare(b));
  const names = [...ordered];
  const palette = seriesColors(ordered.length);
  const colors = [...palette];
  const series = ordered.map((level) => ({
    name: level,
    data: stats.map((s) => mix.get(s.key)?.levels.get(level) ?? 0),
  }));
  if (hasUnknown) {
    names.push(t('models.effort.none'));
    colors.push(cssToken('--text-faint'));
    series.push({ name: t('models.effort.none'), data: stats.map((s) => mix.get(s.key)?.unknown ?? 0) });
  }
  const chart = makeChart(mount.querySelector('#md-effort'), {
    chart: { type: 'bar', height: Math.max(200, 96 + stats.length * 44), stacked: true },
    series,
    colors,
    plotOptions: { bar: { horizontal: true, barHeight: '60%' } },
    xaxis: { categories: stats.map((s) => labelOf.get(s.key)), labels: { formatter: (v) => fmtInt(Math.round(v)) } },
    legend: { show: false },
    tooltip: { shared: true, intersect: false, y: { formatter: (v) => t('models.effort.requests', { n: fmtInt(v) }) } },
  });
  attachLegend(chart, { items: seriesItems(names, colors) });
}

export function renderModelCharts(mount, ctx) {
  const stats = groupTotals(ctx.entries, (e) => e.model, ctx.markup);
  const models = stats.map((s) => s.key);
  const labels = modelLabels(models);
  const colors = modelColors(models);
  const labelOf = new Map(models.map((m, i) => [m, labels[i]]));
  const colorOf = new Map(models.map((m, i) => [m, colors[i]]));
  const byModel = groupEntries(ctx.entries, (e) => e.model);

  shareChart(mount, stats, labels, colors);
  overTimeChart(mount, ctx, models.map((m) => byModel.get(m)), labels, colors);
  perRequestChart(mount, stats, labelOf, colorOf);
  tokenMixChart(mount, stats, labelOf);
  effortChart(mount, ctx.entries, stats, labelOf);
}
