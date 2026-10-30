import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../../../src/core/state.js';
import { fmtMoney, fmtFixed } from '../../../src/core/utils.js';
import { PRICE_LIST_UPDATED } from '../../../src/core/config.js';
import { getLang, initLang } from '../../../src/i18n/index.js';
import { EVENTS } from '../../../src/app/events.js';
import { openSettings } from '../../../src/app/settings.js';
import { click, input, key } from '../../helpers/dom.js';

const body = () => document.querySelector('.modal-body');
const field = (name) => body().querySelector(`[data-field="${name}"]`);
const sep = (which) => body().querySelector(`[data-sep="${which}"]`);
const pick = (value) => click(body().querySelector(`[data-pick="${value}"]`));
const tabButton = (id) => body().querySelector(`[data-tab="${id}"]`);
const panel = (id) => body().querySelector(`[data-panel="${id}"]`);

let rerenders;

beforeEach(() => {
  initLang();
  state.markup = 1;
  state.budget = 0;
  state.thousandsSep = ',';
  state.decimalSep = '.';
  state.moneyDecimals = 2;
  state.lastUpdated = null;
  state.archiveName = '';
  openSettings();
  click(tabButton('general'));
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.clear();
  rerenders = vi.fn();
  document.addEventListener(EVENTS.rerender, rerenders);
  openSettings();
});

describe('dialog', () => {
  it('opens a modal with four tabs and General first', () => {
    expect(document.querySelector('dialog').hasAttribute('open')).toBe(true);
    expect([...body().querySelectorAll('.set-nav-tab')].map((b) => b.textContent)).toEqual(['General', 'Numbers', 'Appearance', 'Data']);
    expect(tabButton('general').getAttribute('aria-selected')).toBe('true');
    expect(panel('general').hidden).toBe(false);
    expect(panel('numbers').hidden).toBe(true);
  });

  it('shows the title in the current language', () => {
    expect(document.querySelector('.modal-title').textContent).toBe('Settings');
  });
});

describe('tabs', () => {
  it('switches the panel and remembers the tab in sessionStorage', () => {
    click(tabButton('numbers'));
    expect(panel('numbers').hidden).toBe(false);
    expect(panel('general').hidden).toBe(true);
    expect(tabButton('numbers').getAttribute('aria-selected')).toBe('true');
    expect(sessionStorage.getItem('clauditor_settings_tab')).toBe('numbers');
  });

  it('opens on the remembered tab', () => {
    click(tabButton('data'));
    document.querySelector('dialog').close();
    openSettings();
    expect(tabButton('data').getAttribute('aria-selected')).toBe('true');
    expect(panel('data').hidden).toBe(false);
  });

  it('ignores an unknown remembered tab', () => {
    sessionStorage.setItem('clauditor_settings_tab', 'bogus');
    openSettings();
    expect(tabButton('general').getAttribute('aria-selected')).toBe('true');
  });

  it('moves between tabs with the arrow keys and wraps around', () => {
    key(tabButton('general'), 'ArrowRight');
    expect(tabButton('numbers').getAttribute('aria-selected')).toBe('true');
    key(tabButton('numbers'), 'ArrowLeft');
    key(tabButton('general'), 'ArrowLeft');
    expect(tabButton('data').getAttribute('aria-selected')).toBe('true');
    key(tabButton('data'), 'ArrowRight');
    expect(tabButton('general').getAttribute('aria-selected')).toBe('true');
    key(tabButton('general'), 'End');
    expect(tabButton('data').getAttribute('aria-selected')).toBe('true');
    key(tabButton('data'), 'Home');
    expect(tabButton('general').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps only the selected tab in the tab order', () => {
    click(tabButton('appearance'));
    expect(tabButton('appearance').tabIndex).toBe(0);
    expect(tabButton('general').tabIndex).toBe(-1);
  });
});

describe('markup', () => {
  it('shows the current markup', () => {
    expect(field('markup').value).toBe('1');
  });

  it('saves a decimal markup and re-renders', () => {
    input(field('markup'), '1.25');
    expect(state.markup).toBe(1.25);
    expect(localStorage.getItem('clauditor_markup')).toBe('1.25');
    expect(rerenders).toHaveBeenCalledTimes(1);
  });

  it('accepts a decimal comma', () => {
    input(field('markup'), '1,5');
    expect(state.markup).toBe(1.5);
    expect(field('markup').value).toBe('1.5');
  });

  it('falls back to 1 for 0', () => {
    input(field('markup'), '0');
    expect(state.markup).toBe(1);
    expect(localStorage.getItem('clauditor_markup')).toBe('1');
    expect(field('markup').value).toBe('1');
  });

  it('falls back to 1 for text', () => {
    input(field('markup'), 'abc');
    expect(state.markup).toBe(1);
    expect(localStorage.getItem('clauditor_markup')).toBe('1');
  });
});

describe('budget', () => {
  it('starts empty when tracking is off', () => {
    expect(field('budget').value).toBe('');
  });

  it('saves a positive budget', () => {
    input(field('budget'), '150.5');
    expect(state.budget).toBe(150.5);
    expect(localStorage.getItem('clauditor_budget')).toBe('150.5');
    expect(rerenders).toHaveBeenCalledTimes(1);
  });

  it('shows a saved budget when reopened', () => {
    state.budget = 80;
    openSettings();
    expect(field('budget').value).toBe('80');
  });

  it('turns tracking off with 0 and clears the field', () => {
    input(field('budget'), '50');
    input(field('budget'), '0');
    expect(state.budget).toBe(0);
    expect(localStorage.getItem('clauditor_budget')).toBe('0');
    expect(field('budget').value).toBe('');
  });

  it('turns tracking off for a negative number', () => {
    input(field('budget'), '-20');
    expect(state.budget).toBe(0);
    expect(localStorage.getItem('clauditor_budget')).toBe('0');
  });

  it('turns tracking off for text', () => {
    input(field('budget'), 'lots');
    expect(state.budget).toBe(0);
    expect(field('budget').value).toBe('');
  });
});

describe('decimal places', () => {
  it('saves a value and formats money with it', () => {
    input(field('decimals'), '4');
    expect(state.moneyDecimals).toBe(4);
    expect(localStorage.getItem('clauditor_money_decimals')).toBe('4');
    expect(fmtMoney(1.5)).toBe('$1.5000');
  });

  it('clamps above 8 to 8', () => {
    input(field('decimals'), '12');
    expect(state.moneyDecimals).toBe(8);
    expect(field('decimals').value).toBe('8');
  });

  it('clamps below 0 to 0', () => {
    input(field('decimals'), '-3');
    expect(state.moneyDecimals).toBe(0);
    expect(localStorage.getItem('clauditor_money_decimals')).toBe('0');
  });

  it('uses 2 for an empty field', () => {
    input(field('decimals'), '');
    expect(state.moneyDecimals).toBe(2);
  });

  it('re-renders after the change', () => {
    input(field('decimals'), '3');
    expect(rerenders).toHaveBeenCalledTimes(1);
  });
});

describe('separators', () => {
  it('shows the current separators', () => {
    expect(sep('thousands').value).toBe(',');
    expect(sep('decimal').value).toBe('.');
  });

  it('saves a new thousands separator and uses it in numbers', () => {
    input(sep('thousands'), ' ');
    expect(state.thousandsSep).toBe(' ');
    expect(localStorage.getItem('clauditor_thousands_sep')).toBe(' ');
    expect(fmtFixed(1234567, 0)).toBe('1 234 567');
  });

  it('saves a new decimal separator', () => {
    input(sep('decimal'), ',');
    expect(state.decimalSep).toBe(',');
    expect(localStorage.getItem('clauditor_decimal_sep')).toBe(',');
  });

  it('clears the thousands separator when set equal to the decimal one', () => {
    input(sep('thousands'), '.');
    expect(state.thousandsSep).toBe('');
    expect(localStorage.getItem('clauditor_thousands_sep')).toBe('');
    expect(sep('thousands').value).toBe('');
    expect(state.decimalSep).toBe('.');
  });

  it('clears the thousands separator when the decimal one becomes equal to it', () => {
    input(sep('decimal'), ',');
    expect(state.thousandsSep).toBe('');
    expect(sep('thousands').value).toBe('');
    expect(localStorage.getItem('clauditor_thousands_sep')).toBe('');
    expect(localStorage.getItem('clauditor_decimal_sep')).toBe(',');
  });

  it('turns an empty decimal separator into a dot', () => {
    input(sep('decimal'), '');
    expect(state.decimalSep).toBe('.');
    expect(sep('decimal').value).toBe('.');
    expect(localStorage.getItem('clauditor_decimal_sep')).toBe('.');
  });

  it('allows an empty thousands separator', () => {
    input(sep('thousands'), '');
    expect(state.thousandsSep).toBe('');
    expect(fmtFixed(1234567, 0)).toBe('1234567');
  });

  it('re-renders after the change', () => {
    input(sep('thousands'), ' ');
    expect(rerenders).toHaveBeenCalledTimes(1);
  });
});

describe('language', () => {
  it('shows both languages with the current one pressed', () => {
    const buttons = [...body().querySelectorAll('[data-pick^="lang:"]')];
    expect(buttons.map((b) => [b.dataset.pick, b.getAttribute('aria-pressed')])).toEqual([['lang:en', 'true'], ['lang:hu', 'false']]);
  });

  it('applies the picked language and translates the dialog', () => {
    pick('lang:hu');
    expect(getLang()).toBe('hu');
    expect(localStorage.getItem('clauditor_lang')).toBe('hu');
    expect(document.querySelector('.modal-title').textContent).toBe('Beállítások');
    expect([...body().querySelectorAll('.set-nav-tab')].map((b) => b.textContent)).toEqual(['Általános', 'Számok', 'Megjelenés', 'Adatok']);
    expect(body().querySelector('[data-pick="lang:hu"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('does not touch the saved number separators', () => {
    input(sep('thousands'), ' ');
    pick('lang:hu');
    expect(localStorage.getItem('clauditor_thousands_sep')).toBe(' ');
  });
});

describe('appearance', () => {
  beforeEach(() => {
    click(tabButton('appearance'));
  });

  it('lists five light and five dark theme cards', () => {
    const swatches = [...body().querySelectorAll('[data-swatch]')].map((b) => b.dataset.swatch);
    expect(swatches).toEqual([
      'light-winter', 'light-sand', 'light-mint', 'light-lavender', 'light-sea',
      'dark-dracula', 'dark-midnight', 'dark-forest', 'dark-graphite', 'dark-plum',
    ]);
  });

  it('marks the default themes as chosen', () => {
    expect(body().querySelector('[data-swatch="light-winter"]').getAttribute('aria-pressed')).toBe('true');
    expect(body().querySelector('[data-swatch="dark-dracula"]').getAttribute('aria-pressed')).toBe('true');
    expect(body().querySelector('[data-pick="mode:light"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('applies a picked mode', () => {
    pick('mode:dark');
    expect(localStorage.getItem('clauditor_theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(body().querySelector('[data-pick="mode:dark"]').getAttribute('aria-pressed')).toBe('true');
    expect(body().querySelector('[data-pick="mode:light"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('applies automatic mode', () => {
    pick('mode:auto');
    expect(localStorage.getItem('clauditor_theme')).toBe('auto');
    expect(document.documentElement.dataset.themeAuto).toBe('1');
  });

  it('applies a picked light theme', () => {
    pick('light:sand');
    expect(localStorage.getItem('clauditor_theme_light')).toBe('sand');
    expect(document.documentElement.dataset.light).toBe('sand');
    expect(body().querySelector('[data-swatch="light-sand"]').getAttribute('aria-pressed')).toBe('true');
    expect(body().querySelector('[data-swatch="light-winter"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('applies a picked dark theme', () => {
    pick('dark:plum');
    expect(localStorage.getItem('clauditor_theme_dark')).toBe('plum');
    expect(document.documentElement.dataset.dark).toBe('plum');
  });

  it('lists the four width chips in order with their labels', () => {
    const chips = [...body().querySelectorAll('[data-pick^="width:"]')];
    expect(chips.map((b) => b.dataset.pick)).toEqual(['width:narrow', 'width:normal', 'width:wide', 'width:full']);
    expect(chips.map((b) => b.textContent.trim())).toEqual(['Narrow', 'Normal', 'Wide', 'Full']);
  });

  it('presses Normal by default', () => {
    const pressed = [...body().querySelectorAll('[data-pick^="width:"]')].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['false', 'true', 'false', 'false']);
  });

  it('saves a picked width, sets data-width and moves the pressed chip', () => {
    pick('width:wide');
    expect(localStorage.getItem('clauditor_width')).toBe('wide');
    expect(document.documentElement.dataset.width).toBe('wide');
    expect(body().querySelector('[data-pick="width:wide"]').getAttribute('aria-pressed')).toBe('true');
    expect(body().querySelector('[data-pick="width:normal"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the stored width as pressed when the dialog opens', () => {
    localStorage.setItem('clauditor_width', 'full');
    document.body.innerHTML = '';
    openSettings();
    click(tabButton('appearance'));
    expect(body().querySelector('[data-pick="width:full"]').getAttribute('aria-pressed')).toBe('true');
    expect(body().querySelector('[data-pick="width:normal"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the appearance tab open after a pick', () => {
    pick('mode:dark');
    expect(panel('appearance').hidden).toBe(false);
  });
});

describe('data tab', () => {
  beforeEach(() => {
    click(tabButton('data'));
  });

  it('shows that nothing was loaded yet', () => {
    expect(panel('data').textContent).toContain('No data loaded yet');
  });

  it('shows the price list date in the locale format', () => {
    const expected = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${PRICE_LIST_UPDATED}T00:00:00Z`));
    expect(panel('data').textContent).toContain(expected);
  });

  it('shows the last update and the archive folder name', () => {
    state.lastUpdated = new Date(2026, 9, 15, 9, 5, 7);
    state.archiveName = 'my-archive';
    openSettings();
    const text = panel('data').textContent;
    expect(text).toContain('my-archive');
    expect(text).toContain(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' }).format(state.lastUpdated));
  });
});
