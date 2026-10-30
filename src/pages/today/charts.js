import { groupTotals, sessionSummaries } from '../../core/metrics.js';
import { fmtDuration, fmtFixed, fmtInt, fmtMoney, fmtNum, projectName, sessionName } from '../../core/utils.js';
import { entryCost } from '../../core/config.js';
import { esc } from '../../ui/dom.js';
import { cssToken, makeChart, moneyAxis, moneyTooltip } from '../../ui/charts.js';
import { attachLegend, seriesItems, sliceApply } from '../../ui/legend.js';
import { seriesColors } from '../../ui/ramp.js';
import { getLocale, t } from '../../i18n/index.js';
import { cacheRateByHour, callPoints, responseByHour } from './data.js';

const pad = (n) => String(n).padStart(2, '0');

const HOURS = Array.from({ length: 24 }, (_, h) => `${pad(h)}:00`);

const clockText = (x) => {
  const minutes = Math.round(x * 60);
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
};

const hostOf = (root, id) => root.querySelector(`#${id}`);

const seriesOf = (list) => list.filter(Boolean);

const tooltipBox = (title, lines) => `<div class="tip-box">
  <div class="tip-title">${esc(title)}</div>
  ${lines.map((line) => `<div>${esc(line)}</div>`).join('')}
</div>`;

export function renderHourly(root, { hourlyCost, averageDay }) {
  const cost = hourlyCost.map((v) => +v.toFixed(6));
  const average = averageDay ? averageDay.map((v) => +v.toFixed(6)) : null;
  const names = [t('today.hourly.cost'), t('today.hourly.average')];
  const chart = makeChart(hostOf(root, 'td-hourly'), {
    chart: { type: 'line', height: 280 },
    series: seriesOf([
      { name: names[0], type: 'column', data: cost },
      average && { name: names[1], type: 'line', data: average },
    ]),
    colors: average ? [cssToken('--c-cost'), cssToken('--c-prev')] : [cssToken('--c-cost')],
    stroke: { width: average ? [0, 2] : [0], curve: 'smooth', dashArray: average ? [0, 5] : [0] },
    plotOptions: { bar: { borderRadius: 3, columnWidth: '62%' } },
    xaxis: { categories: HOURS },
    yaxis: moneyAxis,
    tooltip: { shared: true, intersect: false, ...moneyTooltip },
    legend: { show: false },
    markers: { size: 0 },
  });
  if (average) attachLegend(chart, { items: seriesItems(names, ['var(--c-cost)', 'var(--c-prev)']) });
}

export function renderCumulative(root, { currentPoints, previousPoints }) {
  const names = [t('today.cumulative.current'), t('today.cumulative.previous')];
  const series = seriesOf([
    { name: names[0], data: currentPoints },
    previousPoints.length > 0 && { name: names[1], data: previousPoints },
  ]);
  const two = series.length === 2;
  const chart = makeChart(hostOf(root, 'td-cumulative'), {
    chart: { type: 'line', height: 280 },
    series,
    colors: two ? [cssToken('--c-cost'), cssToken('--c-prev')] : [cssToken('--c-cost')],
    stroke: { width: two ? [2, 2] : [2], curve: 'stepline', dashArray: two ? [0, 5] : [0] },
    xaxis: {
      type: 'numeric',
      min: 0,
      max: 24,
      tickAmount: 12,
      labels: { formatter: (v) => `${pad(Math.round(v))}:00` },
    },
    yaxis: moneyAxis,
    tooltip: { shared: false, intersect: false, x: { formatter: (v) => clockText(v) }, ...moneyTooltip },
    legend: { show: false },
    markers: { size: 0 },
  });
  if (two) attachLegend(chart, { items: seriesItems(names, ['var(--c-cost)', 'var(--c-prev)']) });
}

function donutOptions({ labels, data, colors, totalLabel, format, valueFormat, tipFormat = valueFormat }) {
  const sum = data.reduce((a, b) => a + b, 0);
  return {
    chart: { type: 'donut', height: 300 },
    series: sum > 0 ? data : [],
    labels,
    colors,
    stroke: { width: 2, colors: [cssToken('--surface')] },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show: true,
            name: { show: true, color: cssToken('--text-muted') },
            value: { show: true, color: cssToken('--text'), formatter: (v) => valueFormat(Number(v)) },
            total: {
              show: true,
              label: totalLabel,
              color: cssToken('--text-muted'),
              formatter: (w) => format(w.globals.seriesTotals.reduce((a, b) => a + b, 0)),
            },
          },
        },
      },
    },
    tooltip: { y: { formatter: (v) => tipFormat(v) } },
    legend: { show: false },
  };
}

function attachSlices(chart, labels, data, colors) {
  const sum = data.reduce((a, b) => a + b, 0);
  if (labels.length < 2 || sum <= 0) return;
  attachLegend(chart, {
    items: seriesItems(labels, colors),
    apply: sliceApply({ labels, data, colors }),
  });
}

export function renderModelDonut(root, entries, markup) {
  const rows = groupTotals(entries, (e) => e.model, markup);
  const labels = rows.map((r) => r.key);
  const data = rows.map((r) => +r.final.toFixed(6));
  const colors = seriesColors(labels.length);
  const chart = makeChart(hostOf(root, 'td-model'), donutOptions({
    labels,
    data,
    colors,
    totalLabel: t('today.total'),
    format: fmtMoney,
    valueFormat: fmtMoney,
  }));
  attachSlices(chart, labels, data, colors);
}

export function renderTokenDonut(root, sum) {
  const labels = [
    t('components.tokenInput'),
    t('components.tokenOutput'),
    t('components.tokenCacheWrite5m'),
    t('components.tokenCacheWrite1h'),
    t('components.tokenCacheRead'),
  ];
  const data = [sum.input, sum.output, sum.cacheWrite5m, sum.cacheWrite1h, sum.cacheRead];
  const tokens = ['--c-input', '--c-output', '--c-cache-write', '--c-cache-write-1h', '--c-cache-read'];
  const colors = tokens.map(cssToken);
  const chart = makeChart(hostOf(root, 'td-tokens'), donutOptions({
    labels,
    data,
    colors,
    totalLabel: t('today.total'),
    format: fmtNum,
    valueFormat: fmtNum,
    tipFormat: (v) => t('today.tokensCount', { n: fmtInt(v) }),
  }));
  attachSlices(chart, labels, data, colors);
}

export function renderResponse(root, durations) {
  const { avg, max } = responseByHour(durations);
  const names = [t('today.response.average'), t('today.response.slowest')];
  const seconds = (v) => fmtDuration(v * 1000);
  const chart = makeChart(hostOf(root, 'td-response'), {
    chart: { type: 'line', height: 280 },
    series: [
      { name: names[0], type: 'column', data: avg },
      { name: names[1], type: 'line', data: max },
    ],
    colors: [cssToken('--c-output'), cssToken('--warn')],
    stroke: { width: [0, 2], curve: 'smooth' },
    plotOptions: { bar: { borderRadius: 3, columnWidth: '62%' } },
    xaxis: { categories: HOURS },
    yaxis: { labels: { formatter: seconds } },
    tooltip: { shared: true, intersect: false, y: { formatter: seconds } },
    legend: { show: false },
    markers: { size: 0 },
  });
  attachLegend(chart, { items: seriesItems(names, ['var(--c-output)', 'var(--warn)']) });
}

export function renderCache(root, entries) {
  const rates = cacheRateByHour(entries);
  makeChart(hostOf(root, 'td-cache'), {
    chart: { type: 'bar', height: 280 },
    series: [{ name: t('today.cache.rate'), data: rates }],
    colors: [cssToken('--c-cache-read')],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '62%' } },
    xaxis: { categories: HOURS },
    yaxis: { min: 0, max: 100, tickAmount: 5, labels: { formatter: (v) => `${fmtFixed(v, 0)}%` } },
    tooltip: { y: { formatter: (v) => (v == null ? '-' : `${fmtFixed(v, 1)}%`) } },
    legend: { show: false },
  });
}

export function renderTimeline(root, entries, markup, openSession) {
  const timeFormat = new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit' });
  const summaries = sessionSummaries(entries, markup)
    .filter((s) => s.start && !Number.isNaN(new Date(s.start).getTime()))
    .sort((a, b) => a.start.localeCompare(b.start));
  const data = summaries.map((s) => {
    const start = new Date(s.start).getTime();
    const end = Math.max(new Date(s.end).getTime(), start + 60000);
    return {
      x: projectName(s.project),
      y: [start, end],
      sid: s.sessionId,
      title: sessionName(s.sessionId, s.slug),
      ms: s.durationMs,
      cost: s.final,
    };
  });
  makeChart(hostOf(root, 'td-timeline'), {
    chart: {
      type: 'rangeBar',
      height: Math.max(140, data.length * 32 + 60),
      events: {
        dataPointSelection: (event, chart, config) => {
          const point = config.w.config.series[config.seriesIndex]?.data?.[config.dataPointIndex];
          if (point?.sid) openSession(point.sid);
        },
      },
    },
    series: [{ name: t('today.timeline.session'), data }],
    colors: [cssToken('--c-cost')],
    plotOptions: { bar: { horizontal: true, borderRadius: 4, rangeBarGroupRows: false } },
    xaxis: { type: 'datetime', labels: { datetimeUTC: false, format: 'HH:mm' } },
    yaxis: { labels: { maxWidth: 140 } },
    tooltip: {
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const d = w.config.series[seriesIndex]?.data?.[dataPointIndex];
        if (!d) return '';
        return tooltipBox(d.title, [
          `${d.x}`,
          `${timeFormat.format(d.y[0])} - ${timeFormat.format(d.y[1])}`,
          `${t('today.timeline.duration')}: ${fmtDuration(d.ms)}`,
          `${t('today.timeline.cost')}: ${fmtMoney(d.cost)}`,
        ]);
      },
    },
    legend: { show: false },
  });
}

export function renderCalls(root, entries, markup, openSession) {
  const data = callPoints(entries, (e) => entryCost(e) * markup);
  makeChart(hostOf(root, 'td-calls'), {
    chart: {
      type: 'bubble',
      height: 300,
      events: {
        dataPointSelection: (event, chart, config) => {
          const point = config.w.config.series[config.seriesIndex]?.data?.[config.dataPointIndex];
          if (point?.sid) openSession(point.sid);
        },
      },
    },
    series: [{ name: t('today.calls.call'), data }],
    colors: [cssToken('--c-cost')],
    fill: { opacity: 0.6 },
    plotOptions: { bubble: { minBubbleRadius: 3, maxBubbleRadius: 16 } },
    xaxis: {
      type: 'numeric',
      min: 0,
      max: 24,
      tickAmount: 12,
      labels: { formatter: (v) => `${pad(Math.floor(v))}:00` },
    },
    yaxis: moneyAxis,
    tooltip: {
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const d = w.config.series[seriesIndex]?.data?.[dataPointIndex];
        if (!d) return '';
        return tooltipBox(clockText(d.x), [
          `${t('today.calls.cost')}: ${fmtMoney(d.y)}`,
          `${t('today.calls.output')}: ${fmtInt(d.z)}`,
        ]);
      },
    },
    legend: { show: false },
  });
}
