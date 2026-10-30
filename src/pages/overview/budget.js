import { monthForecast } from '../../core/metrics.js';
import { fmtFixed, fmtMoney } from '../../core/utils.js';
import { t } from '../../i18n/index.js';
import { openSettings } from '../../app/settings.js';
import { esc } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { monthLabel } from './format.js';

const item = (label, value, negative = false) => `<div class="strip-item">
  <span class="strip-label">${esc(label)}</span>
  <span class="strip-value${negative ? ' neg' : ''}">${esc(value)}</span>
</div>`;

export function budgetStrip({ allEntries, markup, today, budget }) {
  const forecast = monthForecast(allEntries, today, markup);
  const head = `<div class="strip-item">
    <span class="strip-label">${icon('i-wallet')} ${esc(t('overview.budget.title'))}</span>
    <span class="strip-value">${esc(monthLabel(forecast.month))}</span>
  </div>`;
  const spent = item(t('overview.budget.spent'), fmtMoney(forecast.spent));

  if (!(budget > 0)) {
    return `<div class="strip" id="ov-budget">
      ${head}${spent}
      ${item(t('overview.budget.projected'), fmtMoney(forecast.projected))}
      <div class="strip-item strip-grow"><span class="muted small">${esc(t('overview.budget.hint'))}</span></div>
      <button type="button" class="btn" data-open-settings>${icon('i-settings')} ${esc(t('shell.settings'))}</button>
    </div>`;
  }

  const used = Math.min(100, (forecast.spent / budget) * 100);
  const over = forecast.projected > budget;
  const usedText = t('overview.budget.used', { percent: `${fmtFixed((forecast.spent / budget) * 100, 0)}%` });
  return `<div class="strip" id="ov-budget">
    ${head}${spent}
    ${item(t('overview.budget.budget'), fmtMoney(budget))}
    ${item(t('overview.budget.projected'), fmtMoney(forecast.projected), over)}
    <div class="strip-item strip-grow">
      <div class="pbar${over ? ' pbar-over' : ''}" role="progressbar" aria-label="${esc(usedText)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(used)}">
        <span style="width:${used.toFixed(1)}%"></span>
      </div>
      <span class="faint small">${esc(usedText)} · ${esc(t('overview.budget.dayOf', { day: forecast.dayOfMonth, days: forecast.daysInMonth }))}</span>
    </div>
  </div>`;
}

export function wireBudget(root) {
  root.querySelector('[data-open-settings]')?.addEventListener('click', openSettings);
}
