import { icon } from './icons.js';
import { fmtFixed, shortModelName } from '../core/utils.js';
import { t } from '../i18n/index.js';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function tipDot(tip) {
  return tip ? `<button type="button" class="info-dot" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${icon('i-info')}</button>` : '';
}

const accentAttrs = (color) => (color ? ` data-accent style="--c:${esc(color)}"` : '');

export function statCard({ color = '', iconId = '', label, value, foot = '', spark = '', tip = '' }) {
  return `<div class="stat"${accentAttrs(color)}>
    <div class="row-between">
      <span class="stat-label">${esc(label)}${tipDot(tip)}</span>
      ${iconId ? `<span class="icon-chip">${icon(iconId)}</span>` : ''}
    </div>
    <span class="stat-value fit-value">${value}</span>
    ${foot ? `<span class="stat-foot">${foot}</span>` : ''}
    ${spark}
  </div>`;
}

export function chartCard({ span = 6, color = '', iconId = '', title, sub = '', id, tip = '', actions = '' }) {
  return `<div class="card" data-span="${span}"${accentAttrs(color)}>
    <div class="card-head">
      ${iconId ? `<span class="icon-chip">${icon(iconId)}</span>` : ''}
      <div>
        <h2 class="card-title">${esc(title)}${tipDot(tip)}</h2>
        ${sub ? `<div class="card-sub">${sub}</div>` : ''}
      </div>
      ${actions ? `<div class="card-actions">${actions}</div>` : ''}
    </div>
    <div class="card-body tight" id="${esc(id)}"></div>
  </div>`;
}

export function emptyState({ span = 12, iconId = 'i-info', title = '', message = t('common.noData'), hint = '' } = {}) {
  return `<div class="card" data-span="${span}">
    <div class="card-body empty-state">
      <span class="icon-chip">${icon(iconId)}</span>
      <div>
        ${title ? `<strong>${esc(title)}</strong><br>` : ''}
        <span class="muted">${esc(message)}</span>
        ${hint ? `<div class="faint small">${esc(hint)}</div>` : ''}
      </div>
    </div>
  </div>`;
}

export function deltaChip(pct, { goodWhenDown = false } = {}) {
  if (pct == null || !Number.isFinite(pct)) return '';
  const percent = pct * 100;
  const rounded = Number(Math.abs(percent).toFixed(1));
  if (rounded === 0) return `<span class="delta" data-dir="flat">${fmtFixed(0, 1)}%</span>`;
  const up = percent > 0;
  const good = goodWhenDown ? !up : up;
  return `<span class="delta" data-dir="${good ? 'up' : 'down'}">${icon(up ? 'i-trend-up' : 'i-trend-down')}${up ? '+' : '-'}${fmtFixed(rounded, 1)}%</span>`;
}

const MODEL_TONES = ['fable', 'mythos', 'opus', 'sonnet', 'haiku'];

export function modelTone(model) {
  const m = String(model ?? '').toLowerCase();
  return MODEL_TONES.find((tone) => m.includes(tone)) ?? 'other';
}

export function modelBadge(model) {
  return `<span class="badge" data-model="${modelTone(model)}" title="${esc(model)}">${esc(shortModelName(model))}</span>`;
}
