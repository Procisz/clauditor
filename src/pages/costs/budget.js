import { monthForecast } from '../../core/metrics.js';
import { fmtFixed, fmtMoney } from '../../core/utils.js';
import { openSettings } from '../../app/settings.js';
import { cssToken, makeChart, setThemeOptions } from '../../ui/charts.js';
import { esc } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';

const GAUGE_HEIGHT = 200;

const item = (label, value, negative = false) => `<div class="kv">
  <span class="k">${esc(label)}</span>
  <span class="v${negative ? ' neg' : ''}">${esc(value)}</span>
</div>`;

function gaugeTheme() {
  const text = cssToken('--text');
  return {
    plotOptions: {
      radialBar: {
        track: { background: cssToken('--surface-2') },
        dataLabels: { name: { color: text }, value: { color: text }, total: { color: text } },
      },
    },
  };
}

function gaugeOptions({ spentPct, projectedPct, usedPct, over }) {
  const text = cssToken('--text');
  const spentToken = spentPct >= 90 ? '--neg' : spentPct >= 70 ? '--warn' : '--accent';
  return {
    chart: { type: 'radialBar', height: GAUGE_HEIGHT, animations: { enabled: false } },
    series: [Math.min(spentPct, 100), Math.min(projectedPct, 100)],
    labels: [t('costs.budget.spent'), t('costs.budget.projected')],
    colors: [cssToken(spentToken), cssToken(over ? '--neg' : '--warn')],
    plotOptions: {
      radialBar: {
        startAngle: -130,
        endAngle: 130,
        hollow: { size: '42%' },
        track: { background: cssToken('--surface-2'), margin: 3 },
        dataLabels: {
          name: { fontSize: '11px', color: text, offsetY: -6 },
          value: { fontSize: '15px', fontWeight: 700, color: text, offsetY: 2, formatter: (v) => `${fmtFixed(v, 0)}%` },
          total: {
            show: true,
            label: t('costs.budget.used'),
            fontSize: '11px',
            color: text,
            formatter: () => `${fmtFixed(usedPct, 0)}%`,
          },
        },
      },
    },
    legend: { show: false },
    tooltip: { enabled: false },
  };
}

export function renderBudget(host, { allEntries, markup, today, budget }) {
  const forecast = monthForecast(allEntries, today, markup);
  const day = t('costs.budget.dayOf', { day: forecast.dayOfMonth, days: forecast.daysInMonth });

  if (!(budget > 0)) {
    host.innerHTML = `<div class="kv-grid">
        ${item(t('costs.budget.spent'), fmtMoney(forecast.spent))}
        ${item(t('costs.budget.projected'), fmtMoney(forecast.projected))}
        ${item(t('costs.budget.day'), day)}
      </div>
      <p class="muted">${esc(t('costs.budget.hint'))}</p>
      <button type="button" class="btn" data-open-settings>${icon('i-settings')} ${esc(t('shell.settings'))}</button>`;
    host.querySelector('[data-open-settings]').addEventListener('click', openSettings);
    return;
  }

  const spentPct = (forecast.spent / budget) * 100;
  const projectedPct = (forecast.projected / budget) * 100;
  const over = forecast.projected > budget;
  host.innerHTML = `<div class="budget-gauge"></div>
    <div class="kv-grid">
      ${item(t('costs.budget.spent'), fmtMoney(forecast.spent), forecast.spent > budget)}
      ${item(t('costs.budget.budget'), fmtMoney(budget))}
      ${item(t('costs.budget.projected'), fmtMoney(forecast.projected), over)}
      ${item(t('costs.budget.day'), day)}
    </div>`;
  const gauge = makeChart(host.querySelector('.budget-gauge'), gaugeOptions({ spentPct, projectedPct, usedPct: spentPct, over }));
  setThemeOptions(gauge, gaugeTheme);
}
