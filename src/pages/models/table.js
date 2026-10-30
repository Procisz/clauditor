import { state } from '../../core/state.js';
import { groupTotals } from '../../core/metrics.js';
import { cacheWriteSplitTitle, fmtInt, fmtMoney, fmtNum } from '../../core/utils.js';
import { esc, modelBadge } from '../../ui/dom.js';
import { cell, dataTable } from '../../ui/table.js';
import { t, tn } from '../../i18n/index.js';
import { EFFORT_RANK, effortBadge, effortsSorted, renderSessionsSubTable } from '../../components/sessions.js';
import { groupEntries } from './helpers.js';

export function effortByModel(entries) {
  const out = new Map();
  for (const e of entries) {
    let m = out.get(e.model);
    if (!m) out.set(e.model, (m = { levels: new Map(), unknown: 0 }));
    if (e.effort) m.levels.set(e.effort, (m.levels.get(e.effort) ?? 0) + 1);
    else m.unknown++;
  }
  return out;
}

function effortCell(mix) {
  const levels = mix ? effortsSorted(mix.levels) : [];
  if (levels.length === 0) {
    const tip = mix?.unknown > 0 ? ` title="${esc(t('components.effortUnknownTip'))}"` : '';
    return cell(0, `<span${tip}>-</span>`);
  }
  const title = levels.map(([level, n]) => t('components.effortLine', { level, n: fmtInt(n) })).join('\n')
    + (mix.unknown > 0 ? `\n${t('components.noEffortData', { n: fmtInt(mix.unknown) })}` : '');
  const html = levels
    .map(([level, n]) => `${effortBadge(level)} <span class="muted small">×${esc(fmtInt(n))}</span>`)
    .join(' ');
  return cell(EFFORT_RANK[levels[0][0]] || 0, `<span title="${esc(title)}">${html}</span>`);
}

export function modelRows(entries, markup) {
  const effort = effortByModel(entries);
  return groupTotals(entries, (e) => e.model, markup).map((g) => ({
    rowKey: g.key,
    model: cell(g.key, modelBadge(g.key)),
    requests: cell(g.requests, esc(fmtInt(g.requests))),
    sessions: cell(g.sessions, esc(fmtInt(g.sessions))),
    input: cell(g.input, esc(fmtNum(g.input))),
    output: cell(g.output, esc(fmtNum(g.output))),
    cacheWrite: cell(
      g.cacheWrite,
      `<span title="${esc(cacheWriteSplitTitle(g.cacheWrite, g.cacheWrite1h))}">${esc(fmtNum(g.cacheWrite))}</span>`,
    ),
    cacheRead: cell(g.cacheRead, esc(fmtNum(g.cacheRead))),
    effort: effortCell(effort.get(g.key)),
    base: cell(g.base, esc(fmtMoney(g.base))),
    cost: cell(g.final, esc(fmtMoney(g.final))),
  }));
}

function sessionCount(entries) {
  return new Set(entries.map((e) => e.sessionId || '(unknown)')).size;
}

function tableSub(ctx) {
  const inPeriod = sessionCount(ctx.entries);
  const allTime = sessionCount(ctx.allEntries);
  const text = allTime !== inPeriod
    ? t('models.sessionsInPeriodAll', { n: fmtInt(inPeriod), all: fmtInt(allTime) })
    : t('models.sessionsInPeriod', { n: fmtInt(inPeriod) });
  const hidden = allTime - inPeriod;
  const tip = hidden > 0 ? ` title="${esc(tn('models.sessionsHiddenTip', hidden))}"` : '';
  return `<span${tip}>${esc(text)}</span>`;
}

export function modelsTable(ctx) {
  const open = (state.openRows.models ??= new Set());
  const byModel = groupEntries(ctx.entries, (e) => e.model);
  return dataTable({
    span: 12,
    color: 'var(--c-cost)',
    iconId: 'i-models',
    title: t('models.tableTitle'),
    sub: tableSub(ctx),
    tip: t('models.tableTip'),
    columns: [
      { key: 'model', label: t('components.col.model') },
      { key: 'requests', label: t('components.col.requests'), num: true },
      { key: 'sessions', label: t('models.col.sessions'), num: true },
      { key: 'input', label: t('models.col.input'), num: true },
      { key: 'output', label: t('components.col.output'), num: true },
      { key: 'cacheWrite', label: t('models.col.cacheWrite'), num: true },
      { key: 'cacheRead', label: t('models.col.cacheRead'), num: true },
      { key: 'effort', label: t('components.col.effort') },
      { key: 'base', label: t('models.col.base'), num: true },
      { key: 'cost', label: t('components.col.cost'), num: true },
    ],
    rows: modelRows(ctx.entries, ctx.markup),
    pageSize: 10,
    defaultSort: { key: 'cost', dir: 'desc' },
    expand: {
      key: (row) => row.rowKey,
      defaultOpen: [...open],
      onToggle: (rowId, isOpen) => {
        if (isOpen) open.add(rowId);
        else open.delete(rowId);
      },
      render: (row, host) => {
        const own = byModel.get(row.rowKey) ?? [];
        renderSessionsSubTable(host, own, { onOpen: ctx.openSession, omit: ['models'], markup: ctx.markup });
      },
    },
  });
}
