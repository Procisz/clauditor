import { groupTotals, hourWeekdayMatrix } from '../../core/metrics.js';
import { shiftDay } from '../../core/dates.js';
import { fmtMoney } from '../../core/utils.js';
import { t } from '../../i18n/index.js';
import { esc } from '../../ui/dom.js';
import { dayLabel, shortMonthLabel, weekdayIndex, weekdayLabels } from './format.js';

const LEVELS = 4;
const SWATCH_LEVELS = [0, 1, 2, 3, 4];

const levelOf = (value, max) => (value > 0 && max > 0 ? Math.min(LEVELS, Math.ceil((value / max) * LEVELS)) : 0);

function heatLegend() {
  const swatches = SWATCH_LEVELS.map((level) => `<span class="heat-swatch" data-level="${level}"></span>`).join('');
  return `<div class="faint small heat-legend">
    <span>${esc(t('overview.less'))}</span>${swatches}<span>${esc(t('overview.more'))}</span>
  </div>`;
}

function heatGrid({ label, rowLabels, colLabels, cells, columns, variant, minWidth }) {
  const head = colLabels
    .map((text) => `<span class="faint heat-label">${esc(text)}</span>`)
    .join('');
  const rows = rowLabels.map((rowLabel, r) => {
    const row = cells[r].map((cell) => {
      if (!cell) return '<span class="heat-cell heat-cell-empty"></span>';
      return `<span class="heat-cell" data-level="${cell.level}" data-tip="${esc(cell.tip)}"></span>`;
    }).join('');
    return `<span class="faint heat-label heat-row-label">${esc(rowLabel)}</span>${row}`;
  }).join('');
  return `<div class="heat-scroll heat-${variant}">
    <div class="heat-grid" role="img" aria-label="${esc(label)}" style="--cols:${columns};--min-width:${minWidth}px">
      <span></span>${head}${rows}
    </div>
    ${heatLegend()}
  </div>`;
}

export function renderHourWeekday(host, { entries, markup }) {
  const matrix = hourWeekdayMatrix(entries, markup);
  const days = weekdayLabels();
  let max = 0;
  let peak = null;
  matrix.forEach((row, d) => row.forEach((value, h) => {
    if (value > max) {
      max = value;
      peak = { d, h, value };
    }
  }));
  const hourText = (h) => `${String(h).padStart(2, '0')}:00`;
  const colLabels = Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h).padStart(2, '0') : ''));
  const cells = matrix.map((row, d) => row.map((value, h) => ({
    level: levelOf(value, max),
    tip: `${days[d]} ${hourText(h)}: ${value > 0 ? fmtMoney(value) : t('overview.noActivity')}`,
  })));
  const label = peak
    ? t('overview.hourWeekdayLabel', { peak: `${days[peak.d]} ${hourText(peak.h)} (${fmtMoney(peak.value)})` })
    : t('overview.hourWeekdayEmpty');
  host.innerHTML = heatGrid({
    label,
    rowLabels: days,
    colLabels,
    cells,
    columns: 24,
    variant: 'hours',
    minWidth: 440,
  });
}

export function renderCalendar(host, { allEntries, markup, today }) {
  const dayCosts = new Map(groupTotals(allEntries, (e) => e.date, markup).map((g) => [g.key, g.final]));
  let max = 0;
  let busiest = '';
  for (const [day, cost] of dayCosts) {
    if (day && cost > max) {
      max = cost;
      busiest = day;
    }
  }
  const weeks = 53;
  const start = shiftDay(today, -weekdayIndex(today) - 52 * 7);
  const mondays = Array.from({ length: weeks }, (_, w) => shiftDay(start, w * 7));

  let lastLabelAt = -4;
  const colLabels = mondays.map((monday, w) => {
    if (Number(monday.slice(8, 10)) > 7 || w - lastLabelAt < 3) return '';
    lastLabelAt = w;
    return shortMonthLabel(monday);
  });

  const cells = Array.from({ length: 7 }, (_, d) => mondays.map((monday) => {
    const day = shiftDay(monday, d);
    if (day > today) return null;
    const cost = dayCosts.get(day) || 0;
    return {
      level: levelOf(cost, max),
      tip: `${dayLabel(day)}: ${cost > 0 ? fmtMoney(cost) : t('overview.noActivity')}`,
    };
  }));

  const names = weekdayLabels();
  const label = max > 0
    ? t('overview.calendarLabel', { peak: `${dayLabel(busiest)} (${fmtMoney(max)})` })
    : t('overview.calendarEmpty');
  host.innerHTML = heatGrid({
    label,
    rowLabels: names.map((name, d) => (d % 2 === 0 ? name : '')),
    colLabels,
    cells,
    columns: weeks,
    variant: 'days',
    minWidth: 760,
  });
}
