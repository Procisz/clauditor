import { icon } from './icons.js';
import { asVar, destroyChartsIn } from './charts.js';
import { esc } from './dom.js';
import { fitValues } from './fit.js';
import { t } from '../i18n/index.js';

let dialogEl = null;
let boxEl = null;

function ensureDialog() {
  if (dialogEl?.isConnected) return;
  dialogEl = document.createElement('dialog');
  dialogEl.className = 'modal';
  boxEl = document.createElement('div');
  boxEl.className = 'modal-box';
  dialogEl.appendChild(boxEl);
  dialogEl.setAttribute('aria-labelledby', 'modal-title');
  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) dialogEl.close();
  });
  dialogEl.addEventListener('close', () => destroyChartsIn(boxEl));
  document.body.appendChild(dialogEl);
}

export function openModal({ title, sub = '', badges = [], bodyHtml, color = '' }) {
  ensureDialog();
  destroyChartsIn(boxEl);
  if (color) {
    boxEl.dataset.accent = '';
    boxEl.style.setProperty('--c', color);
  } else {
    delete boxEl.dataset.accent;
    boxEl.style.removeProperty('--c');
  }
  const chips = badges.filter(Boolean);
  boxEl.innerHTML = `
    <div class="modal-head">
      <div>
        <h2 class="modal-title" id="modal-title">${esc(title)}</h2>
        ${sub || chips.length
          ? `<div class="modal-sub">
              ${sub ? `<span>${esc(sub)}</span>` : ''}
              ${chips.join('')}
            </div>`
          : ''}
      </div>
      <button type="button" class="icon-btn" data-modal-close aria-label="${esc(t('common.close'))}">${icon('i-x')}</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>`;
  boxEl.querySelector('[data-modal-close]').onclick = () => dialogEl.close();
  if (!dialogEl.open) dialogEl.showModal();
  fitValues(boxEl);
  return boxEl;
}

export function closeModal() {
  dialogEl?.close();
}

export const modalSection = (title, html, cls = '') =>
  `<div class="modal-section${cls ? ` ${cls}` : ''}"><h3 class="modal-section-title">${esc(title)}</h3>${html}</div>`;

export const modalGrid = (items) =>
  `<div class="modal-grid">${items
    .filter((i) => i)
    .map((i) => `<div class="modal-item"><span class="k">${esc(i.k)}</span><span class="v">${i.html ?? esc(String(i.v ?? '-'))}</span></div>`)
    .join('')}</div>`;

export function modalStat({ label, value, sub = '', color = '', iconId = '' }) {
  return `<div class="mstat"${color ? ` style="--c:${esc(color)}"` : ''}>
    <div class="mstat-head">
      <span class="mstat-label">${esc(label)}</span>
      ${iconId ? `<span class="mstat-icon">${icon(iconId)}</span>` : ''}
    </div>
    <div class="mstat-value fit-value">${value}</div>
    ${sub ? `<div class="mstat-sub">${sub}</div>` : ''}
  </div>`;
}

export const modalStatRow = (cards) => `<div class="mstat-row">${cards.filter(Boolean).join('')}</div>`;

export function modalBadge(text, tone = 'neutral') {
  return `<span class="mbadge" data-tone="${esc(tone)}">${esc(text)}</span>`;
}

export function modalBar(parts) {
  const total = parts.reduce((sum, p) => sum + (p.value || 0), 0);
  if (!total) return '';
  return `<div class="mbar-wrap">
    <div class="mbar">${parts.filter((p) => p.value > 0).map((p) => `
      <span class="mbar-seg" style="width:${(p.value / total) * 100}%;background:${esc(asVar(p.color))}"
        title="${esc(p.label)}"></span>`).join('')}
    </div>
    <div class="mbar-legend">${parts.map((p) => `
      <span class="mbar-item"><span class="mbar-dot" style="background:${esc(asVar(p.color))}"></span>${esc(p.label)}${p.note ? ` <span class="muted">${esc(p.note)}</span>` : ''}</span>`).join('')}
    </div>
  </div>`;
}

export const modalMeta = (items) =>
  `<div class="mmeta">${items.filter(Boolean).map((i) =>
    `<div class="mmeta-item"><span class="k">${esc(i.k)}</span><span class="v">${i.html ?? esc(String(i.v ?? '-'))}</span></div>`).join('')}</div>`;
