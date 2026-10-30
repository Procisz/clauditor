import { state } from '../core/state.js';
import { bucketKeyOf, sessionSummaries, totals } from '../core/metrics.js';
import { fmtInt, fmtNum, fmtMoney } from '../core/utils.js';
import { esc } from '../ui/dom.js';
import { openModal, modalSection, modalStat, modalStatRow } from '../ui/modal.js';
import { subTable } from '../ui/table.js';
import { t, tn } from '../i18n/index.js';
import { sessionColumns, sessionRows } from './sessions.js';

export function bucketTitle(bucketKey, view) {
  if (view === 'weekly') return t('components.bucketWeek', { key: bucketKey });
  return t('components.bucketTitle', { key: bucketKey });
}

export function openBucketModal(bucketKey, view, entries, { onOpen = null, markup = state.markup } = {}) {
  const inBucket = entries.filter((e) => e.date && bucketKeyOf(e.date, view) === bucketKey);
  const sum = totals(inBucket, markup);
  const summaries = sessionSummaries(inBucket, markup);

  const box = openModal({
    title: bucketTitle(bucketKey, view),
    sub: tn('components.sessionsCaption', summaries.length) + (onOpen && summaries.length ? ` · ${t('components.clickHint')}` : ''),
    color: 'var(--c-cost)',
    bodyHtml: [
      modalStatRow([
        modalStat({ label: t('components.col.cost'), value: esc(fmtMoney(sum.final)), color: 'var(--c-cost)', iconId: 'i-costs' }),
        modalStat({ label: t('components.col.requests'), value: esc(fmtInt(sum.requests)), color: 'var(--c-output)', iconId: 'i-sessions' }),
        modalStat({ label: t('components.sessions'), value: esc(fmtInt(sum.sessions)), color: 'var(--accent)', iconId: 'i-projects' }),
        modalStat({ label: t('components.tokens'), value: esc(fmtNum(sum.tokens)), color: 'var(--c-input)', iconId: 'i-database' }),
      ]),
      modalSection(t('components.sessions'), '<div data-host="sessions"></div>'),
    ].join(''),
  });

  subTable(box.querySelector('[data-host="sessions"]'), {
    columns: sessionColumns({ omit: ['type', 'effort', 'agents', 'models'] }),
    rows: sessionRows(summaries),
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
    onRowClick: onOpen ? (row) => { if (row.sessionId) onOpen(row.sessionId); } : null,
  });
  return box;
}
