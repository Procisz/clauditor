import { entryCost, entryCostByType, cacheWrite1h, cacheWrite5m } from '../../core/config.js';
import { shiftDay } from '../../core/dates.js';
import {
  bucketKeyOf, bucketize, cacheHitRate, cacheSavings, costByTokenType, groupTotals, hourly, pctChange, totals,
} from '../../core/metrics.js';
import { calcSessionTime } from '../../core/utils.js';
import { previousMonthKey } from './format.js';

const pad = (n) => String(n).padStart(2, '0');

export const TOKEN_TYPES = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];

export const TOKEN_TOKENS = {
  input: '--c-input',
  output: '--c-output',
  cacheWrite5m: '--c-cache-write',
  cacheWrite1h: '--c-cache-write-1h',
  cacheRead: '--c-cache-read',
};

export function dayCosts(entries, markup) {
  const map = new Map();
  for (const e of entries) {
    if (!e.date) continue;
    map.set(e.date, (map.get(e.date) ?? 0) + entryCost(e) * markup);
  }
  return map;
}

const lastDays = (costs, today, count) =>
  Array.from({ length: count }, (_, i) => costs.get(shiftDay(today, -(count - 1 - i))) ?? 0);

const monthDays = (costs, today) => {
  const month = today.slice(0, 7);
  return Array.from({ length: Number(today.slice(8, 10)) }, (_, i) => costs.get(`${month}-${pad(i + 1)}`) ?? 0);
};

export function costSummary(allEntries, today, markup) {
  const weekStart = shiftDay(today, -6);
  const month = today.slice(0, 7);
  const monthEntries = [];
  const weekEntries = [];
  const todayEntries = [];
  for (const e of allEntries) {
    if (!e.date) continue;
    if (e.date.startsWith(month)) monthEntries.push(e);
    if (e.date >= weekStart) weekEntries.push(e);
    if (e.date === today) todayEntries.push(e);
  }
  const costs = dayCosts(allEntries, markup);
  let maxDay = '';
  let maxFinal = 0;
  for (const [date, final] of costs) {
    if (final > maxFinal) {
      maxFinal = final;
      maxDay = date;
    }
  }
  return {
    all: totals(allEntries, markup),
    month: totals(monthEntries, markup),
    week: totals(weekEntries, markup),
    today: totals(todayEntries, markup),
    sessionTime: {
      all: calcSessionTime(allEntries),
      month: calcSessionTime(monthEntries),
      week: calcSessionTime(weekEntries),
      today: calcSessionTime(todayEntries),
    },
    sparks: {
      all: lastDays(costs, today, 14),
      month: monthDays(costs, today),
      week: lastDays(costs, today, 7),
      today: hourly(todayEntries, markup),
    },
    maxDay: maxDay ? { date: maxDay, final: maxFinal } : null,
  };
}

export function bucketGroups(entries, range, markup) {
  const { keys } = bucketize(entries, { from: range.from, to: range.to, view: range.view, markup });
  const groups = new Map(keys.map((key) => [key, []]));
  for (const e of entries) {
    if (e.date) groups.get(bucketKeyOf(e.date, range.view))?.push(e);
  }
  return { keys, groups };
}

export function tokenCostSeries(entries, range, markup) {
  const { keys, groups } = bucketGroups(entries, range, markup);
  const costs = keys.map((key) => costByTokenType(groups.get(key), markup));
  return { keys, series: Object.fromEntries(TOKEN_TYPES.map((type) => [type, costs.map((c) => c[type])])) };
}

export function cacheSeries(entries, range, markup) {
  const { keys, groups } = bucketGroups(entries, range, markup);
  return {
    keys,
    savings: keys.map((key) => cacheSavings(groups.get(key), markup)),
    hitRate: keys.map((key) => {
      const rate = cacheHitRate(totals(groups.get(key)));
      return rate == null ? null : rate * 100;
    }),
  };
}

export function monthlyRows(allEntries, markup) {
  const groups = groupTotals(allEntries.filter((e) => e.date), (e) => e.date.slice(0, 7), markup);
  const byMonth = new Map(groups.map((g) => [g.key, g]));
  return groups.map((g) => {
    const before = byMonth.get(previousMonthKey(g.key));
    return { ...g, change: before ? pctChange(g.final, before.final) : null };
  });
}

export function tokenUsage(entries, markup) {
  const tokens = Object.fromEntries(TOKEN_TYPES.map((type) => [type, 0]));
  const cost = Object.fromEntries(TOKEN_TYPES.map((type) => [type, 0]));
  for (const e of entries) {
    tokens.input += e.input || 0;
    tokens.output += e.output || 0;
    tokens.cacheWrite5m += cacheWrite5m(e);
    tokens.cacheWrite1h += cacheWrite1h(e);
    tokens.cacheRead += e.cacheRead || 0;
    const byType = entryCostByType(e);
    for (const type of TOKEN_TYPES) cost[type] += byType[type] * markup;
  }
  const totalTokens = TOKEN_TYPES.reduce((sum, type) => sum + tokens[type], 0);
  const totalCost = TOKEN_TYPES.reduce((sum, type) => sum + cost[type], 0);
  const rows = TOKEN_TYPES
    .map((type) => ({ type, tokens: tokens[type], cost: cost[type] }))
    .sort((a, b) => b.cost - a.cost);
  return { rows, totalTokens, totalCost, calls: entries.length };
}
