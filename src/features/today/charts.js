// ─────────────────────────────────────────────
// TODAY CHARTS — pie, hourly, response time, cache, timeline, cumulative, scatter
// ─────────────────────────────────────────────
import { ApexCharts, CHART_COLORS, getApexBaseOpts } from '../../core/charts.js';
import { state } from '../../core/state.js';
import { calcCost } from '../../core/config.js';

let chartTodayModel      = null;
let chartTodayTokens     = null;
let chartTodayHourly     = null;
let chartTodayCache      = null;
let chartTodayResponse   = null;
let chartTimeline        = null;
let chartTodayCumulative = null;
let chartTodayScatter    = null;

export function destroyTodayCharts() {
  if (chartTodayModel)      { chartTodayModel.destroy();      chartTodayModel      = null; }
  if (chartTodayTokens)     { chartTodayTokens.destroy();     chartTodayTokens     = null; }
  if (chartTodayHourly)     { chartTodayHourly.destroy();     chartTodayHourly     = null; }
  if (chartTodayCache)      { chartTodayCache.destroy();      chartTodayCache      = null; }
  if (chartTodayResponse)   { chartTodayResponse.destroy();   chartTodayResponse   = null; }
  if (chartTimeline)        { chartTimeline.destroy();        chartTimeline        = null; }
  if (chartTodayCumulative) { chartTodayCumulative.destroy(); chartTodayCumulative = null; }
  if (chartTodayScatter)    { chartTodayScatter.destroy();    chartTodayScatter    = null; }
}

export function resizeTodayCharts() {
  const r = (chart, id) => {
    if (!chart) return;
    const w = document.getElementById(id)?.offsetWidth;
    if (w) chart.updateOptions({ chart: { width: w } }, false, false);
  };
  r(chartTodayModel,      'chart-today-model');
  r(chartTodayTokens,     'chart-today-tokens');
  r(chartTodayHourly,     'chart-today-hourly');
  r(chartTodayCache,      'chart-today-cache');
  r(chartTodayResponse,   'chart-today-response');
  r(chartTimeline,        'chart-timeline');
  r(chartTodayCumulative, 'chart-today-cumulative');
  r(chartTodayScatter,    'chart-today-scatter');
}

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

export function renderTodayModelPie(entries) {
  const map = new Map();
  for (const e of entries) {
    const cost = calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model) * state.markup;
    map.set(e.model, (map.get(e.model) || 0) + cost);
  }
  const labels = [...map.keys()];
  const series = labels.map(l => +map.get(l).toFixed(6));
  const base   = getApexBaseOpts();

  chartTodayModel = applyOrCreate(chartTodayModel, 'chart-today-model', {
    chart:      { ...base.chart, type: 'donut', height: 240 },
    theme:      base.theme,
    series,
    labels,
    colors:     CHART_COLORS.slice(0, Math.max(labels.length, 1)),
    tooltip:    { ...base.tooltip, y: { formatter: v => '$' + v.toFixed(6) } },
    dataLabels: { enabled: false },
    legend:     { ...base.legend, position: 'bottom' },
    plotOptions: { pie: { donut: { size: '65%' } } },
    noData:     base.noData,
  });
}

export function renderTodayTokenPie(entries) {
  let inp = 0, out = 0, cw = 0, cr = 0;
  for (const e of entries) { inp += e.input; out += e.output; cw += e.cacheWrite; cr += e.cacheRead; }
  const base = getApexBaseOpts();

  chartTodayTokens = applyOrCreate(chartTodayTokens, 'chart-today-tokens', {
    chart:      { ...base.chart, type: 'donut', height: 240 },
    theme:      base.theme,
    series:     [inp, out, cw, cr],
    labels:     ['Input', 'Output', 'Cache Write', 'Cache Read'],
    colors:     [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[4]],
    tooltip:    { ...base.tooltip, y: { formatter: v => v.toLocaleString() + ' tokens' } },
    dataLabels: { enabled: false },
    legend:     { ...base.legend, position: 'bottom' },
    plotOptions: { pie: { donut: { size: '65%' } } },
    noData:     base.noData,
  });
}

const zoomToolbar = { show: true, tools: { download: false, selection: false, zoom: true, zoomin: true, zoomout: true, pan: false, reset: true }, autoSelected: 'zoom' };

export function renderTodayHourlyChart(entries) {
  const hourMap = new Map();
  for (let h = 0; h < 24; h++) hourMap.set(String(h).padStart(2, '0') + ':00', 0);
  for (const e of entries) {
    const hour = (e.ts && e.ts.length >= 13) ? e.ts.slice(11, 13) + ':00' : '00:00';
    const cost = calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model) * state.markup;
    hourMap.set(hour, (hourMap.get(hour) || 0) + cost);
  }
  const labels = [...hourMap.keys()];
  const data   = labels.map(l => +hourMap.get(l).toFixed(6));
  const base   = getApexBaseOpts();

  chartTodayHourly = applyOrCreate(chartTodayHourly, 'chart-today-hourly', {
    chart:      { ...base.chart, type: 'area', height: 260, toolbar: zoomToolbar },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: base.dataLabels,
    tooltip:    { ...base.tooltip, y: { formatter: v => '$' + v.toFixed(6) } },
    series:     [{ name: 'Cost ($)', data }],
    colors:     [CHART_COLORS[0]],
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.02, stops: [0, 100] },
    },
    stroke:  { curve: 'smooth', width: 2 },
    xaxis:   { ...base.xaxis, categories: labels, tickAmount: 8 },
    yaxis:   { ...base.yaxis, labels: { ...base.yaxis.labels, formatter: v => '$' + v.toFixed(2) } },
    legend:  { show: false },
    noData:  base.noData,
  });
}

export function renderTodayResponseTimeChart(durations) {
  const hourMap = new Map();
  for (let h = 0; h < 24; h++) hourMap.set(String(h).padStart(2, '0') + ':00', []);
  for (const d of durations) {
    const hour = (d.ts && d.ts.length >= 13) ? d.ts.slice(11, 13) + ':00' : '00:00';
    if (hourMap.has(hour)) hourMap.get(hour).push(d.durationMs);
  }
  const labels  = [...hourMap.keys()];
  const avgData = labels.map(l => { const v = hourMap.get(l); return v.length ? +(v.reduce((s,x)=>s+x,0)/v.length/1000).toFixed(2) : 0; });
  const maxData = labels.map(l => { const v = hourMap.get(l); return v.length ? +(Math.max(...v)/1000).toFixed(2) : 0; });
  const base    = getApexBaseOpts();

  chartTodayResponse = applyOrCreate(chartTodayResponse, 'chart-today-response', {
    chart:      { ...base.chart, type: 'line', height: 260, toolbar: zoomToolbar },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: base.dataLabels,
    tooltip:    { ...base.tooltip, y: { formatter: v => v + 's' } },
    series: [
      { name: 'Avg (s)', data: avgData, type: 'bar' },
      { name: 'Max (s)', data: maxData, type: 'line' },
    ],
    colors:  [CHART_COLORS[1], CHART_COLORS[2]],
    stroke:  { width: [0, 2], curve: 'smooth' },
    xaxis:   { ...base.xaxis, categories: labels, tickAmount: 8 },
    yaxis:   { ...base.yaxis, labels: { ...base.yaxis.labels, formatter: v => v + 's' } },
    legend:  { ...base.legend, position: 'top' },
    plotOptions: { bar: { borderRadius: 2, columnWidth: '60%' } },
    noData:  base.noData,
  });
}

export function renderTodayCacheChart(entries) {
  let inp = 0, cw = 0, cr = 0;
  for (const e of entries) { inp += e.input; cw += e.cacheWrite; cr += e.cacheRead; }
  const total   = inp + cw + cr;
  const readPct = total > 0 ? +((cr / total) * 100).toFixed(1) : 0;
  const base    = getApexBaseOpts();
  const light   = document.documentElement.dataset.theme === 'winter';

  chartTodayCache = applyOrCreate(chartTodayCache, 'chart-today-cache', {
    chart:  { ...base.chart, type: 'radialBar', height: 240 },
    theme:  base.theme,
    series: [readPct],
    labels: ['Cache Hit Rate'],
    colors: [CHART_COLORS[1]],
    plotOptions: {
      radialBar: {
        hollow:     { size: '60%' },
        track:      { background: light ? '#e2e8f0' : '#1e293b' },
        dataLabels: {
          name:  { fontSize: '13px', color: base.chart.foreColor, offsetY: -4 },
          value: { fontSize: '26px', fontWeight: 700, color: base.chart.foreColor, formatter: v => v + '%' },
        },
      },
    },
    noData: base.noData,
  });
}

export function renderSessionTimeline(entries) {
  // Build session start/end bounds from entry timestamps
  const bounds = new Map();
  for (const e of entries) {
    if (!e.ts || e.ts.length < 16) continue;
    if (!bounds.has(e.sessionId)) {
      bounds.set(e.sessionId, { slug: e.slug, cwd: e.cwd, startTs: e.ts, endTs: e.ts });
    }
    const b = bounds.get(e.sessionId);
    if (e.ts < b.startTs) b.startTs = e.ts;
    if (e.ts > b.endTs)   b.endTs   = e.ts;
  }

  const sessions = [...bounds.values()].sort((a, b) => a.startTs.localeCompare(b.startTs));
  const data = sessions.map(s => {
    const start = new Date(s.startTs).getTime();
    const end   = Math.max(new Date(s.endTs).getTime(), start + 60000); // min 1 min
    const label = (s.cwd || s.slug || '').split('/').pop() || 'session';
    return { x: label, y: [start, end], slug: s.slug, cwd: s.cwd, startTs: s.startTs, endTs: s.endTs };
  });

  const base   = getApexBaseOpts();
  const height = Math.max(100, sessions.length * 30 + 50);

  chartTimeline = applyOrCreate(chartTimeline, 'chart-timeline', {
    chart:      { ...base.chart, type: 'rangeBar', height, toolbar: zoomToolbar },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: { enabled: false },
    series:     [{ name: 'Session', data }],
    colors:     [CHART_COLORS[0]],
    plotOptions: { bar: { horizontal: true, borderRadius: 4, rangeBarGroupRows: false } },
    xaxis: {
      ...base.xaxis,
      type: 'datetime',
      labels: { ...base.xaxis.labels, datetimeUTC: false, format: 'HH:mm' },
    },
    yaxis: { labels: { style: { colors: base.yaxis.labels.style.colors, fontSize: '11px' }, maxWidth: 130 } },
    tooltip: {
      ...base.tooltip,
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const d = w.config.series[seriesIndex].data[dataPointIndex];
        if (!d) return '';
        const fmt = ms => { const t = new Date(ms); return String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0'); };
        const durMs = d.y[1] - d.y[0];
        const dur   = durMs < 60000 ? '<1m' : Math.round(durMs / 60000) + 'm';
        return `<div style="padding:8px 12px;font-size:12px">
          <div style="font-weight:600;margin-bottom:4px">${d.x}</div>
          <div>${fmt(d.y[0])} → ${fmt(d.y[1])}</div>
          <div style="opacity:.55;margin-top:2px">Duration: ${dur}</div>
        </div>`;
      },
    },
    noData: base.noData,
  });
}

export function renderTodayCumulativeCost(entries) {
  const sorted = [...entries].filter(e => e.ts).sort((a, b) => a.ts.localeCompare(b.ts));
  let running = 0;
  const data = sorted.map(e => {
    running += calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model) * state.markup;
    return { x: new Date(e.ts).getTime(), y: +running.toFixed(6) };
  });

  const base = getApexBaseOpts();

  chartTodayCumulative = applyOrCreate(chartTodayCumulative, 'chart-today-cumulative', {
    chart:      { ...base.chart, type: 'area', height: 220, toolbar: zoomToolbar },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: base.dataLabels,
    series:     [{ name: 'Cumulative Cost', data }],
    colors:     [CHART_COLORS[2]],
    stroke:     { curve: 'stepline', width: 2 },
    fill:       { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 100] } },
    xaxis:      { ...base.xaxis, type: 'datetime', labels: { ...base.xaxis.labels, datetimeUTC: false, format: 'HH:mm' } },
    yaxis:      { ...base.yaxis, labels: { ...base.yaxis.labels, formatter: v => '$' + v.toFixed(4) } },
    tooltip:    { ...base.tooltip, x: { format: 'HH:mm:ss' }, y: { formatter: v => '$' + v.toFixed(6) } },
    legend:     { show: false },
    noData:     base.noData,
  });
}

export function renderCallsScatter(entries) {
  const data = entries
    .filter(e => e.ts && e.ts.length >= 16)
    .map(e => {
      const dt   = new Date(e.ts);
      const hour = +(dt.getHours() + dt.getMinutes() / 60).toFixed(3);
      const cost = calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model) * state.markup;
      return { x: hour, y: +cost.toFixed(6), z: Math.max(Math.round(e.output / 500), 2) };
    });

  const base = getApexBaseOpts();
  const tick = base.yaxis.labels.style.colors;

  chartTodayScatter = applyOrCreate(chartTodayScatter, 'chart-today-scatter', {
    chart:      { ...base.chart, type: 'bubble', height: 240, toolbar: zoomToolbar },
    theme:      base.theme,
    grid:       base.grid,
    dataLabels: base.dataLabels,
    series:     [{ name: 'API Call', data }],
    colors:     [CHART_COLORS[0]],
    plotOptions: { bubble: { minBubbleRadius: 3, maxBubbleRadius: 16 } },
    xaxis: {
      ...base.xaxis,
      min: 0, max: 24,
      tickAmount: 12,
      labels: { style: { colors: tick, fontSize: '11px' }, formatter: v => String(Math.floor(v)).padStart(2, '0') + ':00' },
    },
    yaxis:   { ...base.yaxis, labels: { ...base.yaxis.labels, formatter: v => '$' + v.toFixed(4) } },
    tooltip: {
      ...base.tooltip,
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const d = w.config.series[seriesIndex].data[dataPointIndex];
        if (!d) return '';
        const h = Math.floor(d.x);
        const m = String(Math.round((d.x - h) * 60)).padStart(2, '0');
        return `<div style="padding:8px 12px;font-size:12px">
          <div style="font-weight:600;margin-bottom:4px">${String(h).padStart(2,'0')}:${m}</div>
          <div>Cost: $${d.y.toFixed(6)}</div>
          <div style="opacity:.55;margin-top:2px">~${d.z * 500} output tokens</div>
        </div>`;
      },
    },
    noData: base.noData,
  });
}
