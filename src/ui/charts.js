import ApexCharts from 'apexcharts';
import { fmtMoney, fmtNum } from '../core/utils.js';
import { t } from '../i18n/index.js';
import { EVENTS } from '../app/events.js';
import { rampColor, rampSlot } from './ramp.js';
import { esc } from './dom.js';
import { rebinder } from './listen.js';

const registry = new Set();
const built = new Map();

export const cssToken = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function baseOptions() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    chart: {
      background: 'transparent',
      fontFamily: 'inherit',
      toolbar: { show: false },
      zoom: { enabled: false },
      redrawOnWindowResize: false,
      animations: { speed: 500 },
    },
    theme: { mode: dark ? 'dark' : 'light' },
    grid: { borderColor: cssToken('--chart-grid') },
    xaxis: {
      labels: { style: { colors: cssToken('--text-muted') } },
      axisBorder: { color: cssToken('--chart-grid') },
      axisTicks: { color: cssToken('--chart-grid') },
    },
    yaxis: { labels: { style: { colors: cssToken('--text-muted') } } },
    legend: { labels: { colors: cssToken('--text') } },
    dataLabels: { enabled: false },
    noData: { text: t('common.noData'), style: { color: cssToken('--text-muted') } },
    tooltip: { theme: dark ? 'dark' : 'light' },
    stroke: { lineCap: 'round' },
  };
}

const THEME_TOKENS = [
  '--c-cost', '--c-prev', '--c-input', '--c-output', '--c-cache-write', '--c-cache-write-1h', '--c-cache-read',
  '--m-fable', '--m-mythos', '--m-opus', '--m-sonnet', '--m-haiku', '--m-other',
  '--accent', '--pos', '--neg', '--warn', '--text-muted', '--text-faint',
];

function tokenIndex() {
  const byValue = new Map();
  for (const name of THEME_TOKENS) {
    const v = cssToken(name);
    if (v && !byValue.has(v)) byValue.set(v, name);
  }
  return byValue;
}

export function tokenFor(value) {
  return tokenIndex().get(String(value ?? '').trim()) ?? null;
}

export function asVar(value) {
  const name = tokenFor(value);
  return name ? `var(${name})` : value;
}

const htmlText = (value) => (Array.isArray(value) ? value.map((v) => esc(v)).join(' ') : esc(value));

function tooltipKey(value, opts, own) {
  if (own) return own(value, opts) ?? value;
  const w = opts?.w;
  if (w?.globals?.isBarHorizontal) return w.formatters.yLabelFormatters[0](value, opts);
  return w?.formatters?.xLabelFormatter?.(value, opts) ?? value;
}

function safeSeriesTitle(y) {
  const own = y?.title?.formatter;
  return {
    ...(y ?? {}),
    title: {
      ...(y?.title ?? {}),
      formatter: (name, opts) => (own ? htmlText(own(name, opts)) : name ? `${htmlText(name)}: ` : ''),
    },
  };
}

export function escapeChartLabels(options) {
  const tooltip = { ...(options.tooltip ?? {}) };
  const ownKey = tooltip.x?.formatter;
  if (ownKey || !['datetime', 'numeric'].includes(options.xaxis?.type)) {
    tooltip.x = { ...(tooltip.x ?? {}), formatter: (value, opts) => htmlText(tooltipKey(value, opts, ownKey)) };
  }
  if (Array.isArray(tooltip.y)) {
    const count = Math.max(tooltip.y.length, Array.isArray(options.series) ? options.series.length : 0);
    tooltip.y = Array.from({ length: count }, (_, i) => safeSeriesTitle(tooltip.y[i]));
  } else {
    tooltip.y = safeSeriesTitle(tooltip.y);
  }
  const ownLegend = options.legend?.formatter;
  const legend = { ...(options.legend ?? {}), formatter: (name, opts) => htmlText(ownLegend ? ownLegend(name, opts) : name) };
  return { ...options, tooltip, legend };
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])
      ? deepMerge(a[k], v)
      : v;
  }
  return out;
}

export function chartHost(chart) {
  return chart?.el ?? chart?.w?.globals?.dom?.baseEl ?? null;
}

let wired = false;

export function makeChart(el, options) {
  if (!wired) {
    wired = true;
    initCharts();
  }
  const merged = escapeChartLabels(deepMerge(baseOptions(), options));
  if (merged.chart?.type === 'heatmap') {
    merged.stroke = { ...merged.stroke, lineCap: 'butt' };
    merged.chart = { ...merged.chart, animations: { ...merged.chart.animations, enabled: false } };
  }
  const chart = new ApexCharts(el, merged);

  if (Array.isArray(merged.colors)) {
    chart.coreColors = merged.colors;
    chart.coreTokens = merged.colors.map(tokenFor);
    chart.coreRamp = merged.colors.map(rampSlot);
  }
  chart.render();
  registry.add(chart);

  for (const dead of built.keys()) if (!dead.isConnected) built.delete(dead);
  built.set(el, { chart, options, decorators: built.get(el)?.decorators ?? new Map() });
  return chart;
}

function currentColors(chart) {
  return chart.coreColors.map((c, i) => {
    const name = chart.coreTokens?.[i];
    if (name) return cssToken(name);
    const slot = chart.coreRamp?.[i];
    return slot ? rampColor(slot.i, slot.n) : c;
  });
}

function rebuild(el, entry) {
  const decorators = [...entry.decorators.values()];
  const old = entry.chart;
  const colors = old.coreColors ? currentColors(old) : null;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { old.destroy(); } catch {}
  registry.delete(old);
  try {
    const chart = makeChart(el, {
      ...entry.options,
      ...(colors ? { colors } : {}),
      ...(still ? { chart: { ...entry.options.chart, animations: { ...entry.options.chart?.animations, enabled: false } } } : {}),
    });
    built.get(el).options = entry.options;
    for (const fn of decorators) fn(chart);
    return chart;
  } catch (err) {
    console.error('Chart rebuild failed:', err);
    return null;
  }
}

export function replayCharts(root) {
  if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const [el, entry] of [...built]) {
    if (!el.isConnected) {
      built.delete(el);
      continue;
    }
    if (!root.contains(el)) continue;
    rebuild(el, entry);
  }
}

const REBUILD_ON_TOGGLE = new Set(['radar']);

export function rebuildsOnToggle(chart) {
  return REBUILD_ON_TOGGLE.has(chart?.w?.config?.chart?.type);
}

export function rebuildChart(chart) {
  const host = chartHost(chart);
  const entry = host && built.get(host);
  if (!entry || entry.chart !== chart) return null;
  return rebuild(host, entry);
}

export function destroyChart(chart) {
  if (!chart) return;
  try { chart.destroy(); } catch {}
  registry.delete(chart);
  const host = chartHost(chart);
  if (host && built.get(host)?.chart === chart) built.delete(host);
}

export function destroyChartsIn(root) {
  if (!root) return;
  for (const chart of [...registry]) {
    const host = chartHost(chart);
    if (host && host.isConnected && !root.contains(host)) continue;
    destroyChart(chart);
  }
  for (const el of [...built.keys()]) {
    if (root.contains(el) || !el.isConnected) built.delete(el);
  }
}

export function destroyAllCharts() {
  for (const chart of registry) {
    try { chart.destroy(); } catch {}
  }
  registry.clear();
  built.clear();
}

export function addDecorator(chart, key, fn) {
  const host = chartHost(chart);
  const entry = host && built.get(host);
  if (!entry) return;
  entry.decorators.set(key, fn);
}

export function setThemeOptions(chart, build) {
  chart.themeExtra = build;
  addDecorator(chart, 'theme-options', (rebuilt) => { rebuilt.themeExtra = build; });
}

function themeRepaint(chart) {
  const dark = document.documentElement.dataset.theme === 'dark';
  const muted = cssToken('--text-muted');
  const grid = cssToken('--chart-grid');
  const cfg = chart.w?.config ?? {};
  const axis = (ax) => ({
    ...ax,
    labels: { ...(ax?.labels ?? {}), style: { ...(ax?.labels?.style ?? {}), colors: muted } },
  });
  const next = {
    theme: { mode: dark ? 'dark' : 'light' },
    grid: { ...(cfg.grid ?? {}), borderColor: grid },
    xaxis: {
      ...axis(cfg.xaxis),
      axisBorder: { ...(cfg.xaxis?.axisBorder ?? {}), color: grid },
      axisTicks: { ...(cfg.xaxis?.axisTicks ?? {}), color: grid },
    },
    yaxis: Array.isArray(cfg.yaxis) ? cfg.yaxis.map(axis) : axis(cfg.yaxis),
    legend: { ...(cfg.legend ?? {}), labels: { ...(cfg.legend?.labels ?? {}), colors: cssToken('--text') } },
    tooltip: { ...(cfg.tooltip ?? {}), theme: dark ? 'dark' : 'light' },
  };
  if (chart.coreColors) next.colors = currentColors(chart);
  if (typeof chart.themeExtra === 'function') Object.assign(next, chart.themeExtra());
  return next;
}

function repaintAll() {
  for (const chart of registry) {
    try {
      chart.updateOptions(themeRepaint(chart), false, true);
    } catch {}
  }
}

let resizeTimer;

function scheduleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const chart of registry) {
      try { chart.updateOptions({}, true, false); } catch {}
    }
  }, 250);
}

const bindEvents = rebinder();

export function initCharts() {
  wired = true;
  bindEvents([
    [document, EVENTS.theme, repaintAll],
    [window, 'resize', scheduleResize],
  ]);
}

export const moneyAxis = {
  labels: { formatter: (v) => (Math.abs(v) >= 1000 ? `$${fmtNum(v)}` : fmtMoney(v)) },
};

export const moneyTooltip = { y: { formatter: (v) => fmtMoney(v) } };

export function sparkline(values, { width = 120, height = 36 } = {}) {
  const nums = values.filter((v) => v != null && Number.isFinite(v));
  if (nums.length < 2) return '';
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * (width - 4) + 2;
    const y = height - 3 - ((v - min) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--c, var(--accent))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
