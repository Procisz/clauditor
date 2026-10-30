import { t } from '../i18n/index.js';
import { EVENTS } from '../app/events.js';
import { addDecorator, asVar, chartHost, rebuildChart, rebuildsOnToggle } from './charts.js';
import { rampColor, rampSlot } from './ramp.js';
import { esc } from './dom.js';
import { rebinder } from './listen.js';

const states = new WeakMap();

function stateOf(host) {
  let st = states.get(host);
  if (!st) {
    st = { hidden: new Set() };
    states.set(host, st);
  }
  return st;
}

const mountOf = (host) => host.parentElement ?? host;

function findBar(host) {
  for (const bar of mountOf(host).querySelectorAll(':scope > .ch-legend')) {
    if (bar.dataset.for === host.id) return bar;
  }
  return null;
}

function dotAttrs(color) {
  const value = asVar(color);
  if (value !== color) return { value, ramp: '' };
  const slot = rampSlot(color);
  return { value, ramp: slot ? ` data-ramp="${slot.i},${slot.n}"` : '' };
}

function itemHtml(item, index, off) {
  const dot = dotAttrs(item.color);
  return `<button type="button" class="ch-legend-item${off ? ' is-off' : ''}" data-legend="${index}"
    aria-pressed="${off ? 'false' : 'true'}" title="${esc(item.label)}">
    <span class="ch-legend-dot"${dot.ramp} style="background:${esc(dot.value)}"></span>
    <span class="ch-legend-text">${esc(item.label)}</span>
  </button>`;
}

function paint(host, hidden, total) {
  const bar = findBar(host);
  if (!bar) return;
  const lastOn = hidden.size >= total - 1;
  for (const btn of bar.querySelectorAll('[data-legend]')) {
    const off = hidden.has(Number(btn.dataset.legend));
    btn.setAttribute('aria-pressed', off ? 'false' : 'true');
    btn.classList.toggle('is-off', off);
    if (!off && lastOn) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  }
  const all = bar.querySelector('[data-legend-all]');
  if (all) all.disabled = hidden.size === 0;
}

function build(host, items, hidden) {
  findBar(host)?.remove();
  const bar = document.createElement('div');
  bar.className = 'ch-legend';
  bar.dataset.for = host.id;
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', t('common.chartLegend'));
  bar.innerHTML =
    `<button type="button" class="ch-legend-all" data-legend-all="1"${hidden.size ? '' : ' disabled'}>${esc(t('common.all'))}</button>`
    + items.map((it, i) => itemHtml(it, i, hidden.has(i))).join('');
  mountOf(host).insertBefore(bar, host);
  paint(host, hidden, items.length);
  return bar;
}

function toggleSeries(chart, item) {
  try {
    chart.toggleSeries(item.label);
  } catch {}
}

function hideSeries(chart, item) {
  try {
    chart.hideSeries(item.label);
  } catch {}
}

let wired = false;

export function attachLegend(chart, { items, apply = null, onApply = null, key = 'legend' } = {}) {
  const host = chartHost(chart);
  if (!host || !Array.isArray(items) || items.length < 2) return null;
  if (!wired) {
    wired = true;
    initChartLegend();
  }

  const st = stateOf(host);
  if ([...st.hidden].some((i) => i >= items.length)) st.hidden.clear();

  const visible = () => items.map((_, i) => i).filter((i) => !st.hidden.has(i));

  const push = () => {
    const patch = apply(visible(), chart);
    if (!patch) return;
    try {
      chart.updateOptions(patch, false, false);
    } catch {}
    onApply?.(visible(), chart);
  };

  const bar = build(host, items, st.hidden);

  bar.onclick = (e) => {
    if (e.target.closest('[data-legend-all]')) {
      if (!st.hidden.size) return;
      const was = [...st.hidden];
      st.hidden.clear();
      paint(host, st.hidden, items.length);
      if (apply) push();
      else if (rebuildsOnToggle(chart)) rebuildChart(chart);
      else for (const i of was) toggleSeries(chart, items[i]);
      return;
    }
    const btn = e.target.closest('[data-legend]');
    if (!btn) return;
    const i = Number(btn.dataset.legend);
    if (!Number.isInteger(i) || i < 0 || i >= items.length) return;
    if (!st.hidden.has(i) && st.hidden.size >= items.length - 1) return;
    if (st.hidden.has(i)) st.hidden.delete(i);
    else st.hidden.add(i);
    paint(host, st.hidden, items.length);
    if (apply) push();
    else if (rebuildsOnToggle(chart)) rebuildChart(chart);
    else toggleSeries(chart, items[i]);
  };

  if (st.hidden.size && apply) push();

  addDecorator(chart, key, (c) => {
    attachLegend(c, { items, apply, onApply, key });
    if (!apply) for (const i of st.hidden) hideSeries(c, items[i]);
  });

  return bar;
}

export function seriesItems(labels, colors) {
  const list = Array.isArray(colors) && colors.length ? colors : ['var(--accent)'];
  return labels.map((label, i) => ({ label, color: list[i % list.length] }));
}

export function distributedApply({ labels, data, colors, name, extra = null }) {
  const list = Array.isArray(colors) && colors.length ? colors : ['var(--accent)'];
  return (visible) => ({
    series: [{ name, data: visible.map((i) => data[i]) }],
    xaxis: { categories: visible.map((i) => labels[i]) },
    colors: visible.map((i) => list[i % list.length]),
    ...(extra ? extra(visible) : null),
  });
}

export function sliceApply({ labels, data, colors }) {
  const list = Array.isArray(colors) && colors.length ? colors : ['var(--accent)'];
  return (visible) => ({
    series: visible.map((i) => data[i]),
    labels: visible.map((i) => labels[i]),
    colors: visible.map((i) => list[i % list.length]),
  });
}

function recolorLegends() {
  for (const dot of document.querySelectorAll('.ch-legend-dot[data-ramp]')) {
    const [i, n] = dot.dataset.ramp.split(',').map(Number);
    if (Number.isFinite(i)) dot.style.background = rampColor(i, n);
  }
}

const bindEvents = rebinder();

export function initChartLegend() {
  wired = true;
  bindEvents([[document, EVENTS.theme, recolorLegends]]);
}
