import { groupTotals, sessionSummaries } from '../../core/metrics.js';
import { fmtInt, fmtMoney, fmtNum, projectKey, projectName, sessionName, shortPath } from '../../core/utils.js';
import { familyChips, renderAgentBreakdown, sessionColumns, sessionFilter, sessionRows } from '../../components/sessions.js';
import { esc, modelTone } from '../../ui/dom.js';
import { cell, dataTable } from '../../ui/table.js';
import { t, tn } from '../../i18n/index.js';
import { groupEntries } from '../models/helpers.js';

const SESSION_OMIT = ['type', 'source'];

function projectKind(key) {
  if (key === '(unknown)') return '';
  return key.startsWith('cowork:') ? 'cowork' : 'code';
}

export function sessionsTable(entries, markup) {
  const summaries = sessionSummaries(entries, markup);
  const bySession = new Map();
  for (const e of entries) {
    const id = e.sessionId || '';
    const list = bySession.get(id);
    if (list) list.push(e);
    else bySession.set(id, [e]);
  }
  const rows = sessionRows(summaries).map((row) => {
    const name = sessionName(row.summary.sessionId, row.summary.slug);
    const open = row.sessionId
      ? `<button type="button" class="link-btn trunc" data-open-session="${esc(row.sessionId)}" title="${esc(`${name}\n${t('today.openSession')}`)}">${esc(name)}</button>`
      : `<span class="trunc">${esc(name)}</span>`;
    return { ...row, name: cell(name, open) };
  });
  return dataTable({
    span: 12,
    iconId: 'i-sessions',
    title: t('today.sessions.title'),
    sub: esc(`${tn('components.sessionsCaption', summaries.length)} · ${t('today.sessions.hint')}`),
    columns: sessionColumns({ omit: SESSION_OMIT }),
    rows,
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
    filter: { ...sessionFilter({ omit: SESSION_OMIT }), placeholder: t('today.sessions.searchPlaceholder') },
    expand: {
      key: (row) => row.sessionId || '(unknown)',
      render: (row, host) => renderAgentBreakdown(host, bySession.get(row.sessionId) ?? [], { markup }),
    },
  });
}

export function projectsTable(entries, markup) {
  const groups = groupTotals(entries, projectKey, markup);
  const byProject = groupEntries(entries, projectKey);
  const rows = groups.map((g) => {
    const name = projectName(g.key);
    const tip = g.key.startsWith('cowork:') || g.key === '(unknown)' ? name : shortPath(g.key);
    const families = [...new Set((byProject.get(g.key) ?? []).map((e) => modelTone(e.model)))];
    return {
      name: cell(name, `<span class="trunc" title="${esc(tip)}">${esc(name)}</span>`),
      kind: cell(projectKind(g.key)),
      families: cell(families.join(' ')),
      sessions: cell(g.sessions, esc(fmtInt(g.sessions))),
      requests: cell(g.requests, esc(fmtInt(g.requests))),
      tokens: cell(g.tokens, esc(fmtNum(g.tokens))),
      cost: cell(g.final, esc(fmtMoney(g.final))),
    };
  });
  return dataTable({
    span: 12,
    iconId: 'i-projects',
    title: t('today.projects.title'),
    sub: esc(tn('today.projects.count', groups.length)),
    columns: [
      { key: 'name', label: t('components.col.project') },
      { key: 'sessions', label: t('components.sessions'), num: true },
      { key: 'requests', label: t('components.col.requests'), num: true },
      { key: 'tokens', label: t('components.col.tokens'), num: true },
      { key: 'cost', label: t('components.col.cost'), num: true },
    ],
    rows,
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
    filter: {
      keys: ['name'],
      placeholder: t('today.projects.searchPlaceholder'),
      chips: [
        { id: 'code', label: t('components.type.code'), group: 'type', test: (row) => row.kind.v === 'code' },
        { id: 'cowork', label: t('components.type.cowork'), group: 'type', test: (row) => row.kind.v === 'cowork' },
        ...familyChips((row) => row.families.v.split(' ')),
      ],
    },
  });
}
