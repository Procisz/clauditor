import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGS, applyStaticTexts, getLang, getLocale, initLang, setLang, t, tn } from '../../../src/i18n/index.js';
import messages from '../../../src/i18n/messages/index.js';
import common from '../../../src/i18n/messages/common.js';
import shell from '../../../src/i18n/messages/shell.js';
import start from '../../../src/i18n/messages/start.js';
import settings from '../../../src/i18n/messages/settings.js';
import themes from '../../../src/i18n/messages/themes.js';
import pricing from '../../../src/i18n/messages/pricing.js';
import components from '../../../src/i18n/messages/components.js';
import overview from '../../../src/i18n/messages/overview.js';
import today from '../../../src/i18n/messages/today.js';
import models from '../../../src/i18n/messages/models.js';
import projects from '../../../src/i18n/messages/projects.js';
import sessions from '../../../src/i18n/messages/sessions.js';
import costs from '../../../src/i18n/messages/costs.js';
import { EVENTS } from '../../../src/app/events.js';

const PREFIXES = { shell: ['shell.', 'nav.'] };
const AREAS = { common, shell, start, settings, themes, pricing, components, overview, today, models, projects, sessions, costs };

beforeEach(() => {
  initLang();
});

describe('language selection', () => {
  it('defaults to English with the en-US locale', () => {
    expect(getLang()).toBe('en');
    expect(getLocale()).toBe('en-US');
    expect(document.documentElement.lang).toBe('en');
  });

  it('lists English and Hungarian', () => {
    expect(LANGS.map((l) => [l.id, l.name, l.locale])).toEqual([
      ['en', 'English', 'en-US'],
      ['hu', 'Magyar', 'hu-HU'],
    ]);
  });

  it('starts in the stored language', () => {
    localStorage.setItem('clauditor_lang', 'hu');
    initLang();
    expect(getLang()).toBe('hu');
    expect(getLocale()).toBe('hu-HU');
    expect(document.documentElement.lang).toBe('hu');
  });

  it('ignores a stored language it does not know', () => {
    localStorage.setItem('clauditor_lang', 'de');
    initLang();
    expect(getLang()).toBe('en');
  });

  it('saves the choice and sets the html lang', () => {
    setLang('hu');
    expect(getLang()).toBe('hu');
    expect(localStorage.getItem('clauditor_lang')).toBe('hu');
    expect(document.documentElement.lang).toBe('hu');
  });

  it('ignores an unknown language id', () => {
    setLang('de');
    expect(getLang()).toBe('en');
    expect(localStorage.getItem('clauditor_lang')).toBeNull();
  });

  it('emits the language change event with the new id', () => {
    const seen = vi.fn();
    document.addEventListener(EVENTS.lang, (e) => seen(e.detail));
    setLang('hu');
    expect(seen).toHaveBeenCalledWith({ lang: 'hu' });
  });

  it('does not emit when the language stays the same', () => {
    const seen = vi.fn();
    document.addEventListener(EVENTS.lang, seen);
    setLang('en');
    expect(seen).not.toHaveBeenCalled();
  });

  it('does not emit for an unknown id', () => {
    const seen = vi.fn();
    document.addEventListener(EVENTS.lang, seen);
    setLang('xx');
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('t', () => {
  it('translates into the current language', () => {
    expect(t('common.noData')).toBe('No data');
    setLang('hu');
    expect(t('common.noData')).toBe('Nincs adat');
  });

  it('returns the key itself for an unknown key', () => {
    expect(t('nope.missing')).toBe('nope.missing');
  });

  it('falls back to English when the current language lacks the key', () => {
    const key = 'test.onlyEnglish';
    messages.en[key] = 'English only {name}';
    try {
      setLang('hu');
      expect(Object.hasOwn(messages.hu, key)).toBe(false);
      expect(t(key, { name: 'x' })).toBe('English only x');
    } finally {
      delete messages.en[key];
    }
  });

  it('fills placeholders from params', () => {
    expect(t('common.ofTotal', { from: 1, to: 5, total: 12 })).toBe('1-5 of 12');
  });

  it('leaves a placeholder without a param untouched', () => {
    expect(t('common.ofTotal', { from: 1 })).toBe('1-{to} of {total}');
  });

  it('keeps a zero param value', () => {
    expect(t('common.ofTotal', { from: 0, to: 0, total: 0 })).toBe('0-0 of 0');
  });
});

describe('tn', () => {
  it('picks the one form for 1 and the other form otherwise in English', () => {
    expect(tn('start.files', 1)).toBe('1 file');
    expect(tn('start.files', 0)).toBe('0 files');
    expect(tn('start.files', 2)).toBe('2 files');
  });

  it('uses the plural rules of the current language', () => {
    setLang('hu');
    expect(tn('start.files', 1)).toBe('1 fájl');
    expect(tn('start.files', 3)).toBe('3 fájl');
  });

  it('returns the key when neither form exists', () => {
    expect(tn('nope.items', 2)).toBe('nope.items');
  });
});

describe('applyStaticTexts', () => {
  it('sets the text content of data-i18n elements', () => {
    document.body.innerHTML = '<span id="a" data-i18n="common.close">x</span>';
    applyStaticTexts(document);
    expect(document.getElementById('a').textContent).toBe('Close');
  });

  it('sets several attributes from data-i18n-attr', () => {
    document.body.innerHTML = '<button id="b" data-i18n-attr="aria-label:common.close;title:common.search"></button>';
    applyStaticTexts(document);
    const b = document.getElementById('b');
    expect(b.getAttribute('aria-label')).toBe('Close');
    expect(b.getAttribute('title')).toBe('Search');
  });

  it('follows the language and only touches the given root', () => {
    document.body.innerHTML = '<div id="in"><span data-i18n="common.close"></span></div><span id="out" data-i18n="common.close">keep</span>';
    setLang('hu');
    applyStaticTexts(document.getElementById('in'));
    expect(document.querySelector('#in span').textContent).toBe('Bezárás');
    expect(document.getElementById('out').textContent).toBe('keep');
  });

  it('shows the key for an unknown data-i18n key', () => {
    document.body.innerHTML = '<span id="c" data-i18n="nope.key"></span>';
    applyStaticTexts(document);
    expect(document.getElementById('c').textContent).toBe('nope.key');
  });
});

describe('dictionaries', () => {
  const areaNames = Object.keys(AREAS);

  it('has the 13 areas', () => {
    expect(areaNames).toHaveLength(13);
  });

  it.each(areaNames)('area %s has the same en and hu keys', (area) => {
    const en = Object.keys(AREAS[area].en).sort();
    const hu = Object.keys(AREAS[area].hu).sort();
    expect(hu).toEqual(en);
  });

  it.each(areaNames)('area %s prefixes every key with its name', (area) => {
    for (const lang of ['en', 'hu']) {
      for (const key of Object.keys(AREAS[area][lang])) {
        expect((PREFIXES[area] ?? [`${area}.`]).some((p) => key.startsWith(p)), `${lang}:${key}`).toBe(true);
      }
    }
  });

  it('has no key shared between two areas', () => {
    const seen = new Map();
    const duplicates = [];
    for (const [area, dict] of Object.entries(AREAS)) {
      for (const key of Object.keys(dict.en)) {
        if (seen.has(key)) duplicates.push(`${key} in ${seen.get(key)} and ${area}`);
        seen.set(key, area);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('has no empty translation', () => {
    for (const lang of ['en', 'hu']) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(typeof value, `${lang}:${key}`).toBe('string');
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('keeps the same placeholders in both languages', () => {
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(messages.en)) {
      expect(names(messages.hu[key]), key).toEqual(names(messages.en[key]));
    }
  });

  it('has a one and other form for every plural pair', () => {
    for (const lang of ['en', 'hu']) {
      for (const key of Object.keys(messages[lang])) {
        if (key.endsWith('.one')) expect(messages[lang][`${key.slice(0, -4)}.other`], `${lang}:${key}`).toBeTypeOf('string');
      }
    }
  });

  it('has a nav title for each of the six pages', () => {
    for (const id of ['overview', 'today', 'models', 'projects', 'sessions', 'costs']) {
      expect(messages.en[`nav.${id}`]).toBeTypeOf('string');
      expect(messages.hu[`nav.${id}`]).toBeTypeOf('string');
    }
  });
});
