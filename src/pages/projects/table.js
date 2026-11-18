import { state } from '../../core/state.js';
import { fmtInt, fmtMoney, fmtNum, projectKey, projectName } from '../../core/utils.js';
import { esc, modelTone } from '../../ui/dom.js';
import { cell, dataTable } from '../../ui/table.js';
import { t, getLocale } from '../../i18n/index.js';
import { familyChips, renderSessionsSubTable } from '../../components/sessions.js';
import { groupEntries } from '../models/helpers.js';
import { isCowork, projectTip } from './data.js';

function lastActiveText(ts) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function typeCell(key) {
  if (key === '(unknown)') return cell('', '-');
  const kind = isCowork(key) ? 'cowork' : 'code';
  return cell(kind, `<span class="badge"${kind === 'cowork' ? ' data-tone="info"' : ''}>${esc(t(`components.type.${kind}`))}</span>`);
}

export function projectRows(stats, byProject = new Map()) {
  return stats.map((g) => ({
    rowKey: g.key,
    name: cell(projectName(g.key), `<span class="trunc" title="${esc(projectTip(g.key))}">${esc(projectName(g.key))}</span>`),
    type: typeCell(g.key),
    families: cell([...new Set((byProject.get(g.key) ?? []).map((e) => modelTone(e.model)))].join(' ')),
    sessions: cell(g.sessions, esc(fmtInt(g.sessions))),
    requests: cell(g.requests, esc(fmtInt(g.requests))),
    tokens: cell(g.tokens, esc(fmtNum(g.tokens))),
    last: cell(g.lastActive, esc(lastActiveText(g.lastActive))),
    cost: cell(g.final, esc(fmtMoney(g.final))),
  }));
}

export function projectsTable(ctx, stats) {
  const open = (state.openRows.projects ??= new Set());
  const byProject = groupEntries(ctx.entries, projectKey);
  return dataTable({
    span: 12,
    color: 'var(--c-cost)',
    iconId: 'i-projects',
    title: t('projects.tableTitle'),
    sub: esc(t('projects.tableSub')),
    tip: t('projects.tableTip'),
    columns: [
      { key: 'name', label: t('projects.col.project') },
      { key: 'type', label: t('components.col.type') },
      { key: 'sessions', label: t('projects.col.sessions'), num: true },
      { key: 'requests', label: t('components.col.requests'), num: true },
      { key: 'tokens', label: t('components.col.tokens'), num: true },
      { key: 'last', label: t('projects.col.lastActive') },
      { key: 'cost', label: t('components.col.cost'), num: true },
    ],
    rows: projectRows(stats, byProject),
    pageSize: 10,
    defaultSort: { key: 'cost', dir: 'desc' },
    filter: {
      keys: ['name', 'type'],
      placeholder: t('projects.searchPlaceholder'),
      chips: [
        { id: 'code', label: t('components.type.code'), group: 'type', test: (row) => row.type.v === 'code' },
        { id: 'cowork', label: t('components.type.cowork'), group: 'type', test: (row) => row.type.v === 'cowork' },
        ...familyChips((row) => row.families.v.split(' ')),
      ],
    },
    expand: {
      key: (row) => row.rowKey,
      defaultOpen: [...open],
      onToggle: (rowId, isOpen) => {
        if (isOpen) open.add(rowId);
        else open.delete(rowId);
      },
      render: (row, host) => {
        renderSessionsSubTable(host, byProject.get(row.rowKey) ?? [], { onOpen: ctx.openSession, omit: ['project'], markup: ctx.markup });
      },
    },
  });
}
