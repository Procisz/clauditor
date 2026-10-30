import { pctChange, sessionSummaries } from '../../core/metrics.js';
import { fmtDuration, fmtFixed, fmtInt, fmtMoney } from '../../core/utils.js';
import { chartCard, deltaChip, emptyState, esc, statCard } from '../../ui/dom.js';
import { cssToken } from '../../ui/charts.js';
import { t, tn } from '../../i18n/index.js';
import {
  agentTypeTotals, costDistribution, lengthDistribution, perBucketSeries, shareSeries,
  sourceCounts, subagentSessionCount, subagentShare,
} from './data.js';
import {
  renderAgentTypes, renderDistribution, renderPerBucket, renderSources, renderSubagentShare,
} from './charts.js';
import { agentTypesTable, sessionsTable } from './tables.js';

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

function sessionStats(summaries) {
  const final = summaries.reduce((sum, s) => sum + s.final, 0);
  return {
    count: summaries.length,
    avgCost: summaries.length ? final / summaries.length : 0,
    avgDuration: average(summaries.map((s) => s.durationMs)),
    longest: summaries.reduce((max, s) => Math.max(max, s.durationMs), 0),
  };
}

function versus(pct, { goodWhenDown = false } = {}) {
  const chip = deltaChip(pct, { goodWhenDown });
  return chip ? `${chip} <span class="muted">${esc(t('sessions.vsPrevious'))}</span>` : '';
}

function statsRow({ summaries, previousSummaries, entries, markup }) {
  const now = sessionStats(summaries);
  const before = sessionStats(previousSummaries);
  const share = subagentShare(entries, markup);
  const subSessions = subagentSessionCount(summaries);
  return `<div class="kpi-row">
    ${statCard({
      color: 'var(--c-cost)', iconId: 'i-sessions',
      label: t('sessions.statSessions'), tip: t('sessions.statSessionsTip'),
      value: esc(fmtInt(now.count)),
      foot: versus(pctChange(now.count, before.count)),
    })}
    ${statCard({
      color: 'var(--c-output)', iconId: 'i-costs',
      label: t('sessions.statAvgCost'), tip: t('sessions.statAvgCostTip'),
      value: esc(fmtMoney(now.avgCost)),
      foot: versus(pctChange(now.avgCost, before.avgCost), { goodWhenDown: true }),
    })}
    ${statCard({
      color: 'var(--c-input)', iconId: 'i-today',
      label: t('sessions.statAvgDuration'), tip: t('sessions.statAvgDurationTip'),
      value: esc(fmtDuration(now.avgDuration)),
      foot: esc(t('sessions.statLongest', { value: fmtDuration(now.longest) })),
    })}
    ${statCard({
      color: 'var(--c-cache-write)', iconId: 'i-models',
      label: t('sessions.statSubagentShare'), tip: t('sessions.statSubagentShareTip'),
      value: esc(share == null ? '-' : `${fmtFixed(share * 100, 1)}%`),
      foot: esc(tn('sessions.statSubagentSessions', subSessions)),
    })}
  </div>`;
}

function chartsHtml() {
  return [
    chartCard({ span: 8, color: 'var(--c-output)', iconId: 'i-sessions', title: t('sessions.perBucketTitle'), sub: esc(t('sessions.perBucketSub')), tip: t('sessions.perBucketTip'), id: 'ss-per-bucket' }),
    chartCard({ span: 4, color: 'var(--c-cost)', iconId: 'i-database', title: t('sessions.sourceTitle'), sub: esc(t('sessions.sourceSub')), id: 'ss-source' }),
    chartCard({ span: 6, color: 'var(--c-input)', iconId: 'i-today', title: t('sessions.lengthTitle'), sub: esc(t('sessions.lengthSub')), tip: t('sessions.lengthTip'), id: 'ss-length' }),
    chartCard({ span: 6, color: 'var(--c-cost)', iconId: 'i-costs', title: t('sessions.costDistTitle'), sub: esc(t('sessions.costDistSub')), tip: t('sessions.costDistTip'), id: 'ss-cost-dist' }),
    chartCard({ span: 8, color: 'var(--c-cache-write)', iconId: 'i-models', title: t('sessions.subagentShareTitle'), sub: esc(t('sessions.subagentShareSub')), tip: t('sessions.subagentShareTip'), id: 'ss-subagent-share' }),
    chartCard({ span: 4, color: 'var(--c-output)', iconId: 'i-models', title: t('sessions.agentTypesTitle'), sub: esc(t('sessions.agentTypesSub')), tip: t('sessions.agentTypesTip'), id: 'ss-agent-types' }),
  ].join('');
}

function wireOpenButtons(grid, openSession) {
  const sessionOf = (e) => e.target.closest?.('[data-open-session]');
  grid.addEventListener('click', (e) => {
    const button = sessionOf(e);
    if (!button) return;
    e.stopPropagation();
    openSession(button.dataset.openSession);
  }, true);
  grid.addEventListener('keydown', (e) => {
    if (sessionOf(e) && (e.key === 'Enter' || e.key === ' ')) e.stopPropagation();
  }, true);
}

export default {
  id: 'sessions',
  titleKey: 'nav.sessions',
  icon: 'i-sessions',
  usesRange: true,
  render(mount, ctx) {
    const { entries, previous, markup, range } = ctx;
    const summaries = sessionSummaries(entries, markup);
    if (summaries.length === 0) {
      mount.innerHTML = emptyState({ iconId: 'i-sessions', title: t('nav.sessions'), message: t('sessions.noSessions') });
      return;
    }
    const previousSummaries = sessionSummaries(previous.entries, markup);
    const agentTotals = agentTypeTotals(entries, markup);

    mount.innerHTML = `${statsRow({ summaries, previousSummaries, entries, markup })}
      <div class="grid12">
        ${sessionsTable({ summaries, entries, markup })}
        ${chartsHtml()}
        ${agentTypesTable(agentTotals)}
      </div>`;

    const grid = mount.querySelector('.grid12');
    wireOpenButtons(grid, ctx.openSession);
    const host = (id) => mount.querySelector(`#${id}`);

    renderPerBucket(host('ss-per-bucket'), perBucketSeries(entries, range, markup), {
      view: range.view, entries, markup, onOpen: ctx.openSession,
    });
    renderSources(host('ss-source'), sourceCounts(summaries));
    renderDistribution(host('ss-length'), { ...lengthDistribution(summaries), color: cssToken('--c-input'), name: t('sessions.seriesSessions') });
    renderDistribution(host('ss-cost-dist'), { ...costDistribution(summaries), color: cssToken('--c-cost'), name: t('sessions.seriesSessions') });
    renderSubagentShare(host('ss-subagent-share'), shareSeries(entries, range, markup));
    renderAgentTypes(host('ss-agent-types'), agentTotals);
  },
};
