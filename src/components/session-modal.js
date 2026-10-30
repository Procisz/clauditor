import { state } from '../core/state.js';
import { entryCost } from '../core/config.js';
import { sessionSummaries } from '../core/metrics.js';
import { sessionName, projectName, shortPath, fmtDuration, fmtNum, fmtInt, fmtFixed, fmtMoney, cacheWriteSplitTitle } from '../core/utils.js';
import { esc, modelBadge } from '../ui/dom.js';
import { openModal, modalSection, modalStat, modalStatRow, modalBar, modalMeta, modalBadge } from '../ui/modal.js';
import { cell, subTable } from '../ui/table.js';
import { t, tn, getLocale } from '../i18n/index.js';
import { effortBadge, effortsSorted, agentLabel } from './sessions.js';

function dateTimeText(ts) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function modelsTable(host, summary) {
  const rows = [...summary.models.entries()].map(([model, m]) => ({
    model: cell(model, modelBadge(model)),
    requests: cell(m.requests, esc(fmtInt(m.requests))),
    tokens: cell(m.tokens, esc(fmtNum(m.tokens))),
    cost: cell(m.final, esc(fmtMoney(m.final))),
  }));
  subTable(host, {
    columns: [
      { key: 'model', label: t('components.col.model') },
      { key: 'requests', label: t('components.col.requests'), num: true },
      { key: 'tokens', label: t('components.col.tokens'), num: true },
      { key: 'cost', label: t('components.col.cost'), num: true },
    ],
    rows,
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
  });
}

function agentsTable(host, summary) {
  const rows = [...summary.agents.entries()].map(([agentType, a]) => ({
    agent: cell(agentLabel(agentType), `<span class="badge">${esc(agentLabel(agentType))}</span>`),
    requests: cell(a.requests, esc(fmtInt(a.requests))),
    output: cell(a.output, esc(fmtNum(a.output))),
    cost: cell(a.final, esc(fmtMoney(a.final))),
  }));
  subTable(host, {
    columns: [
      { key: 'agent', label: t('components.col.agent') },
      { key: 'requests', label: t('components.col.requests'), num: true },
      { key: 'output', label: t('components.col.output'), num: true },
      { key: 'cost', label: t('components.col.cost'), num: true },
    ],
    rows,
    pageSize: 5,
    defaultSort: { key: 'cost', dir: 'desc' },
  });
}

export function openSessionModal(sessionId, allEntries, durations = [], { markup = state.markup } = {}) {
  if (!sessionId) return null;
  const entries = allEntries.filter((e) => e.sessionId === sessionId);
  if (entries.length === 0) return null;
  const [s] = sessionSummaries(entries, markup);
  const turns = durations.filter((d) => d.sessionId === sessionId);

  const days = new Set();
  let peakContext = 0;
  for (const e of entries) {
    if (e.date) days.add(e.date);
    const prompt = (e.input || 0) + (e.cacheRead || 0) + (e.cacheWrite || 0);
    if (prompt > peakContext) peakContext = prompt;
  }
  let grandBase = 0;
  for (const e of allEntries) grandBase += entryCost(e);
  const share = grandBase > 0 ? (s.base / grandBase) * 100 : 0;

  const context = s.input + s.cacheRead + s.cacheWrite;
  const hit = context > 0 ? (s.cacheRead / context) * 100 : 0;
  let respSum = 0;
  let respMax = 0;
  for (const d of turns) {
    respSum += d.durationMs;
    if (d.durationMs > respMax) respMax = d.durationMs;
  }
  const avgResp = turns.length ? respSum / turns.length : 0;

  const name = sessionName(sessionId, s.slug);
  const project = projectName(s.project);
  const sub = s.kind === 'cowork' || s.project === '(unknown)' ? project : shortPath(s.project);
  const typeLabel = t(`components.type.${s.kind}`);
  const sourceLabel = t(`components.source.${s.source}`);

  const stats = modalStatRow([
    modalStat({
      label: t('components.col.cost'), value: esc(fmtMoney(s.final)), color: 'var(--c-cost)', iconId: 'i-costs',
      sub: esc(markup !== 1 ? t('components.baseTimes', { base: fmtMoney(s.base), markup: fmtFixed(markup, 2) }) : t('components.noMarkup')),
    }),
    modalStat({
      label: t('components.col.requests'), value: esc(fmtInt(s.requests)), color: 'var(--c-output)', iconId: 'i-sessions',
      sub: esc(turns.length ? tn('components.turns', turns.length) : ''),
    }),
    modalStat({
      label: t('components.tokens'), value: esc(fmtNum(s.tokens)), color: 'var(--c-input)', iconId: 'i-database',
      sub: esc(t('components.tokensTip', { input: fmtNum(s.input), output: fmtNum(s.output) })),
    }),
    modalStat({
      label: t('components.cacheHit'), value: esc(`${fmtFixed(hit, 1)}%`), color: 'var(--c-cache-read)', iconId: 'i-archive',
      sub: esc(t('components.cacheReadTokens', { n: fmtNum(s.cacheRead) })),
    }),
    modalStat({
      label: t('components.col.duration'), value: esc(fmtDuration(s.durationMs)), color: 'var(--warn)', iconId: 'i-today',
      sub: esc(days.size > 1 ? tn('components.acrossDays', days.size) : t('components.singleDay')),
    }),
    modalStat({
      label: t('components.avgResponse'), value: esc(fmtDuration(avgResp)), color: 'var(--accent)', iconId: 'i-refresh',
      sub: esc(respMax > 0 ? t('components.slowest', { value: fmtDuration(respMax) }) : ''),
    }),
  ]);

  const bar = modalBar([
    { label: t('components.tokenInput'), value: s.input, color: 'var(--c-input)', note: fmtNum(s.input) },
    { label: t('components.tokenOutput'), value: s.output, color: 'var(--c-output)', note: fmtNum(s.output) },
    { label: t('components.tokenCacheWrite1h'), value: s.cacheWrite1h, color: 'var(--c-cache-write-1h)', note: fmtNum(s.cacheWrite1h) },
    { label: t('components.tokenCacheWrite5m'), value: s.cacheWrite - s.cacheWrite1h, color: 'var(--c-cache-write)', note: fmtNum(s.cacheWrite - s.cacheWrite1h) },
    { label: t('components.tokenCacheRead'), value: s.cacheRead, color: 'var(--c-cache-read)', note: fmtNum(s.cacheRead) },
  ]);

  const showAgents = s.agents.size > 1 || !s.agents.has('main');
  const efforts = effortsSorted(s.effort);

  const effortHtml = efforts.length
    ? `<div class="effort-list">${efforts.map(([level, n]) =>
        `<span>${effortBadge(level)} <span class="muted small">${esc(tn('components.requestsCount', n))}</span></span>`).join('')}${
        s.effortUnknown > 0
          ? `<span class="muted small" title="${esc(t('components.effortUnknownTip'))}">${esc(t('components.noEffortData', { n: fmtInt(s.effortUnknown) }))}</span>`
          : ''}</div>`
    : '';

  const cacheWriteShare = s.cacheWrite > 0 ? (s.cacheWrite1h / s.cacheWrite) * 100 : 0;
  const peakWindow = peakContext > 200_000 ? 1_000_000 : 200_000;
  const meta = modalMeta([
    { k: t('components.sessionId'), html: `<span class="mono break-all">${esc(sessionId)}</span>` },
    { k: t('components.started'), v: dateTimeText(s.start) },
    { k: t('components.lastActivity'), v: dateTimeText(s.end) },
    { k: t('components.col.type'), v: typeLabel },
    { k: t('components.col.source'), v: sourceLabel },
    { k: t('components.activeDays'), v: fmtInt(days.size) },
    {
      k: t('components.cacheWrite'),
      html: `<span title="${esc(cacheWriteSplitTitle(s.cacheWrite, s.cacheWrite1h))}">${esc(t('components.tokensCount', { n: fmtNum(s.cacheWrite) }))}${
        s.cacheWrite > 0 ? ` <span class="muted small">${esc(t('components.writtenFor1h', { pct: fmtFixed(cacheWriteShare, 0) }))}</span>` : ''}</span>`,
    },
    { k: t('components.baseCost'), v: fmtMoney(s.base) },
    { k: t('components.shareOfSpend'), v: `${fmtFixed(share, 2)}%` },
    peakContext > 0 ? {
      k: t('components.peakContext'),
      html: `<span title="${esc(t('components.peakContextTip'))}">${esc(t('components.peakContextValue', {
        tokens: fmtNum(peakContext), pct: fmtFixed((peakContext / peakWindow) * 100, 1), window: fmtNum(peakWindow),
      }))}</span>`,
    } : null,
  ]);

  const box = openModal({
    title: name,
    sub,
    badges: [
      modalBadge(`${typeLabel} · ${sourceLabel}`, s.kind === 'cowork' ? 'info' : 'neutral'),
      ...[...s.models.keys()].map(modelBadge),
    ],
    color: 'var(--c-cost)',
    bodyHtml: [
      stats,
      modalSection(t('components.tokenDistribution'), bar),
      modalSection(t('components.modelsTitle'), '<div data-host="models"></div>'),
      showAgents ? modalSection(t('components.agentsTitle'), '<div data-host="agents"></div>') : '',
      effortHtml ? modalSection(t('components.effortTitle'), effortHtml) : '',
      modalSection(t('components.timeline'), meta),
    ].join(''),
  });

  modelsTable(box.querySelector('[data-host="models"]'), s);
  const agentsHost = box.querySelector('[data-host="agents"]');
  if (agentsHost) agentsTable(agentsHost, s);
  return box;
}
