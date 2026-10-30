import { chartCard, emptyState, esc } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { renderBudget } from './budget.js';
import { totalsCards } from './cards.js';
import { renderCache, renderForecast, renderTokenCost, renderWeekday } from './charts.js';
import { monthlyTable } from './tables.js';
import { renderTokenUsage } from './tokens.js';
import { monthLabel } from './format.js';

function cardsHtml({ today }) {
  const card = (id, span, color, iconId, key, sub) => chartCard({
    span, color, iconId, id,
    title: t(`costs.${key}.title`),
    sub: esc(sub ?? t(`costs.${key}.sub`)),
    tip: t(`costs.${key}.tip`),
  });
  return [
    card('cs-budget', 4, 'var(--accent)', 'i-wallet', 'budget', t('costs.budget.sub', { month: monthLabel(today.slice(0, 7)) })),
    card('cs-forecast', 8, 'var(--warn)', 'i-trend-up', 'forecast', t('costs.forecast.sub', { month: monthLabel(today.slice(0, 7)) })),
    card('cs-token-cost', 6, 'var(--c-input)', 'i-database', 'tokenCost'),
    card('cs-cache', 6, 'var(--c-cache-read)', 'i-archive', 'cache'),
    card('cs-weekday', 5, 'var(--c-cost)', 'i-calendar', 'weekday'),
  ].join('');
}

export default {
  id: 'costs',
  titleKey: 'nav.costs',
  icon: 'i-costs',
  usesRange: true,
  render(mount, ctx) {
    if (ctx.allEntries.length === 0) {
      mount.innerHTML = emptyState({ iconId: 'i-costs', title: t('nav.costs') });
      return;
    }
    const { entries, allEntries, range, markup } = ctx;
    mount.innerHTML = `<div class="kpi-row">${totalsCards(ctx)}</div>
      <div class="grid12">
        ${cardsHtml(ctx)}
        ${monthlyTable(ctx)}
        ${chartCard({ span: 12, color: 'var(--c-output)', iconId: 'i-database', id: 'cs-tokens', title: t('costs.tokens.title'), sub: esc(t('costs.tokens.sub')), tip: t('costs.tokens.tip') })}
      </div>`;
    const host = (id) => mount.querySelector(`#${id}`);
    renderBudget(host('cs-budget'), ctx);
    renderForecast(host('cs-forecast'), ctx);
    renderTokenCost(host('cs-token-cost'), entries, range, markup);
    renderCache(host('cs-cache'), entries, range, markup);
    renderWeekday(host('cs-weekday'), entries, range, markup);
    renderTokenUsage(host('cs-tokens'), allEntries, markup);
  },
};
