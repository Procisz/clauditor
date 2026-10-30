import { fmtDuration, fmtFixed, fmtMoney } from '../../core/utils.js';
import { esc, statCard, tipDot } from '../../ui/dom.js';
import { sparkline } from '../../ui/charts.js';
import { t } from '../../i18n/index.js';
import { costSummary } from './data.js';
import { dayLabel, monthLabel } from './format.js';

const markupText = (markup) => fmtFixed(markup, Number.isInteger(markup) ? 0 : 2);

export function totalsCards({ allEntries, markup, today }) {
  const sum = costSummary(allEntries, today, markup);
  const cards = [
    {
      key: 'baseCost', color: 'var(--c-prev)', iconId: 'i-database',
      value: fmtMoney(sum.all.base), sub: t('costs.card.baseCostFoot'), tip: t('costs.card.estimateTip'),
    },
    {
      key: 'finalCost', color: 'var(--c-cost)', iconId: 'i-costs',
      value: fmtMoney(sum.all.final), sub: t('costs.card.finalCostFoot', { markup: markupText(markup) }),
      tip: t('costs.card.estimateTip'), spark: sum.sparks.all, time: sum.sessionTime.all,
    },
    {
      key: 'month', color: 'var(--warn)', iconId: 'i-calendar',
      value: fmtMoney(sum.month.final), sub: monthLabel(today.slice(0, 7)), spark: sum.sparks.month, time: sum.sessionTime.month,
    },
    {
      key: 'week', color: 'var(--c-output)', iconId: 'i-trend-up',
      value: fmtMoney(sum.week.final), sub: t('costs.card.weekFoot'), spark: sum.sparks.week, time: sum.sessionTime.week,
    },
    {
      key: 'today', color: 'var(--accent)', iconId: 'i-today',
      value: fmtMoney(sum.today.final), sub: dayLabel(today), spark: sum.sparks.today, time: sum.sessionTime.today,
    },
    {
      key: 'maxDay', color: 'var(--neg)', iconId: 'i-gauge',
      value: sum.maxDay ? fmtMoney(sum.maxDay.final) : '-', sub: sum.maxDay ? dayLabel(sum.maxDay.date) : '-',
    },
  ];
  return cards.map((card) => {
    const time = card.time === undefined
      ? ''
      : `<span>${esc(t('costs.card.sessionTime', { value: fmtDuration(card.time) }))}${tipDot(t('costs.card.sessionTimeTip'))}</span>`;
    return statCard({
      color: card.color,
      iconId: card.iconId,
      label: t(`costs.card.${card.key}`),
      tip: card.tip ?? '',
      value: esc(card.value),
      foot: `<span>${esc(card.sub)}</span>${time}`,
      spark: card.spark ? sparkline(card.spark) : '',
    });
  }).join('');
}
