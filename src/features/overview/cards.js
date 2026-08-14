// ─────────────────────────────────────────────
// OVERVIEW — summary cards (with sparklines) and burn rate gauge
// ─────────────────────────────────────────────
import { ApexCharts, getApexBaseOpts, CHART_COLORS } from '../../core/charts.js';
import { state } from '../../core/state.js';
import { dayKey, todayKey, shiftDay, getMonthKey } from '../../core/dates.js';
import { calcCost } from '../../core/config.js';
import { domEl, domText, domClear, fmtDuration, makeInfoIcon, calcSessionTime } from '../../core/utils.js';

const STAT_COLOR  = { accent: 'text-accent', yellow: 'text-warning', orange: 'text-primary', green: 'text-success' };
const SPARK_COLOR = { accent: CHART_COLORS[0], yellow: CHART_COLORS[2], green: CHART_COLORS[1], '': CHART_COLORS[0] };

let sparklineCharts = [];
let burnChart       = null;

export function resizeSparklines() {
  for (const { chart, el } of sparklineCharts) {
    const w = el?.offsetWidth;
    if (w) chart.updateOptions({ chart: { width: w } }, false, false);
  }
  // burnChart lives in a fixed 150px container — no resize needed
}

function buildDayCosts() {
  const map = new Map();
  for (const e of state.allEntries) {
    const cost = calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model) * state.markup;
    map.set(e.date, (map.get(e.date) || 0) + cost);
  }
  return map;
}

function sparkLast14(dayCosts) {
  const today = todayKey();
  return Array.from({ length: 14 }, (_, i) =>
    +(dayCosts.get(shiftDay(today, -(13 - i))) || 0).toFixed(4));
}

function sparkThisMonth(dayCosts, thisMonth) {
  const dayOfMonth = new Date().getDate();
  return Array.from({ length: dayOfMonth }, (_, i) => {
    const dateStr = thisMonth + '-' + String(i + 1).padStart(2, '0');
    return +(dayCosts.get(dateStr) || 0).toFixed(4);
  });
}

function sparkLast7(dayCosts) {
  const today = todayKey();
  return Array.from({ length: 7 }, (_, i) =>
    +(dayCosts.get(shiftDay(today, -(6 - i))) || 0).toFixed(4));
}

function sparkToday(todayStr) {
  const hourCosts = new Array(24).fill(0);
  for (const e of state.allEntries) {
    if (e.date !== todayStr || !e.ts) continue;
    const h = new Date(e.ts).getHours();
    if (h < 0 || h > 23 || !Number.isFinite(h)) continue;
    hourCosts[h] += calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model) * state.markup;
  }
  return hourCosts.map(v => +v.toFixed(6));
}

export function renderCards(entries) {
  for (const { chart } of sparklineCharts) chart.destroy();
  sparklineCharts = [];

  const today     = todayKey();
  const weekStr   = shiftDay(today, -6);
  const thisMonth = getMonthKey(today);

  let totalBase = 0, totalFinal = 0, monthBase = 0, weekBase = 0, todayBase = 0;
  const baseDayCosts = new Map();
  const allEntries = state.allEntries;
  for (const e of allEntries) {
    const base = calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model);
    totalBase += base; totalFinal += base * state.markup;
    if (e.date.startsWith(thisMonth)) monthBase += base;
    if (e.date >= weekStr)            weekBase  += base;
    if (e.date === today)             todayBase += base;
    baseDayCosts.set(e.date, (baseDayCosts.get(e.date) || 0) + base);
  }

  let maxDay = '', maxCost = 0;
  for (const [d, c] of baseDayCosts) { if (c > maxCost) { maxCost = c; maxDay = d; } }

  const fmt      = v => '$' + v.toFixed(2);
  const dayCosts = buildDayCosts();

  const SESSION_TIME_TOOLTIP = 'Sum of each session\'s span: last message timestamp minus first message timestamp. Includes time you spent reading and thinking, not just Claude\'s processing time.';

  const allTimeSessionMs  = calcSessionTime(allEntries);
  const monthSessionMs    = calcSessionTime(allEntries.filter(e => e.date.startsWith(thisMonth)));
  const weekSessionMs     = calcSessionTime(allEntries.filter(e => e.date >= weekStr));
  const todaySessionMs    = calcSessionTime(allEntries.filter(e => e.date === today));

  const EST_TOOLTIP = 'Estimated from public Anthropic pricing — actual charges may differ.';

  const cards = [
    { label: 'All-time Base Cost',  value: fmt(totalBase),                cls: '',       sub: 'Anthropic pricing',       spark: null,                                              tooltip: EST_TOOLTIP },
    { label: 'All-time Final Cost', value: fmt(totalFinal),               cls: 'accent', sub: `×${state.markup} markup`, spark: sparkLast14(dayCosts), sessionMs: allTimeSessionMs, tooltip: EST_TOOLTIP },
    { label: 'This Month',          value: fmt(monthBase * state.markup), cls: 'yellow', sub: today.slice(0, 7),          spark: sparkThisMonth(dayCosts, today.slice(0, 7)), sessionMs: monthSessionMs },
    { label: 'This Week',           value: fmt(weekBase * state.markup),  cls: '',       sub: 'last 7 days',              spark: sparkLast7(dayCosts), sessionMs: weekSessionMs },
    { label: 'Today',               value: fmt(todayBase * state.markup), cls: 'green',  sub: today,                      spark: sparkToday(today), sessionMs: todaySessionMs },
    { label: 'Most Expensive Day',  value: maxDay ? fmt(maxCost * state.markup) : '—', cls: '', sub: maxDay || 'n/a', spark: null },
  ];

  const container = document.getElementById('cards');
  domClear(container);

  for (const c of cards) {
    const card = domEl('div', 'card bg-base-100 card-border border-base-300 overflow-hidden');
    const body = domEl('div', 'card-body p-4 gap-1');
    const labelRow = domEl('div', 'flex items-center gap-1');
    labelRow.appendChild(domText('p', 'text-xs font-medium opacity-50 uppercase tracking-wider', c.label));
    if (c.tooltip) labelRow.appendChild(makeInfoIcon(c.tooltip));
    body.appendChild(labelRow);
    body.appendChild(domText('div', 'text-2xl font-bold tabular-nums' + (STAT_COLOR[c.cls] ? ' ' + STAT_COLOR[c.cls] : ''), c.value));
    body.appendChild(domText('p', 'text-xs opacity-40 mt-0.5', c.sub));
    if (c.sessionMs !== undefined) {
      const timeRow = domEl('div', 'flex items-center gap-1 mt-2 pt-2 border-t border-base-300');
      timeRow.appendChild(domText('span', 'text-xs opacity-40', fmtDuration(c.sessionMs)));
      timeRow.appendChild(makeInfoIcon(SESSION_TIME_TOOLTIP));
      body.appendChild(timeRow);
    }
    card.appendChild(body);
    container.appendChild(card);

    if (c.spark) { // c.spark is now a data array
      const sparkEl = domEl('div');
      sparkEl.style.cssText = 'margin: -8px -1px 0; line-height: 0;';
      card.appendChild(sparkEl);

      const color = SPARK_COLOR[c.cls] || CHART_COLORS[0];
      const sc = new ApexCharts(sparkEl, {
        chart:  { type: 'area', height: 44, sparkline: { enabled: true }, animations: { enabled: false }, redrawOnWindowResize: false, redrawOnParentResize: false },
        series: [{ data: c.spark }],
        colors: [color],
        stroke: { width: 1.5, curve: 'smooth' },
        fill:   { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0, stops: [0, 100] } },
        tooltip: { enabled: false },
      });
      sc.render();
      sparklineCharts.push({ chart: sc, el: sparkEl });
    }
  }
}

export function renderBurnRate() {
  const budget = parseFloat(document.getElementById('budget-input').value);
  if (!isNaN(budget)) localStorage.setItem('clauditor_budget', budget);
  const el = document.getElementById('burn-content');

  if (burnChart) { burnChart.destroy(); burnChart = null; }

  if (!budget || budget <= 0 || !isFinite(budget)) {
    domClear(el);
    el.appendChild(domText('p', 'text-sm opacity-50', 'Set a monthly budget above to track your burn rate.'));
    return;
  }

  const today       = new Date();
  const thisMonth   = getMonthKey(todayKey());
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth  = today.getDate();

  let spent = 0;
  for (const e of state.allEntries) {
    if (!e.date.startsWith(thisMonth)) continue;
    spent += calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model) * state.markup;
  }

  const dailyAvg   = spent / dayOfMonth;
  const projected  = dailyAvg * daysInMonth;
  const spentPct   = Math.min(+(spent / budget * 100).toFixed(1), 100);
  const projPct    = Math.min(+(projected / budget * 100).toFixed(1), 100);
  const light      = document.documentElement.dataset.theme === 'winter';
  const resolveColor = cls => {
    const el = document.createElement('div');
    el.className = cls;
    el.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(el);
    const color = getComputedStyle(el).color;
    document.body.removeChild(el);
    return color || '#34d399';
  };
  const colorPrimary = resolveColor('text-primary');
  const colorWarning = resolveColor('text-warning');
  const colorError   = resolveColor('text-error');
  const spentColor = spentPct >= 90 ? colorError : spentPct >= 70 ? colorWarning : colorPrimary;
  const projColor  = projected > budget ? colorError : colorWarning;

  domClear(el);

  const wrap    = domEl('div', 'flex items-center gap-6 flex-wrap');
  const gaugeEl = domEl('div');
  gaugeEl.style.cssText = 'width:150px; flex-shrink:0;';

  const stats = domEl('div', 'flex flex-col gap-2 text-sm flex-1 min-w-[140px]');
  const addRow = (label, val, color) => {
    const d = domEl('div', 'flex justify-between items-center gap-4');
    const l = domText('span', 'opacity-60', label);
    const v = domText('span', 'font-semibold tabular-nums', val);
    if (color) v.style.color = color;
    d.appendChild(l); d.appendChild(v);
    stats.appendChild(d);
  };
  addRow('Spent',     '$' + spent.toFixed(2),     spentColor);
  addRow('Budget',    '$' + budget.toFixed(2));
  addRow('Projected', '$' + projected.toFixed(2), projColor);
  addRow('Day',       dayOfMonth + ' of ' + daysInMonth);

  wrap.appendChild(gaugeEl);
  wrap.appendChild(stats);
  el.appendChild(wrap);

  const base = getApexBaseOpts();
  burnChart = new ApexCharts(gaugeEl, {
    chart: { ...base.chart, type: 'radialBar', height: 150, animations: { enabled: false } },
    theme:  base.theme,
    series: [spentPct, projPct],
    labels: ['Spent', 'Projected'],
    colors: [spentColor, projColor],
    plotOptions: {
      radialBar: {
        startAngle: -130,
        endAngle:    130,
        hollow:      { size: '42%' },
        track:       { background: light ? '#dde3f0' : '#44475a', margin: 3 },
        dataLabels: {
          name:  { fontSize: '10px', color: base.chart.foreColor, offsetY: -6 },
          value: { fontSize: '14px', fontWeight: 700, color: base.chart.foreColor, formatter: v => v + '%', offsetY: 2 },
          total: {
            show: true, label: 'Used',
            fontSize: '10px', color: base.chart.foreColor,
            formatter: () => spentPct + '%',
          },
        },
      },
    },
    legend: { show: false },
  });
  burnChart.render();
}
