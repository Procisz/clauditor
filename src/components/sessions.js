import { state } from '../core/state.js';
import { entryCost } from '../core/config.js';
import { sessionSummaries } from '../core/metrics.js';
import { sessionName, projectName, shortPath, fmtDuration, fmtNum, fmtInt, fmtFixed, fmtMoney } from '../core/utils.js';
import { esc, modelBadge } from '../ui/dom.js';
import { cell, subTable } from '../ui/table.js';
import { t, tn, getLocale } from '../i18n/index.js';

export const EFFORT_RANK = Object.freeze({ low: 1, medium: 2, high: 3, xhigh: 4, max: 5 });

const EFFORT_TONES = { max: 'bad', xhigh: 'warn', high: 'info' };

export function effortBadge(level) {
  const tone = EFFORT_TONES[level];
  return `<span class="badge"${tone ? ` data-tone="${tone}"` : ''}>${esc(level)}</span>`;
}

export function effortsSorted(effortMap) {
  return [...effortMap.entries()].sort((a, b) => (EFFORT_RANK[b[0]] || 0) - (EFFORT_RANK[a[0]] || 0));
}

const TYPE_TONES = { cowork: 'info' };

export function sessionColumns({ omit = [] } = {}) {
  const all = [
    { key: 'name', label: t('components.col.name') },
    { key: 'start', label: t('components.col.start') },
    { key: 'project', label: t('components.col.project') },
    { key: 'type', label: t('components.col.type') },
    { key: 'source', label: t('components.col.source') },
    { key: 'models', label: t('components.col.models') },
    { key: 'effort', label: t('components.col.effort') },
    { key: 'agents', label: t('components.col.agents'), num: true },
    { key: 'duration', label: t('components.col.duration'), num: true },
    { key: 'requests', label: t('components.col.requests'), num: true },
    { key: 'tokens', label: t('components.col.tokens'), num: true },
    { key: 'cost', label: t('components.col.cost'), num: true },
  ];
  return all.filter((c) => !omit.includes(c.key));
}

function startText(ts) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function effortCell(s) {
  const levels = effortsSorted(s.effort);
  if (levels.length === 0) {
    const tip = s.effortUnknown > 0 ? ` title="${esc(t('components.effortUnknownTip'))}"` : '';
    return cell(0, `<span${tip}>-</span>`);
  }
  const [top, ...rest] = levels;
  const extra = rest.length
    ? ` <span class="muted small">${esc(rest.map(([level, n]) => `${level} ×${fmtInt(n)}`).join(' · '))}</span>`
    : '';
  const title = levels.map(([level, n]) => t('components.effortLine', { level, n: fmtInt(n) })).join('\n');
  return cell(EFFORT_RANK[top[0]] || 0, `<span title="${esc(title)}">${effortBadge(top[0])}${extra}</span>`);
}

export function sessionRows(summaries) {
  return summaries.map((s) => {
    const name = sessionName(s.sessionId, s.slug);
    const project = projectName(s.project);
    const projectTip = s.kind === 'cowork' || s.project === '(unknown)' ? project : shortPath(s.project);
    const subagents = [...s.agents.keys()].filter((k) => k !== 'main').length;
    const models = [...s.models.keys()];
    return {
      sessionId: s.sessionId,
      summary: s,
      name: cell(name, `<span class="trunc" title="${esc(s.sessionId ? `${name}\n${s.sessionId}` : name)}">${esc(name)}</span>`),
      start: cell(s.start, esc(startText(s.start) || '-')),
      project: cell(project, `<span class="trunc" title="${esc(projectTip)}">${esc(project)}</span>`),
      type: cell(s.kind, `<span class="badge"${TYPE_TONES[s.kind] ? ` data-tone="${TYPE_TONES[s.kind]}"` : ''}>${esc(t(`components.type.${s.kind}`))}</span>`),
      source: cell(t(`components.source.${s.source}`)),
      models: cell(models[0] ?? '', models.map(modelBadge).join(' ') || '-'),
      effort: effortCell(s),
      agents: cell(subagents, subagents > 0 ? esc(tn('components.subagents', subagents)) : '-'),
      duration: cell(s.durationMs, esc(fmtDuration(s.durationMs))),
      requests: cell(s.requests, esc(fmtInt(s.requests))),
      tokens: cell(s.tokens, `<span title="${esc(t('components.tokensTip', { input: fmtNum(s.input), output: fmtNum(s.output) }))}">${esc(fmtNum(s.tokens))}</span>`),
      cost: cell(s.final, esc(fmtMoney(s.final))),
    };
  });
}

export function renderSessionsSubTable(host, entries, { onOpen = null, omit = ['project'], markup = state.markup } = {}) {
  const summaries = sessionSummaries(entries, markup);
  subTable(host, {
    caption: (total) => esc(tn('components.sessionsCaption', total)) + (onOpen ? ` · ${esc(t('components.clickHint'))}` : ''),
    columns: sessionColumns({ omit }),
    rows: sessionRows(summaries),
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
    onRowClick: onOpen ? (row) => { if (row.sessionId) onOpen(row.sessionId); } : null,
  });
}

export function agentLabel(agentType) {
  return agentType === 'main' ? t('components.agentMain') : agentType;
}

export function renderAgentBreakdown(host, sessionEntries, { markup = state.markup } = {}) {
  let grand = 0;
  const byAgentModel = new Map();
  for (const e of sessionEntries) {
    const agentType = e.agentType || 'main';
    const key = `${agentType}|${e.model}`;
    const g = byAgentModel.get(key) ?? { agentType, model: e.model, requests: 0, output: 0, base: 0 };
    g.requests++;
    g.output += e.output || 0;
    const cost = entryCost(e);
    g.base += cost;
    grand += cost * markup;
    byAgentModel.set(key, g);
  }
  const ordered = [...byAgentModel.values()].sort((a, b) => b.base - a.base);

  const rows = ordered.map((g) => {
    const final = g.base * markup;
    const label = agentLabel(g.agentType);
    return {
      agent: cell(label, `<span class="badge">${esc(label)}</span>`),
      model: cell(g.model, modelBadge(g.model)),
      requests: cell(g.requests, esc(fmtInt(g.requests))),
      output: cell(g.output, esc(fmtNum(g.output))),
      share: cell(grand > 0 ? final / grand : 0, esc(grand > 0 ? `${fmtFixed((final / grand) * 100, 1)}%` : '-')),
      cost: cell(final, esc(fmtMoney(final))),
    };
  });

  subTable(host, {
    columns: [
      { key: 'agent', label: t('components.col.agent') },
      { key: 'model', label: t('components.col.model') },
      { key: 'requests', label: t('components.col.requests'), num: true },
      { key: 'output', label: t('components.col.output'), num: true },
      { key: 'share', label: t('components.col.share'), num: true },
      { key: 'cost', label: t('components.col.cost'), num: true },
    ],
    rows,
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
  });
}
