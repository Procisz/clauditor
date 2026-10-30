import { state } from '../../core/state.js';
import { hourly } from '../../core/metrics.js';
import { shiftDay } from '../../core/dates.js';
import { entryCost } from '../../core/config.js';
import { chartCard, emptyState, esc } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { getLocale, t } from '../../i18n/index.js';
import { cardsHtml } from './cards.js';
import { averageDayByHour, cumulativePoints, dayFigures, dayFraction, durationsOf, splitDays } from './data.js';
import { renderCache, renderCalls, renderCumulative, renderHourly, renderModelDonut, renderResponse, renderTimeline, renderTokenDonut } from './charts.js';
import { projectsTable, sessionsTable } from './tables.js';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function selectedDay(today) {
  if (!DAY_PATTERN.test(state.selectedDate ?? '') || state.selectedDate > today) state.selectedDate = today;
  return state.selectedDate;
}

function dayText(key) {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));
}

function headHtml(day, today, previousDay) {
  const isToday = day === today;
  return `<div class="page-head">
    <div class="day-nav">
      <button type="button" class="icon-btn" id="td-prev" aria-label="${esc(t('today.prevDay'))}" title="${esc(t('today.prevDay'))}">${icon('i-chevron-left')}</button>
      <input type="date" class="input" id="td-picker" value="${esc(day)}" max="${esc(today)}" aria-label="${esc(t('today.pickDay'))}">
      <button type="button" class="icon-btn" id="td-next" aria-label="${esc(t('today.nextDay'))}" title="${esc(t('today.nextDay'))}"${isToday ? ' disabled' : ''}>${icon('i-chevron-right')}</button>
      <button type="button" class="btn btn-primary" id="td-jump"${isToday ? ' disabled' : ''}>${esc(t('today.jumpToday'))}</button>
    </div>
    <h2 class="page-title grow">${esc(isToday ? `${t('today.dayToday')} · ${dayText(day)}` : dayText(day))}</h2>
    <span class="muted small">${esc(t('today.comparedWith', { date: dayText(previousDay) }))}</span>
  </div>`;
}

function bodyHtml() {
  return `<div class="grid12">
    ${chartCard({ span: 6, color: 'var(--c-cost)', iconId: 'i-costs', title: t('today.hourly.title'), sub: esc(t('today.hourly.sub')), id: 'td-hourly' })}
    ${chartCard({ span: 6, color: 'var(--c-cost)', iconId: 'i-trend-up', title: t('today.cumulative.title'), sub: esc(t('today.cumulative.sub')), id: 'td-cumulative' })}
    ${chartCard({ span: 6, color: 'var(--accent)', iconId: 'i-models', title: t('today.model.title'), sub: esc(t('today.model.sub')), id: 'td-model' })}
    ${chartCard({ span: 6, color: 'var(--c-input)', iconId: 'i-database', title: t('today.tokens.title'), sub: esc(t('today.tokens.sub')), id: 'td-tokens' })}
    ${chartCard({ span: 6, color: 'var(--c-output)', iconId: 'i-refresh', title: t('today.response.title'), sub: esc(t('today.response.sub')), id: 'td-response' })}
    ${chartCard({ span: 6, color: 'var(--c-cache-read)', iconId: 'i-gauge', title: t('today.cache.title'), sub: esc(t('today.cache.sub')), id: 'td-cache' })}
    ${chartCard({ span: 12, color: 'var(--accent)', iconId: 'i-sessions', title: t('today.timeline.title'), sub: esc(t('today.timeline.sub')), id: 'td-timeline' })}
    ${chartCard({ span: 12, color: 'var(--c-cost)', iconId: 'i-trend-up', title: t('today.calls.title'), sub: esc(t('today.calls.sub')), id: 'td-calls' })}
  </div>`;
}

function wire(root, ctx, day) {
  const go = (key, focusId) => {
    state.selectedDate = key;
    ctx.rerender();
    const target = document.getElementById(focusId);
    (target && !target.disabled ? target : document.getElementById('td-picker'))?.focus();
  };
  root.querySelector('#td-prev').onclick = () => go(shiftDay(day, -1), 'td-prev');
  root.querySelector('#td-next').onclick = () => {
    if (day < ctx.today) go(shiftDay(day, 1), 'td-next');
  };
  root.querySelector('#td-jump').onclick = () => go(ctx.today, 'td-picker');
  root.querySelector('#td-picker').onchange = (e) => {
    const value = e.target.value;
    if (DAY_PATTERN.test(value) && value <= ctx.today) go(value, 'td-picker');
  };
  root.addEventListener('click', (e) => {
    const button = e.target.closest('[data-open-session]');
    if (!button) return;
    e.stopPropagation();
    ctx.openSession(button.dataset.openSession);
  }, true);
  root.addEventListener('keydown', (e) => {
    if (e.target.closest('[data-open-session]')) e.stopPropagation();
  }, true);
}

export default {
  id: 'today',
  titleKey: 'nav.today',
  icon: 'i-today',
  usesRange: false,
  render(mount, ctx) {
    const { markup } = ctx;
    const day = selectedDay(ctx.today);
    const isToday = day === ctx.today;
    const days = splitDays(ctx.allEntries, day);
    const entries = days.current;
    const durations = durationsOf(ctx.durations, day);
    const previousDurations = durationsOf(ctx.durations, days.previousDay);
    const figures = dayFigures(entries, durations, markup);
    const previousFigures = dayFigures(days.previous, previousDurations, markup);
    const costOf = (e) => entryCost(e) * markup;

    const root = document.createElement('div');
    root.innerHTML = headHtml(day, ctx.today, days.previousDay)
      + (entries.length === 0 ? `<div class="page-note">${emptyState({ iconId: 'i-calendar', message: t('today.noActivity') })}</div>` : '')
      + `<div class="kpi-row">${cardsHtml(figures, previousFigures)}</div>`
      + bodyHtml()
      + `<div class="grid12">${sessionsTable(entries, markup)}${projectsTable(entries, markup)}</div>`;
    mount.replaceChildren(root);
    wire(root, ctx, day);

    const endX = isToday ? dayFraction(new Date().toISOString()) : 24;
    renderHourly(root, {
      hourlyCost: hourly(entries, markup),
      averageDay: days.windowDays > 0 ? averageDayByHour(days.window, days.windowDays, markup) : null,
    });
    renderCumulative(root, {
      currentPoints: cumulativePoints(entries, costOf, endX),
      previousPoints: cumulativePoints(days.previous, costOf, 24),
    });
    renderModelDonut(root, entries, markup);
    renderTokenDonut(root, figures.totals);
    renderResponse(root, durations);
    renderCache(root, entries);
    renderTimeline(root, entries, markup, ctx.openSession);
    renderCalls(root, entries, markup, ctx.openSession);
  },
};
