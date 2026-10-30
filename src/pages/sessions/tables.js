import { sessionName, fmtInt, fmtNum, fmtMoney } from '../../core/utils.js';
import { agentLabel, renderAgentBreakdown, sessionColumns, sessionRows } from '../../components/sessions.js';
import { esc } from '../../ui/dom.js';
import { cell, dataTable } from '../../ui/table.js';
import { t } from '../../i18n/index.js';
import { entriesBySession } from './data.js';

const SEARCH_KEYS = ['name', 'project', 'type', 'source', 'models', 'effort'];

function openCell(summary) {
  if (!summary.sessionId) return cell('', '-');
  const name = sessionName(summary.sessionId, summary.slug);
  return cell('', `<button type="button" class="link-btn" data-open-session="${esc(summary.sessionId)}" aria-label="${esc(t('sessions.openLabel', { name }))}">${esc(t('sessions.open'))}</button>`);
}

export function sessionsTable({ summaries, entries, markup }) {
  const bySession = entriesBySession(entries);
  const rows = sessionRows(summaries).map((row) => ({ ...row, open: openCell(row.summary) }));
  return dataTable({
    span: 12,
    color: 'var(--c-cost)',
    iconId: 'i-sessions',
    title: t('sessions.tableTitle'),
    sub: esc(t('sessions.tableSub')),
    columns: [...sessionColumns(), { key: 'open', label: t('sessions.col.details'), sortable: false }],
    rows,
    pageSize: 10,
    defaultSort: { key: 'cost', dir: 'desc' },
    filter: { keys: SEARCH_KEYS, placeholder: t('sessions.searchPlaceholder') },
    expand: {
      key: (row) => row.sessionId,
      render: (row, host) => renderAgentBreakdown(host, bySession.get(row.sessionId) ?? [], { markup }),
    },
  });
}

export function agentTypesTable(agentTotals) {
  const rows = agentTotals.map((g) => {
    const label = agentLabel(g.key);
    return {
      type: cell(label, `<span class="badge">${esc(label)}</span>`),
      requests: cell(g.requests, esc(fmtInt(g.requests))),
      sessions: cell(g.sessions, esc(fmtInt(g.sessions))),
      tokens: cell(g.tokens, esc(fmtNum(g.tokens))),
      cost: cell(g.final, esc(fmtMoney(g.final))),
    };
  });
  return dataTable({
    span: 12,
    color: 'var(--c-output)',
    iconId: 'i-models',
    title: t('sessions.agentTableTitle'),
    sub: esc(t('sessions.agentTableSub')),
    columns: [
      { key: 'type', label: t('sessions.col.agentType') },
      { key: 'requests', label: t('sessions.col.requests'), num: true },
      { key: 'sessions', label: t('sessions.col.sessions'), num: true },
      { key: 'tokens', label: t('sessions.col.tokens'), num: true },
      { key: 'cost', label: t('sessions.col.cost'), num: true },
    ],
    rows,
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
  });
}
