import { averageByPeriod, bucketKeyOf, bucketize, pctChange, totals } from '../../core/metrics.js';
import { fmtMoney, fmtNum } from '../../core/utils.js';
import { t } from '../../i18n/index.js';
import { chartCard, deltaChip, esc, tipDot } from '../../ui/dom.js';
import { cssToken, destroyChartsIn, makeChart, moneyAxis, moneyTooltip } from '../../ui/charts.js';
import { bucketLabel } from './format.js';

export const AVERAGE_TYPES = Object.freeze(['session', 'quarter', 'month', 'week', 'day']);
export const AVERAGE_KEY = 'clauditor_average_type';
const DEFAULT_TYPE = 'month';
const VIEW_OF = { quarter: 'quarterly', month: 'monthly', week: 'weekly', day: 'daily' };

export function readAverageType() {
  try {
    const stored = localStorage.getItem(AVERAGE_KEY);
    return AVERAGE_TYPES.includes(stored) ? stored : DEFAULT_TYPE;
  } catch {
    return DEFAULT_TYPE;
  }
}

export function saveAverageType(id) {
  try {
    localStorage.setItem(AVERAGE_KEY, id);
  } catch {}
}

const perSession = (value, sessions) => (sessions > 0 ? value / sessions : 0);

function sessionModel(ctx) {
  const { entries, range, previous, markup } = ctx;
  const { keys, byKey } = bucketize(entries, { from: range.from, to: range.to, view: range.view, markup });
  const current = totals(entries, markup);
  const before = previous.from ? totals(previous.entries, markup) : null;
  return {
    cost: perSession(current.final, current.sessions),
    tokens: perSession(current.tokens, current.sessions),
    prior: before ? perSession(before.final, before.sessions) : null,
    series: keys.map((key) => {
      const bucket = byKey.get(key);
      return perSession(bucket.final, bucket.sessions);
    }),
    keys,
    view: range.view,
    quarters: [],
  };
}

const quarterNumbersWithData = (entries) => new Set(
  entries.filter((e) => e.date).map((e) => Number(bucketKeyOf(e.date, 'quarterly').at(-1))),
);

function periodModel(ctx, id) {
  const { entries, range, previous, markup } = ctx;
  const view = VIEW_OF[id];
  const all = averageByPeriod(entries, { from: range.from, to: range.to, markup });
  const current = all[id];
  const before = previous.from
    ? averageByPeriod(previous.entries, { from: previous.from, to: previous.to, markup })[id]
    : null;
  const { keys } = bucketize(entries, { from: range.from, to: range.to, view, markup });
  const withData = quarterNumbersWithData(entries);
  return {
    cost: current.cost,
    tokens: current.tokens,
    prior: before ? before.cost : null,
    series: current.series,
    keys,
    view,
    quarters: id === 'quarter' ? all.quarters.filter((row) => withData.has(row.q)) : [],
  };
}

export function averageModel(ctx, id) {
  return id === 'session' ? sessionModel(ctx) : periodModel(ctx, id);
}

const quarterLabel = (key) => {
  const [year, q] = key.split('-Q');
  return t('overview.avg.quarterKey', { q, year });
};

const labelOf = (key, view) => (view === 'quarterly' ? quarterLabel(key) : bucketLabel(key, view));

const quarterRow = ({ q, cost, tokens }) => `<span class="avg-quarter">${esc(t('overview.avg.quarterRow', { q, cost: fmtMoney(cost), tokens: fmtNum(tokens) }))}</span>`;

function bodyHtml(id, model) {
  const foot = model.prior == null
    ? ''
    : `<span class="avg-foot">${deltaChip(pctChange(model.cost, model.prior), { goodWhenDown: true })}<span>${esc(t('overview.previous', { value: fmtMoney(model.prior) }))}</span></span>`;
  const quarters = id === 'quarter'
    ? `<span class="avg-quarters">${model.quarters.map(quarterRow).join('')}</span>`
    : '';
  return `<div class="avg-main">
      <span class="avg-label">${esc(t(`overview.avg.${id}`))}${tipDot(t(`overview.avg.${id}Tip`))}</span>
      <span class="avg-cost">${esc(fmtMoney(model.cost))}</span>
      <span class="avg-tokens">${esc(t('overview.avg.tokens', { value: fmtNum(model.tokens) }))}</span>
      ${foot}
    </div>
    ${quarters}
    <div class="avg-chart"></div>`;
}

function drawChart(el, model, id) {
  return makeChart(el, {
    chart: { type: 'line', height: 300 },
    series: [{ name: t(`overview.avg.type.${id}`), type: 'column', data: model.series }],
    colors: [cssToken('--c-cache-write')],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '70%' } },
    markers: { size: 0 },
    xaxis: { categories: model.keys.map((key) => labelOf(key, model.view)) },
    yaxis: moneyAxis,
    tooltip: { shared: true, intersect: false, ...moneyTooltip },
    legend: { show: false },
  });
}

export function averageCard() {
  const current = readAverageType();
  const options = AVERAGE_TYPES
    .map((id) => `<option value="${id}"${id === current ? ' selected' : ''}>${esc(t(`overview.avg.type.${id}`))}</option>`)
    .join('');
  return chartCard({
    span: 12,
    color: 'var(--c-cache-write)',
    iconId: 'i-models',
    id: 'ov-average',
    title: t('overview.average'),
    sub: esc(t('overview.averageSub')),
    actions: `<select class="dt-size avg-select" aria-label="${esc(t('overview.avg.typeLabel'))}">${options}</select>`,
  });
}

export function renderAverage(host, ctx) {
  const select = host.closest('.card').querySelector('.avg-select');
  const draw = (id) => {
    destroyChartsIn(host);
    const model = averageModel(ctx, id);
    host.innerHTML = bodyHtml(id, model);
    drawChart(host.querySelector('.avg-chart'), model, id);
  };
  draw(readAverageType());
  select.onchange = () => {
    const id = AVERAGE_TYPES.includes(select.value) ? select.value : DEFAULT_TYPE;
    saveAverageType(id);
    draw(id);
  };
}
