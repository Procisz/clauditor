import { afterEach, beforeEach, vi } from 'vitest';
import { initLang } from '../src/i18n/index.js';
import { FIXED_NOW, installPolyfills, resetMedia } from './helpers/env.js';

process.env.TZ = 'Europe/Budapest';

installPolyfills();

function resetDocument() {
  const html = document.documentElement;
  for (const attr of [...html.attributes]) html.removeAttribute(attr.name);
  html.lang = 'en';
  document.head.querySelectorAll('style, script, link').forEach((n) => n.remove());
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  document.body.removeAttribute('class');
  history.replaceState(null, '', '/');
}

beforeEach(() => {
  vi.setSystemTime(FIXED_NOW);
  localStorage.clear();
  sessionStorage.clear();
  resetMedia();
  resetDocument();
  initLang();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});
