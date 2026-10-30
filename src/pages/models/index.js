import { emptyState } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { modelsTable } from './table.js';
import { modelCards, renderModelCharts } from './charts.js';

export default {
  id: 'models',
  titleKey: 'nav.models',
  icon: 'i-models',
  usesRange: true,
  render(mount, ctx) {
    if (ctx.entries.length === 0) {
      mount.innerHTML = emptyState({ iconId: 'i-models', title: t('nav.models') });
      return;
    }
    mount.innerHTML = `<div class="grid12">${modelsTable(ctx)}${modelCards()}</div>`;
    renderModelCharts(mount, ctx);
  },
};
