import { bucketize } from '../../core/metrics.js';
import { shortModelName } from '../../core/utils.js';
import { cssToken } from '../../ui/charts.js';
import { modelTone } from '../../ui/dom.js';
import { rampColor } from '../../ui/ramp.js';

export function modelLabels(models) {
  const shorts = models.map(shortModelName);
  return models.map((model, i) => (shorts.filter((s) => s === shorts[i]).length > 1 ? model : shorts[i]));
}

export function modelColors(models) {
  const used = new Set();
  return models.map((model, i) => {
    const tone = modelTone(model);
    if (!used.has(tone)) {
      used.add(tone);
      const value = cssToken(`--m-${tone}`);
      if (value) return value;
    }
    return rampColor(i, models.length);
  });
}

export function groupEntries(entries, keyFn) {
  const groups = new Map();
  for (const e of entries) {
    const key = keyFn(e);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return groups;
}

export function bucketSeries(groups, ctx, entries = ctx.entries) {
  const { from, to, view } = ctx.range;
  const { keys } = bucketize(entries, { from, to, view, markup: ctx.markup });
  return {
    keys,
    series: groups.map(({ name, entries: own }) => {
      const { byKey } = bucketize(own, { from: keys[0], to: keys.at(-1), view, markup: ctx.markup });
      return { name, data: keys.map((k) => byKey.get(k)?.final ?? 0) };
    }),
  };
}

export const bucketAxis = (keys) => ({
  categories: keys,
  tickAmount: Math.min(keys.length, 10),
  labels: { hideOverlappingLabels: true, rotate: 0 },
});
