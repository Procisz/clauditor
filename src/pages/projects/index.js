import { emptyState } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { projectStats } from './data.js';
import { projectsTable } from './table.js';
import { projectCards, renderProjectCharts } from './charts.js';

export default {
  id: 'projects',
  titleKey: 'nav.projects',
  icon: 'i-projects',
  usesRange: true,
  render(mount, ctx) {
    if (ctx.entries.length === 0) {
      mount.innerHTML = emptyState({ iconId: 'i-projects', title: t('nav.projects') });
      return;
    }
    const stats = projectStats(ctx.entries, ctx.markup);
    mount.innerHTML = `<div class="grid12">${projectsTable(ctx, stats)}${projectCards()}</div>`;
    renderProjectCharts(mount, ctx, stats);
  },
};
