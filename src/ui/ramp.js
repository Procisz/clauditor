import { EVENTS } from '../app/events.js';
import { rebinder } from './listen.js';

const FALLBACK = { l: 0.58, c: 0.13, h: 250 };
const GOLDEN_ANGLE = 137.508;
const GOLDEN_FRACTION = 0.381966;

const L_SHIFT = [-0.03, 0.03, -0.03, 0.03];
const C_SHIFT = [0.018, 0.018, -0.018, -0.018];

const bySize = new Map();
const slots = new Map();

let signature = null;
let basis = null;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function themeSignature() {
  try {
    const d = document.documentElement.dataset;
    return `${d.theme ?? ''}|${d.light ?? ''}|${d.dark ?? ''}`;
  } catch {
    return '';
  }
}

function readVar(name, fallback, pctScale) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return fallback;
    return raw.endsWith('%') ? (n / 100) * pctScale : n;
  } catch {
    return fallback;
  }
}

function base() {
  const sig = themeSignature();
  if (basis && sig === signature) return basis;
  signature = sig;
  bySize.clear();
  slots.clear();
  basis = {
    l: clamp(readVar('--ramp-l', FALLBACK.l, 1), 0.2, 0.95),
    c: clamp(readVar('--ramp-c', FALLBACK.c, 0.4), 0, 0.37),
    h: readVar('--ramp-h', FALLBACK.h, 360),
  };
  return basis;
}

export function resetRamp() {
  signature = null;
  basis = null;
  bySize.clear();
  slots.clear();
}

function normalizeCount(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
}

function gcd(a, b) {
  let x = a;
  let y = b;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

const strides = new Map();

function strideFor(n) {
  if (n < 3) return 1;
  const cached = strides.get(n);
  if (cached) return cached;
  const target = Math.round(n * GOLDEN_FRACTION);
  let found = 1;
  for (let d = 0; d < n && found === 1; d++) {
    for (const cand of [target + d, target - d]) {
      if (cand >= 1 && cand < n && gcd(cand, n) === 1) {
        found = cand;
        break;
      }
    }
  }
  strides.set(n, found);
  return found;
}

function hueAt(i, n, start) {
  if (n === 1) return start;
  if (n > 1) {
    const k = ((i % n) + n) % n;
    const slot = (k * strideFor(n)) % n;
    return start + slot * (360 / n);
  }
  return start + i * GOLDEN_ANGLE;
}

function build(i, n) {
  const b = base();
  const hue = (((hueAt(i, n, b.h) % 360) + 360) % 360);
  const phase = i % 4;
  const l = clamp(b.l + L_SHIFT[phase], 0.3, 0.9);
  const c = clamp(b.c + C_SHIFT[phase], 0.02, 0.32);
  return `oklch(${round(l, 3)} ${round(c, 3)} ${round(hue, 1)})`;
}

export function rampColor(i, n) {
  ensureBound();
  const idx = Math.max(0, Math.trunc(Number(i)) || 0);
  const count = normalizeCount(n);
  base();
  const key = count ? `n${count}` : 'open';
  let list = bySize.get(key);
  if (!list) {
    list = [];
    bySize.set(key, list);
  }
  let color = list[idx];
  if (color) return color;
  color = build(idx, count);
  list[idx] = color;
  if (!slots.has(color)) slots.set(color, { i: idx, n: count });
  return color;
}

export function seriesColors(n) {
  const count = normalizeCount(n);
  if (!count) return [];
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = rampColor(i, count);
  return out;
}

export function rampSlot(value) {
  const key = String(value ?? '').trim();
  if (!key) return null;
  base();
  return slots.get(key) ?? null;
}

const bindEvents = rebinder();

let wired = false;

function ensureBound() {
  if (wired) return;
  wired = true;
  initRamp();
}

export function initRamp() {
  bindEvents([
    [document, EVENTS.theme, resetRamp],
    [document, EVENTS.rerender, resetRamp],
  ]);
}
