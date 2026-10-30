import { fmtInt, fmtMoney, fmtNum } from '../../core/utils.js';
import { deltaChip, esc } from '../../ui/dom.js';
import { cell, dataTable } from '../../ui/table.js';
import { t } from '../../i18n/index.js';
import { monthlyRows } from './data.js';
import { monthLabel } from './format.js';

export function monthlyTable({ allEntries, markup }) {
  const rows = monthlyRows(allEntries, markup).map((m) => ({
    month: cell(m.key, esc(monthLabel(m.key))),
    requests: cell(m.requests, esc(fmtInt(m.requests))),
    tokens: cell(m.tokens, esc(fmtNum(m.tokens))),
    base: cell(m.base, esc(fmtMoney(m.base))),
    cost: cell(m.final, esc(fmtMoney(m.final))),
    change: cell(m.change, m.change == null ? '-' : deltaChip(m.change, { goodWhenDown: true })),
  }));
  return dataTable({
    span: 7,
    color: 'var(--c-cost)',
    iconId: 'i-calendar',
    title: t('costs.monthly.title'),
    sub: esc(t('costs.monthly.sub')),
    columns: [
      { key: 'month', label: t('costs.col.month') },
      { key: 'requests', label: t('costs.col.requests'), num: true },
      { key: 'tokens', label: t('costs.col.tokens'), num: true },
      { key: 'base', label: t('costs.col.base'), num: true },
      { key: 'cost', label: t('costs.col.cost'), num: true },
      { key: 'change', label: t('costs.col.change'), num: true },
    ],
    rows,
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
  });
}
