import { rebinder } from './listen.js';

let tipEl = null;
let current = null;
let pinned = false;
let lastPoint = { clientX: 0, clientY: 0 };

const HINT = '.info-dot, .info';
const PAD = 12;
const GAP = 6;

function getTip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'float-tip';
    tipEl.setAttribute('role', 'tooltip');
  }
  if (!tipEl.isConnected) document.body.appendChild(tipEl);
  return tipEl;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

function tipSize(tip) {
  return [tip.offsetWidth || 260, tip.offsetHeight || 48];
}

function place(tip, x, y, tw, th) {
  tip.style.left = `${clamp(x, PAD, innerWidth - tw - PAD)}px`;
  tip.style.top = `${clamp(y, PAD, innerHeight - th - PAD)}px`;
}

function position(e) {
  const tip = getTip();
  const [tw, th] = tipSize(tip);
  let x = e.clientX + PAD;
  let y = e.clientY + PAD;
  if (x + tw > innerWidth - PAD) x = e.clientX - tw - PAD;
  if (y + th > innerHeight - PAD) y = e.clientY - th - PAD;
  place(tip, x, y, tw, th);
}

function anchor(el) {
  const tip = getTip();
  const [tw, th] = tipSize(tip);
  const box = el.getBoundingClientRect();
  let y = box.bottom + GAP;
  if (y + th > innerHeight - PAD) y = box.top - th - GAP;
  place(tip, box.left, y, tw, th);
}

function hide() {
  current = null;
  pinned = false;
  tipEl?.classList.remove('is-open');
}

function showFor(el, point) {
  current = el;
  const tip = getTip();
  tip.textContent = el.dataset.tip;
  if (point) position(point);
  else anchor(el);
  tip.classList.add('is-open');
}

function onOver(e) {
  const el = e.target.closest?.('[data-tip]');
  if (el === current) return;
  if (!el || !el.dataset.tip) {
    hide();
    return;
  }
  pinned = false;
  lastPoint = { clientX: e.clientX, clientY: e.clientY };
  showFor(el, lastPoint);
}

function onMove(e) {
  lastPoint = { clientX: e.clientX, clientY: e.clientY };
  if (current && !pinned) position(e);
}

function onFocusIn(e) {
  const el = e.target.closest?.('[data-tip]');
  if (el?.dataset.tip) showFor(el);
  else hide();
}

function onKey(e) {
  if (e.key === 'Escape') hide();
}

function onClick(e) {
  const el = e.target.closest?.('[data-tip]');
  if (el?.dataset.tip && el.matches(HINT)) {
    if (pinned && current === el) hide();
    else {
      showFor(el);
      pinned = true;
    }
    return;
  }
  hide();
}

const bind = rebinder();
let capturing = [];

function bindCapturing(entries) {
  for (const [target, type, fn] of capturing) target.removeEventListener(type, fn, true);
  for (const [target, type, fn] of entries) target.addEventListener(type, fn, true);
  capturing = entries;
}

export function initTooltips() {
  bind([
    [document, 'mouseover', onOver],
    [document, 'mousemove', onMove],
    [document, 'mouseleave', hide],
    [window, 'resize', hide],
    [document, 'focusin', onFocusIn],
    [document, 'focusout', hide],
    [document, 'keydown', onKey],
  ]);
  bindCapturing([
    [document, 'scroll', hide],
    [document, 'click', onClick],
  ]);
}

export function refreshTip(el) {
  if (!el?.dataset.tip || !el.matches(':hover')) return;
  showFor(el, lastPoint);
}
