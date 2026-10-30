import { bucketize, groupTotals, histogram, totals } from '../../core/metrics.js';
import { fmtMoney } from '../../core/utils.js';
import { t } from '../../i18n/index.js';

const MINUTE_MS = 60_000;

export const LENGTH_EDGES = Object.freeze([5, 15, 30, 60, 120, 240].map((m) => m * MINUTE_MS));
export const LENGTH_KEYS = Object.freeze(['u5', '5-15', '15-30', '30-60', '60-120', '120-240', 'o240']);
export const COST_EDGES = Object.freeze([0.1, 0.5, 1, 5, 10, 50]);

export const isMainAgent = (e) => !e.agentType || e.agentType === 'main';

export function lengthDistribution(summaries) {
  return {
    labels: LENGTH_KEYS.map((key) => t(`sessions.length.${key}`)),
    counts: histogram(summaries.map((s) => s.durationMs), LENGTH_EDGES),
  };
}

export function costLabels() {
  const last = COST_EDGES.length - 1;
  return [
    t('sessions.cost.under', { to: fmtMoney(COST_EDGES[0]) }),
    ...COST_EDGES.slice(0, last).map((from, i) => t('sessions.cost.between', { from: fmtMoney(from), to: fmtMoney(COST_EDGES[i + 1]) })),
    t('sessions.cost.over', { from: fmtMoney(COST_EDGES[last]) }),
  ];
}

export function costDistribution(summaries) {
  return {
    labels: costLabels(),
    counts: histogram(summaries.map((s) => s.final), COST_EDGES),
  };
}

export function sourceCounts(summaries) {
  const counts = { cli: 0, desktop: 0, cowork: 0 };
  for (const s of summaries) counts[s.source]++;
  return counts;
}

export function entriesBySession(entries) {
  const map = new Map();
  for (const e of entries) {
    const id = e.sessionId || '';
    const list = map.get(id);
    if (list) list.push(e);
    else map.set(id, [e]);
  }
  return map;
}

export function agentTypeTotals(entries, markup) {
  return groupTotals(entries, (e) => e.agentType || 'main', markup);
}

export function subagentShare(entries, markup) {
  const all = totals(entries, markup).final;
  const sub = totals(entries.filter((e) => !isMainAgent(e)), markup).final;
  return all > 0 ? sub / all : null;
}

export function subagentSessionCount(summaries) {
  return summaries.filter((s) => [...s.agents.keys()].some((k) => k !== 'main')).length;
}

export function shareSeries(entries, range, markup) {
  const options = { from: range.from, to: range.to, view: range.view, markup };
  const main = bucketize(entries.filter(isMainAgent), options);
  const sub = bucketize(entries.filter((e) => !isMainAgent(e)), options);
  return {
    keys: main.keys,
    main: main.keys.map((k) => main.byKey.get(k).final),
    sub: main.keys.map((k) => sub.byKey.get(k).final),
  };
}

export function perBucketSeries(entries, range, markup) {
  const { keys, byKey } = bucketize(entries, { from: range.from, to: range.to, view: range.view, markup });
  return {
    keys,
    sessions: keys.map((k) => byKey.get(k).sessions),
    average: keys.map((k) => {
      const b = byKey.get(k);
      return b.sessions > 0 ? b.final / b.sessions : null;
    }),
  };
}
