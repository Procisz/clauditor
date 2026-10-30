import { cacheHitRate, bucketize, pctChange, totals } from '../../core/metrics.js';
import { fmtFixed, fmtInt, fmtMoney, fmtNum } from '../../core/utils.js';
import { t } from '../../i18n/index.js';
import { deltaChip, esc, statCard } from '../../ui/dom.js';
import { sparkline } from '../../ui/charts.js';

const rateText = (rate) => (rate == null ? '-' : `${fmtFixed(rate * 100, 1)}%`);
const averageCost = (sum) => (sum.sessions > 0 ? sum.final / sum.sessions : 0);

export function kpiDefinitions() {
  return [
    {
      id: 'cost', color: 'var(--c-cost)', iconId: 'i-costs', goodWhenDown: true,
      pick: (s) => s.final, show: (v) => fmtMoney(v),
    },
    {
      id: 'requests', color: 'var(--c-output)', iconId: 'i-trend-up', goodWhenDown: false,
      pick: (s) => s.requests, show: (v) => fmtInt(v),
    },
    {
      id: 'sessions', color: 'var(--accent)', iconId: 'i-sessions', goodWhenDown: false,
      pick: (s) => s.sessions, show: (v) => fmtInt(v),
    },
    {
      id: 'tokens', color: 'var(--c-input)', iconId: 'i-database', goodWhenDown: false,
      pick: (s) => s.tokens, show: (v) => fmtNum(v),
    },
    {
      id: 'cacheHit', color: 'var(--c-cache-read)', iconId: 'i-archive', goodWhenDown: false,
      pick: (s) => cacheHitRate(s), show: rateText,
    },
    {
      id: 'avgSession', color: 'var(--c-cache-write)', iconId: 'i-models', goodWhenDown: true,
      pick: averageCost, show: (v) => fmtMoney(v),
    },
  ];
}

export function kpiCards(ctx) {
  const { entries, previous, markup, range } = ctx;
  const current = totals(entries, markup);
  const hasPrevious = Boolean(previous.from);
  const before = hasPrevious ? totals(previous.entries, markup) : null;
  const { keys, byKey } = bucketize(entries, { from: range.from, to: range.to, view: range.view, markup });
  const buckets = keys.map((key) => byKey.get(key));

  return kpiDefinitions().map((def) => {
    const value = def.pick(current);
    const prior = before ? def.pick(before) : null;
    const change = value != null && prior != null ? pctChange(value, prior) : null;
    const foot = before
      ? `${deltaChip(change, { goodWhenDown: def.goodWhenDown })}<span>${esc(t('overview.previous', { value: def.show(prior) }))}</span>`
      : '';
    return statCard({
      color: def.color,
      iconId: def.iconId,
      label: t(`overview.kpi.${def.id}`),
      tip: t(`overview.kpi.${def.id}Tip`),
      value: esc(def.show(value)),
      foot,
      spark: sparkline(buckets.map(def.pick)),
    });
  }).join('');
}
