// ─────────────────────────────────────────────
// OVERVIEW — activity heatmap (ApexCharts, 52-week GitHub-style)
// ─────────────────────────────────────────────
import { ApexCharts, getApexBaseOpts } from '../../core/charts.js';
import { state } from '../../core/state.js';
import { calcCost } from '../../core/config.js';

let chartHeatmap = null;

export function resizeHeatmap() {
  if (!chartHeatmap) return;
  const w = document.getElementById('chart-heatmap')?.offsetWidth;
  if (w) chartHeatmap.updateOptions({ chart: { width: w } }, false, false);
}

function heatmapColors() {
  return document.documentElement.dataset.theme === 'winter'
    ? ['#eef2ff', '#c7d2fb', '#818cf8', '#4f46e5', '#3730a3'] // indigo tints light
    : ['#0f172a', '#1e1b4b', '#3730a3', '#6366f1', '#a5b4fc']; // indigo tints dark
}

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function renderHeatmap() {
  const el = document.getElementById('chart-heatmap');
  if (!el) return;

  // ── Build cost-per-day map (local dates) ────
  const dayCosts = new Map();
  for (const e of state.allEntries) {
    const cost = calcCost({
      input_tokens: e.input,
      output_tokens: e.output,
      cache_creation_input_tokens: e.cacheWrite,
      cache_read_input_tokens: e.cacheRead,
    }, e.model) * state.markup;
    const localDate = e.ts ? toLocalDateStr(new Date(e.ts)) : e.date;
    dayCosts.set(localDate, (dayCosts.get(localDate) || 0) + cost);
  }
  const maxCost = Math.max(...dayCosts.values(), 0.001);

  // ── Build 52-week grid (Mon-aligned) ─────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToLastMonday = (today.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const start = new Date(today);
  start.setDate(start.getDate() - daysToLastMonday - 52 * 7); // Monday 52 weeks ago

  const weekMondays = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 7)) {
    weekMondays.push(new Date(d));
  }

  // ── 7 series Mon→Sun ──────────────────────────
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const series = DAY_NAMES.map((name, d) => ({
    name,
    data: weekMondays.map(monday => {
      const day = new Date(monday);
      day.setDate(day.getDate() + d); // d=0 → Mon, d=6 → Sun
      const x = toLocalDateStr(monday); // shared column key = week's Monday
      if (day > today) return { x, y: 0, date: null, cost: 0 };
      const dateStr = toLocalDateStr(day);
      const cost = dayCosts.get(dateStr) || 0;
      const intensity = cost > 0 ? Math.ceil((cost / maxCost) * 4) : 0;
      return { x, y: intensity, date: dateStr, cost };
    }),
  }));

  const colors = heatmapColors();
  const base   = getApexBaseOpts();
  const light  = document.documentElement.dataset.theme === 'winter';
  const tick   = light ? '#64748b' : '#94a3b8';

  const opts = {
    chart: {
      ...base.chart,
      type: 'heatmap',
      height: 155,
      animations: { enabled: true, speed: 400 },
    },
    theme:      base.theme,
    series,
    dataLabels: { enabled: false },
    plotOptions: {
      heatmap: {
        radius: 2,
        enableShades: false,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: colors[0], name: 'None'   },
            { from: 1, to: 1, color: colors[1], name: 'Low'    },
            { from: 2, to: 2, color: colors[2], name: 'Medium' },
            { from: 3, to: 3, color: colors[3], name: 'High'   },
            { from: 4, to: 4, color: colors[4], name: 'Peak'   },
          ],
        },
      },
    },
    xaxis: {
      type: 'category',
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels: {
        style: { colors: tick, fontSize: '10px' },
        // Show month abbreviation only on the first week of each month
        formatter: val => {
          if (!val || val.length < 10) return '';
          const [, , dd] = val.split('-');
          return parseInt(dd, 10) <= 7
            ? new Date(val + 'T12:00:00').toLocaleString('default', { month: 'short' })
            : '';
        },
        hideOverlappingLabels: false,
        showDuplicates: true,
      },
    },
    yaxis: {
      labels: {
        style: { colors: tick, fontSize: '10px' },
        offsetX: 2,
      },
    },
    tooltip: {
      ...base.tooltip,
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const d = w.config.series[seriesIndex].data[dataPointIndex];
        if (!d?.date) return `<div style="padding:6px 10px;font-size:12px;opacity:.5">No data</div>`;
        return `<div style="padding:8px 12px;font-size:12px">
          <div style="font-weight:600;margin-bottom:3px">${d.date}</div>
          <div>${d.cost > 0 ? '$' + d.cost.toFixed(4) : 'No activity'}</div>
        </div>`;
      },
    },
    states: {
      hover:  { filter: { type: light ? 'darken' : 'lighten', value: light ? 0.75 : 0.4 } },
      active: { filter: { type: light ? 'darken' : 'lighten', value: light ? 0.55 : 0.3 } },
    },
    legend: { show: false },
    grid:   { padding: { left: 12, right: 4, top: -10, bottom: 0 } },
  };

  if (chartHeatmap) { chartHeatmap.destroy(); chartHeatmap = null; }
  chartHeatmap = new ApexCharts(el, opts);
  chartHeatmap.render();

  // ── Custom "Less ■■■■■ More" legend ──────────
  const legendEl = document.getElementById('heatmap-legend');
  if (legendEl) {
    legendEl.innerHTML = ['Less', ...colors.map(c =>
      `<span style="width:12px;height:12px;border-radius:2px;background:${c};display:inline-block"></span>`
    ), 'More'].join('');
  }
}
