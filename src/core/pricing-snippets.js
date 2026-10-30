import { RATE_KEYS } from './config.js';

export function suggestKey(model) {
  const m = (model || '').toLowerCase();
  const at = m.lastIndexOf('claude-');
  if (at === -1) return null;
  const key = m.slice(at + 7)
    .replace(/\[.*$/, '')
    .replace(/-v\d+(?::\d+)?$/, '')
    .replace(/[-@]2\d{7}$/, '');
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(key) ? key : null;
}

export function suggestName(key) {
  const title = s => s.charAt(0).toUpperCase() + s.slice(1);
  const modern = /^([a-z]+)-(\d+)(?:-(\d+))?$/.exec(key);
  if (modern) return `Claude ${title(modern[1])} ${modern[2]}${modern[3] ? '.' + modern[3] : ''}`;
  const legacy = /^(\d+)(?:-(\d+))?-([a-z]+)$/.exec(key);
  if (legacy) return `Claude ${title(legacy[3])} ${legacy[1]}${legacy[2] ? '.' + legacy[2] : ''}`;
  return 'Claude ' + key.split('-').map(title).join(' ');
}

export function entrySnippet(key, name, rates) {
  return [
    `\t\t"${key}": {`,
    `\t\t\t"name": "${name}",`,
    `\t\t\t"history": [`,
    `\t\t\t\t{`,
    ...RATE_KEYS.map((k, i) => `\t\t\t\t\t"${k}": ${rates[k]}${i < RATE_KEYS.length - 1 ? ',' : ''}`),
    `\t\t\t\t}`,
    `\t\t\t]`,
    `\t\t},`,
  ].join('\n');
}

export function aliasSnippet(model) {
  return `\t\t\t"aliases": ["${model}"],`;
}
