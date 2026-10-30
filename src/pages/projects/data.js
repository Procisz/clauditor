import { groupTotals } from '../../core/metrics.js';
import { projectKey, projectName, shortPath } from '../../core/utils.js';
import { t } from '../../i18n/index.js';

export const isCowork = (key) => key.startsWith('cowork:');

export function projectTip(key) {
  if (isCowork(key)) return t('projects.coworkTask');
  if (key === '(unknown)') return projectName(key);
  return shortPath(key);
}

export function projectLabels(keys) {
  const names = keys.map(projectName);
  const seen = new Map();
  return names.map((name, i) => {
    const total = names.filter((n) => n === name).length;
    if (total === 1) return name;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return isCowork(keys[i]) ? `${name} (${count})` : shortPath(keys[i]);
  });
}

export function projectStats(entries, markup) {
  const lastActive = new Map();
  for (const e of entries) {
    if (!e.ts) continue;
    const key = projectKey(e);
    if (!lastActive.has(key) || e.ts > lastActive.get(key)) lastActive.set(key, e.ts);
  }
  return groupTotals(entries, projectKey, markup).map((g) => ({ ...g, lastActive: lastActive.get(g.key) ?? '' }));
}
