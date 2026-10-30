import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_WIDTH, WIDTHS, currentDark, currentLight, currentMode, currentWidth, initAppearance, isDark, setDark, setLight, setMode, setWidth } from '../../../src/app/appearance.js';
import { DARK_THEMES, DEFAULT_DARK, DEFAULT_LIGHT, LIGHT_THEMES } from '../../../src/app/themes.js';
import { EVENTS } from '../../../src/app/events.js';
import { setMedia } from '../../helpers/env.js';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const html = () => document.documentElement.dataset;

function prePaintScript() {
  const source = readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'index.html'), 'utf8');
  const match = source.match(/<script>([\s\S]*?)<\/script>/);
  return match[1];
}

describe('theme registry', () => {
  it('lists five light and five dark themes with their defaults first', () => {
    expect(LIGHT_THEMES.map((th) => th.id)).toEqual(['winter', 'sand', 'mint', 'lavender', 'sea']);
    expect(DARK_THEMES.map((th) => th.id)).toEqual(['dracula', 'midnight', 'forest', 'graphite', 'plum']);
    expect(DEFAULT_LIGHT).toBe('winter');
    expect(DEFAULT_DARK).toBe('dracula');
  });

  it('gives each theme name and description keys', () => {
    expect(LIGHT_THEMES[1]).toEqual({ id: 'sand', nameKey: 'themes.sand.name', descKey: 'themes.sand.desc' });
  });
});

describe('mode', () => {
  it('defaults to light when nothing is stored', () => {
    expect(currentMode()).toBe('light');
  });

  it('reads the legacy winter value as light and dracula as dark', () => {
    localStorage.setItem('clauditor_theme', 'winter');
    expect(currentMode()).toBe('light');
    localStorage.setItem('clauditor_theme', 'dracula');
    expect(currentMode()).toBe('dark');
  });

  it('falls back to light for an unknown stored value', () => {
    localStorage.setItem('clauditor_theme', 'neon');
    expect(currentMode()).toBe('light');
  });

  it('keeps light, dark and auto as they are', () => {
    for (const mode of ['light', 'dark', 'auto']) {
      localStorage.setItem('clauditor_theme', mode);
      expect(currentMode()).toBe(mode);
    }
  });

  it('saves the mode and sets the html attributes', () => {
    setMode('dark');
    expect(localStorage.getItem('clauditor_theme')).toBe('dark');
    expect(html().theme).toBe('dark');
    expect(html().themeAuto).toBeUndefined();
    expect(isDark()).toBe(true);
  });

  it('maps a legacy value passed to setMode', () => {
    setMode('dracula');
    expect(localStorage.getItem('clauditor_theme')).toBe('dark');
  });

  it('saves light for an unknown mode', () => {
    setMode('neon');
    expect(localStorage.getItem('clauditor_theme')).toBe('light');
    expect(html().theme).toBe('light');
  });
});

describe('light and dark picks', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(currentLight()).toBe('winter');
    expect(currentDark()).toBe('dracula');
  });

  it('saves a known pick and mirrors it on the html element', () => {
    setLight('sand');
    setDark('plum');
    expect(localStorage.getItem('clauditor_theme_light')).toBe('sand');
    expect(localStorage.getItem('clauditor_theme_dark')).toBe('plum');
    expect(html().light).toBe('sand');
    expect(html().dark).toBe('plum');
  });

  it('falls back to the default for an unknown theme id', () => {
    setLight('plum');
    setDark('sand');
    expect(currentLight()).toBe('winter');
    expect(currentDark()).toBe('dracula');
    localStorage.setItem('clauditor_theme_light', 'nope');
    expect(currentLight()).toBe('winter');
  });

  it('does not accept a dark id as a light pick', () => {
    setLight('midnight');
    expect(localStorage.getItem('clauditor_theme_light')).toBe('winter');
  });
});

describe('auto mode', () => {
  it('follows the system preference when initialised', () => {
    setMedia(DARK_QUERY, true);
    localStorage.setItem('clauditor_theme', 'auto');
    initAppearance();
    expect(html().theme).toBe('dark');
    expect(html().themeAuto).toBe('1');
    expect(isDark()).toBe(true);
  });

  it('uses light when the system prefers light', () => {
    setMedia(DARK_QUERY, false);
    localStorage.setItem('clauditor_theme', 'auto');
    initAppearance();
    expect(html().theme).toBe('light');
    expect(html().themeAuto).toBe('1');
  });

  it('switches when the system preference changes', () => {
    setMedia(DARK_QUERY, false);
    localStorage.setItem('clauditor_theme', 'auto');
    initAppearance();
    setMedia(DARK_QUERY, true);
    expect(html().theme).toBe('dark');
    setMedia(DARK_QUERY, false);
    expect(html().theme).toBe('light');
  });

  it('ignores system changes in a fixed mode', () => {
    setMedia(DARK_QUERY, false);
    localStorage.setItem('clauditor_theme', 'light');
    initAppearance();
    setMedia(DARK_QUERY, true);
    expect(html().theme).toBe('light');
  });

  it('drops the auto marker when a fixed mode is chosen', () => {
    localStorage.setItem('clauditor_theme', 'auto');
    initAppearance();
    setMode('light');
    expect(html().themeAuto).toBeUndefined();
  });
});

describe('initAppearance', () => {
  it('applies legacy stored values to the html element', () => {
    localStorage.setItem('clauditor_theme', 'dracula');
    initAppearance();
    expect(html().theme).toBe('dark');
    expect(html().light).toBe('winter');
    expect(html().dark).toBe('dracula');
  });
});

describe('theme change event', () => {
  it('fires with the mode, dark flag and picks after setMode', () => {
    const seen = vi.fn();
    document.addEventListener(EVENTS.theme, (e) => seen(e.detail));
    setMode('dark');
    expect(seen).toHaveBeenCalledWith({ mode: 'dark', isDark: true, light: 'winter', dark: 'dracula' });
  });

  it('fires after setLight and setDark', () => {
    const seen = vi.fn();
    document.addEventListener(EVENTS.theme, (e) => seen(e.detail));
    setLight('mint');
    setDark('forest');
    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen.mock.calls[0][0].light).toBe('mint');
    expect(seen.mock.calls[1][0].dark).toBe('forest');
  });

  it('fires on a system change in auto mode only', () => {
    const seen = vi.fn();
    localStorage.setItem('clauditor_theme', 'auto');
    initAppearance();
    document.addEventListener(EVENTS.theme, seen);
    setMedia(DARK_QUERY, true);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('width', () => {
  it('lists narrow, normal, wide and full with normal as the default', () => {
    expect(WIDTHS).toEqual(['narrow', 'normal', 'wide', 'full']);
    expect(DEFAULT_WIDTH).toBe('normal');
  });

  it('defaults to normal when nothing is stored', () => {
    expect(currentWidth()).toBe('normal');
  });

  it('reads a stored width', () => {
    localStorage.setItem('clauditor_width', 'wide');
    expect(currentWidth()).toBe('wide');
  });

  it('falls back to normal for an unknown stored width', () => {
    localStorage.setItem('clauditor_width', 'huge');
    expect(currentWidth()).toBe('normal');
  });

  it('stores a known width and sets data-width on the html element', () => {
    setWidth('full');
    expect(localStorage.getItem('clauditor_width')).toBe('full');
    expect(html().width).toBe('full');
    expect(currentWidth()).toBe('full');
  });

  it('stores normal for an unknown width', () => {
    setWidth('wide');
    setWidth('huge');
    expect(localStorage.getItem('clauditor_width')).toBe('normal');
    expect(html().width).toBe('normal');
  });

  it('fires a window resize so charts refit', () => {
    const seen = vi.fn();
    window.addEventListener('resize', seen);
    setWidth('narrow');
    window.removeEventListener('resize', seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('applies the stored width when initialised', () => {
    localStorage.setItem('clauditor_width', 'narrow');
    initAppearance();
    expect(html().width).toBe('narrow');
  });

  it('applies normal when initialised with nothing stored', () => {
    initAppearance();
    expect(html().width).toBe('normal');
  });
});

describe('pre-paint script in index.html', () => {
  const script = prePaintScript();

  it('lists the same theme ids as themes.js', () => {
    const light = script.match(/var LIGHT = (\[[^\]]*\])/)[1];
    const dark = script.match(/var DARK = (\[[^\]]*\])/)[1];
    expect(JSON.parse(light)).toEqual(LIGHT_THEMES.map((th) => th.id));
    expect(JSON.parse(dark)).toEqual(DARK_THEMES.map((th) => th.id));
  });

  const run = () => new Function(script)();

  it('maps legacy values and applies the stored picks', () => {
    localStorage.setItem('clauditor_theme', 'dracula');
    localStorage.setItem('clauditor_theme_light', 'sea');
    localStorage.setItem('clauditor_theme_dark', 'graphite');
    run();
    expect(html()).toMatchObject({ theme: 'dark', light: 'sea', dark: 'graphite' });
  });

  it('defaults to light, winter and dracula when nothing is stored', () => {
    run();
    expect(html()).toMatchObject({ theme: 'light', light: 'winter', dark: 'dracula' });
  });

  it('falls back to the defaults for unknown ids', () => {
    localStorage.setItem('clauditor_theme', 'neon');
    localStorage.setItem('clauditor_theme_light', 'plum');
    localStorage.setItem('clauditor_theme_dark', 'sand');
    run();
    expect(html()).toMatchObject({ theme: 'light', light: 'winter', dark: 'dracula' });
  });

  it('follows the system preference in auto mode and marks it', () => {
    setMedia(DARK_QUERY, true);
    localStorage.setItem('clauditor_theme', 'auto');
    run();
    expect(html()).toMatchObject({ theme: 'dark', themeAuto: '1' });
  });

  it('lists the same width ids as appearance.js', () => {
    const widths = script.match(/var WIDTHS = (\[[^\]]*\])/)[1];
    expect(JSON.parse(widths)).toEqual([...WIDTHS]);
  });

  it('applies the stored width', () => {
    localStorage.setItem('clauditor_width', 'full');
    run();
    expect(html().width).toBe('full');
  });

  it('defaults the width to normal when nothing is stored', () => {
    run();
    expect(html().width).toBe('normal');
  });

  it('falls back to normal for an unknown stored width', () => {
    localStorage.setItem('clauditor_width', 'huge');
    run();
    expect(html().width).toBe('normal');
  });

  it('sets the html language from the stored language', () => {
    localStorage.setItem('clauditor_lang', 'hu');
    run();
    expect(document.documentElement.lang).toBe('hu');
  });

  it('ignores an unknown stored language', () => {
    localStorage.setItem('clauditor_lang', 'de');
    run();
    expect(document.documentElement.lang).toBe('en');
  });
});
