import { EVENTS, emit } from '../app/events.js';
import messages from './messages/index.js';

export const LANGS = Object.freeze([
  Object.freeze({ id: 'en', name: 'English', locale: 'en-US' }),
  Object.freeze({ id: 'hu', name: 'Magyar', locale: 'hu-HU' }),
]);

const STORAGE_KEY = 'clauditor_lang';
const DEFAULT_LANG = 'en';

let lang = DEFAULT_LANG;
let pluralRules = null;
let pluralLocale = '';

const isLang = (id) => LANGS.some((l) => l.id === id);

export const getLang = () => lang;

export const getLocale = () => LANGS.find((l) => l.id === lang).locale;

function lookup(key) {
  for (const id of [lang, DEFAULT_LANG]) {
    const dict = messages[id];
    if (dict && Object.hasOwn(dict, key)) return dict[key];
  }
  return undefined;
}

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}

export function t(key, params) {
  const text = lookup(key);
  return text === undefined ? key : interpolate(text, params);
}

export function tn(key, count, params) {
  const locale = getLocale();
  if (!pluralRules || pluralLocale !== locale) {
    pluralRules = new Intl.PluralRules(locale);
    pluralLocale = locale;
  }
  const form = pluralRules.select(count) === 'one' ? 'one' : 'other';
  const text = lookup(`${key}.${form}`) ?? lookup(`${key}.other`);
  if (text === undefined) return key;
  return interpolate(text, { ...params, count });
}

export function setLang(id) {
  if (!isLang(id)) return;
  const changed = id !== lang;
  lang = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
  document.documentElement.lang = id;
  if (changed) emit(EVENTS.lang, { lang: id });
}

export function initLang() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {}
  lang = isLang(stored) ? stored : DEFAULT_LANG;
  document.documentElement.lang = lang;
}

export function applyStaticTexts(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
      const at = pair.indexOf(':');
      if (at < 1) continue;
      const name = pair.slice(0, at).trim();
      const key = pair.slice(at + 1).trim();
      if (name && key) el.setAttribute(name, t(key));
    }
  }
}
