import { EVENTS, emit } from './events.js';
import { DARK_THEMES, DEFAULT_DARK, DEFAULT_LIGHT, LIGHT_THEMES } from './themes.js';

const MODE_KEY = 'clauditor_theme';
const LIGHT_KEY = 'clauditor_theme_light';
const DARK_KEY = 'clauditor_theme_dark';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const MODES = ['light', 'dark', 'auto'];
const LEGACY_MODES = { winter: 'light', dracula: 'dark' };
const DEFAULT_MODE = 'light';
const WIDTH_KEY = 'clauditor_width';
export const WIDTHS = Object.freeze(['narrow', 'normal', 'wide', 'full']);
export const DEFAULT_WIDTH = 'normal';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

const systemPrefersDark = () => matchMedia(DARK_QUERY).matches;

function known(list, id, fallback) {
  return list.some((theme) => theme.id === id) ? id : fallback;
}

export function currentMode() {
  const stored = read(MODE_KEY);
  if (MODES.includes(stored)) return stored;
  return LEGACY_MODES[stored] ?? DEFAULT_MODE;
}

export function currentLight() {
  return known(LIGHT_THEMES, read(LIGHT_KEY), DEFAULT_LIGHT);
}

export function currentDark() {
  return known(DARK_THEMES, read(DARK_KEY), DEFAULT_DARK);
}

export function currentWidth() {
  const stored = read(WIDTH_KEY);
  return WIDTHS.includes(stored) ? stored : DEFAULT_WIDTH;
}

export function isDark() {
  const set = document.documentElement.dataset.theme;
  if (set === 'dark' || set === 'light') return set === 'dark';
  const mode = currentMode();
  return mode === 'auto' ? systemPrefersDark() : mode === 'dark';
}

function sync() {
  const html = document.documentElement;
  const mode = currentMode();
  const dark = mode === 'auto' ? systemPrefersDark() : mode === 'dark';
  html.dataset.theme = dark ? 'dark' : 'light';
  if (mode === 'auto') html.dataset.themeAuto = '1';
  else delete html.dataset.themeAuto;
  html.dataset.light = currentLight();
  html.dataset.dark = currentDark();
  html.dataset.width = currentWidth();
}

function apply() {
  sync();
  emit(EVENTS.theme, { mode: currentMode(), isDark: isDark(), light: currentLight(), dark: currentDark() });
}

export function setMode(mode) {
  write(MODE_KEY, MODES.includes(mode) ? mode : (LEGACY_MODES[mode] ?? DEFAULT_MODE));
  apply();
}

export function setLight(id) {
  write(LIGHT_KEY, known(LIGHT_THEMES, id, DEFAULT_LIGHT));
  apply();
}

export function setDark(id) {
  write(DARK_KEY, known(DARK_THEMES, id, DEFAULT_DARK));
  apply();
}

export function setWidth(id) {
  write(WIDTH_KEY, WIDTHS.includes(id) ? id : DEFAULT_WIDTH);
  document.documentElement.dataset.width = currentWidth();
  window.dispatchEvent(new Event('resize'));
}

function onSchemeChange() {
  if (currentMode() === 'auto') apply();
}

let watched = null;

export function initAppearance() {
  sync();
  const query = matchMedia(DARK_QUERY);
  if (watched === query) return;
  watched?.removeEventListener('change', onSchemeChange);
  query.addEventListener('change', onSchemeChange);
  watched = query;
}
