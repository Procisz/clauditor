import { pctChange } from '../../core/metrics.js';
import { cacheWriteSplitTitle, fmtDuration, fmtFixed, fmtMoney, fmtNum } from '../../core/utils.js';
import { deltaChip, esc, statCard } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';

const percent = (rate) => `${fmtFixed((rate ?? 0) * 100, 1)}%`;

export function cardsHtml(cur, prev) {
  const ct = cur.totals;
  const pt = prev.totals;
  const cards = [
    {
      key: 'finalCost',
      color: 'var(--c-cost)',
      iconId: 'i-costs',
      value: fmtMoney(ct.final),
      delta: pctChange(ct.final, pt.final),
      goodWhenDown: true,
    },
    { key: 'baseCost', color: 'var(--c-prev)', iconId: 'i-database', value: fmtMoney(ct.base), delta: pctChange(ct.base, pt.base), goodWhenDown: true },
    { key: 'sessions', color: 'var(--accent)', iconId: 'i-sessions', value: fmtNum(ct.sessions), delta: pctChange(ct.sessions, pt.sessions) },
    {
      key: 'sessionTime',
      color: 'var(--warn)',
      iconId: 'i-today',
      value: fmtDuration(cur.sessionTimeMs),
      delta: pctChange(cur.sessionTimeMs, prev.sessionTimeMs),
      tip: t('today.card.sessionTimeTip'),
    },
    { key: 'calls', color: 'var(--c-output)', iconId: 'i-trend-up', value: fmtNum(ct.requests), delta: pctChange(ct.requests, pt.requests) },
    { key: 'inputTokens', color: 'var(--c-input)', iconId: 'i-download', value: fmtNum(ct.input), delta: pctChange(ct.input, pt.input) },
    {
      key: 'cacheHit',
      color: 'var(--c-cache-read)',
      iconId: 'i-gauge',
      value: percent(cur.hitRate),
      delta: pctChange(cur.hitRate, prev.hitRate),
      tip: t('today.card.cacheHitTip', { split: cacheWriteSplitTitle(ct.cacheWrite, ct.cacheWrite1h) }),
    },
    {
      key: 'avgResponse',
      color: 'var(--c-prev)',
      iconId: 'i-refresh',
      value: fmtDuration(cur.responseMs),
      delta: pctChange(cur.responseMs, prev.responseMs),
      goodWhenDown: true,
    },
    {
      key: 'avgCost',
      color: 'var(--c-cost)',
      iconId: 'i-wallet',
      value: cur.avgCost == null ? '-' : fmtMoney(cur.avgCost),
      delta: pctChange(cur.avgCost, prev.avgCost),
      goodWhenDown: true,
    },
  ];
  return cards.map((c) => {
    const chip = deltaChip(c.delta, { goodWhenDown: c.goodWhenDown });
    return statCard({
      color: c.color,
      iconId: c.iconId,
      label: t(`today.card.${c.key}`),
      value: esc(c.value),
      foot: `${esc(t(`today.card.${c.key}Foot`))}${chip ? ` ${chip}` : ''}`,
      tip: c.tip ?? '',
    });
  }).join('');
}
