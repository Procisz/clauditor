import { initDismissableNote } from '../../core/utils.js';
import { t } from '../../i18n/index.js';
import { chartCard, esc } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { budgetStrip, wireBudget } from './budget.js';
import { renderCalendar, renderHourWeekday } from './heat.js';
import { kpiCards } from './kpis.js';
import { renderCostTrend, renderModelMix, renderTokenTrend, renderTopProjects } from './trends.js';

const NOTE_KEY = 'note:cost-estimates';

const noteHtml = () => `<div id="estimate-note" class="banner" data-tone="warn">
  ${icon('i-warn')}
  <span class="banner-text">${esc(t('overview.estimateNote'))}</span>
  <div class="banner-actions">
    <button type="button" class="note-close" aria-label="${esc(t('overview.dismissNote'))}" title="${esc(t('overview.dismissNoteTip'))}">${icon('i-x')}</button>
  </div>
</div>`;

const CARDS = [
  { id: 'ov-cost-trend', span: 6, key: 'costTrend', color: 'var(--c-cost)', iconId: 'i-costs', render: renderCostTrend },
  { id: 'ov-token-trend', span: 6, key: 'tokenTrend', color: 'var(--c-input)', iconId: 'i-database', render: renderTokenTrend },
  { id: 'ov-model-mix', span: 7, key: 'modelMix', color: 'var(--m-opus)', iconId: 'i-models', render: renderModelMix },
  { id: 'ov-top-projects', span: 5, key: 'topProjects', color: 'var(--accent)', iconId: 'i-projects', render: renderTopProjects },
  { id: 'ov-hour-weekday', span: 12, key: 'hourWeekday', color: 'var(--c-output)', iconId: 'i-today', render: renderHourWeekday },
  { id: 'ov-calendar', span: 12, key: 'calendar', color: 'var(--c-cache-read)', iconId: 'i-calendar', render: renderCalendar },
];

export default {
  id: 'overview',
  titleKey: 'nav.overview',
  icon: 'i-overview',
  usesRange: true,
  render(mount, ctx) {
    const cards = CARDS.map((card) => chartCard({
      span: card.span,
      color: card.color,
      iconId: card.iconId,
      id: card.id,
      title: t(`overview.${card.key}`),
      sub: esc(t(`overview.${card.key}Sub`)),
    })).join('');
    mount.innerHTML = `${noteHtml()}
      <div class="kpi-row">${kpiCards(ctx)}</div>
      <div class="grid12">
        <div data-span="12">${budgetStrip(ctx)}</div>
        ${cards}
      </div>`;
    initDismissableNote('estimate-note', NOTE_KEY);
    wireBudget(mount);
    for (const card of CARDS) card.render(mount.querySelector(`#${card.id}`), ctx);
  },
};
