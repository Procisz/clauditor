const SEL = '.fit-value';
const MIN_SCALE = 0.45;
const ONE_LINE_FLOOR = 0.72;
const SAFETY = 0.995;
const SEARCH_STEPS = 5;
const NUDGE_STEPS = 3;

const round = (v) => Math.round(v * 1000) / 1000;

function lineHeightOf(el) {
  const cs = getComputedStyle(el);
  const lh = Number.parseFloat(cs.lineHeight);
  if (Number.isFinite(lh)) return lh;
  return Number.parseFloat(cs.fontSize) * 1.2;
}

function setScale(el, scale) {
  if (scale >= 1) el.style.removeProperty('--fit');
  else el.style.setProperty('--fit', String(round(scale)));
}

function setMode(el, mode) {
  if (mode) el.dataset.fitWrap = mode;
  else delete el.dataset.fitWrap;
}

const fitsWidth = (el) => el.scrollWidth <= el.clientWidth + 1;

function fitsBox(el, lines) {
  return fitsWidth(el) && el.scrollHeight <= lineHeightOf(el) * lines + 1;
}

function shrinkOneLine(el, ratio, floor) {
  setMode(el, 'off');
  let scale = Math.max(floor, ratio * SAFETY);
  setScale(el, scale);
  for (let i = 0; i < NUDGE_STEPS && !fitsWidth(el); i++) {
    scale = Math.max(floor, scale * (el.clientWidth / el.scrollWidth) * SAFETY);
    setScale(el, scale);
  }
  return fitsWidth(el);
}

function searchWrapped(el, lines) {
  setScale(el, 1);
  if (fitsBox(el, lines)) return true;
  let lo = MIN_SCALE;
  let hi = 1;
  let best = null;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    setScale(el, mid);
    if (fitsBox(el, lines)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (best == null) return false;
  setScale(el, best);
  return true;
}

function fitOne(el) {
  setScale(el, 1);
  setMode(el, null);
  const avail = el.clientWidth;
  if (!avail) return;

  setMode(el, 'off');
  const need = el.scrollWidth;
  if (need <= avail + 1) {
    setMode(el, null);
    return;
  }

  const ratio = avail / need;
  if (ratio >= ONE_LINE_FLOOR && shrinkOneLine(el, ratio, ONE_LINE_FLOOR)) return;

  const lines = Number(el.dataset.fitLines) || 2;
  setMode(el, null);
  setScale(el, 1);
  const breakable = el.scrollHeight > lineHeightOf(el) * 1.5;

  if (breakable) {
    for (let extra = 0; extra <= 2; extra++) if (searchWrapped(el, lines + extra)) return;
  }

  if (shrinkOneLine(el, ratio, MIN_SCALE)) return;

  setMode(el, 'break');
  setScale(el, 1);
  for (let extra = 0; extra <= 2; extra++) if (searchWrapped(el, lines + extra)) return;
  setScale(el, MIN_SCALE);
}

export function fitValues(root) {
  const scope = root ?? document;
  const els = scope.querySelectorAll ? scope.querySelectorAll(SEL) : [];
  for (const el of els) fitOne(el);
}

let frame = null;

export function scheduleFit(root) {
  if (frame != null) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = null;
    fitValues(root);
  });
}

let timer = null;

export function watchFit(getRoots) {
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const root of getRoots()) if (root) fitValues(root);
    }, 120);
  });
}
