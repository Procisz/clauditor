import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../../../src/core/state.js';
import { setScreen } from '../../../src/core/utils.js';
import { setLang, initLang } from '../../../src/i18n/index.js';
import { activate } from '../../../src/app/router.js';
import { initShell, renderAll } from '../../../src/app/shell.js';
import { click } from '../../helpers/dom.js';
import { fixtureEntries } from '../../helpers/fixtures.js';
import { mountShellDom } from '../../helpers/shell-dom.js';

const IDS = ['overview', 'today', 'models', 'projects', 'sessions', 'costs'];

function boot({ usesRange = (id) => id !== 'today', from, to } = {}) {
  const renders = Object.fromEntries(IDS.map((id) => [id, vi.fn()]));
  const pages = IDS.map((id) => ({
    id,
    titleKey: `nav.${id}`,
    icon: `i-${id}`,
    usesRange: usesRange(id),
    render(mount, ctx) {
      renders[id](mount, ctx);
      mount.innerHTML = `<p>${id}</p>`;
    },
  }));
  mountShellDom({ from, to });
  setScreen('start');
  initShell(pages);
  setScreen('dashboard');
  renderAll();
  return renders;
}

const bar = () => document.getElementById('period-bar');
const inner = () => bar().querySelector('.period-inner');
const toggle = () => document.getElementById('filter-toggle');
const quick = (id) => document.querySelector(`[data-quick="${id}"]`);
const quicks = () => [...document.querySelectorAll('#period-quicks > button')];

beforeEach(() => {
  initLang();
  state.allEntries = fixtureEntries();
  state.allDurations = [];
  state.activePage = 'overview';
  state.renderedPages.clear();
  state.view = 'daily';
  state.markup = 1;
  state.budget = 0;
  state.autoDateFrom = '2026-09-20';
  location.hash = '';
});

describe('filter toggle', () => {
  it('shows the row and the toggle by default', () => {
    boot();
    expect(bar().hidden).toBe(false);
    expect(toggle().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().title).toBe('Hide filters');
    expect(toggle().getAttribute('aria-label')).toBe('Hide filters');
  });

  it('hides both on Today and brings them back on another page', () => {
    boot();
    activate('today');
    expect(bar().hidden).toBe(true);
    expect(toggle().hidden).toBe(true);
    activate('costs');
    expect(bar().hidden).toBe(false);
    expect(toggle().hidden).toBe(false);
  });

  it('hides both when the active page does not use the range', () => {
    boot({ usesRange: (id) => id !== 'models' });
    activate('models');
    expect(bar().hidden).toBe(true);
    expect(toggle().hidden).toBe(true);
  });

  it('hides the row on click and flips aria-expanded, icon and title', () => {
    boot();
    const openIcon = toggle().innerHTML;
    click(toggle());
    expect(bar().classList.contains('is-closed')).toBe(true);
    expect(toggle().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().title).toBe('Show filters');
    expect(toggle().getAttribute('aria-label')).toBe('Show filters');
    expect(toggle().innerHTML).not.toBe(openIcon);
    expect(toggle().innerHTML).toContain('i-filter-off');
    click(toggle());
    expect(bar().classList.contains('is-closed')).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().innerHTML).toBe(openIcon);
  });

  it('saves the closed and open state', () => {
    boot();
    click(toggle());
    expect(localStorage.getItem('clauditor_filters')).toBe('closed');
    click(toggle());
    expect(localStorage.getItem('clauditor_filters')).toBe('open');
  });

  it('starts hidden after a fresh boot with a stored closed state', () => {
    localStorage.setItem('clauditor_filters', 'closed');
    boot();
    expect(bar().classList.contains('is-closed')).toBe(true);
    expect(toggle().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().title).toBe('Show filters');
  });

  it('starts shown with a stored open state or an unknown value', () => {
    localStorage.setItem('clauditor_filters', 'open');
    boot();
    expect(bar().classList.contains('is-closed')).toBe(false);
    localStorage.setItem('clauditor_filters', 'garbage');
    boot();
    expect(bar().classList.contains('is-closed')).toBe(false);
  });

  it('keeps a stored closed state after visiting Today', () => {
    boot();
    click(toggle());
    activate('today');
    activate('costs');
    expect(bar().classList.contains('is-closed')).toBe(true);
    expect(localStorage.getItem('clauditor_filters')).toBe('closed');
  });

  it('keeps the bar rendered and inert while closed and restores it on the second click', () => {
    boot();
    expect(inner().hasAttribute('inert')).toBe(false);
    click(toggle());
    expect(bar().hidden).toBe(false);
    expect(bar().classList.contains('is-closed')).toBe(true);
    expect(inner().hasAttribute('inert')).toBe(true);
    click(toggle());
    expect(bar().hidden).toBe(false);
    expect(bar().classList.contains('is-closed')).toBe(false);
    expect(inner().hasAttribute('inert')).toBe(false);
  });

  it('starts closed and inert after a fresh boot with a stored closed state', () => {
    localStorage.setItem('clauditor_filters', 'closed');
    boot();
    expect(bar().hidden).toBe(false);
    expect(bar().classList.contains('is-closed')).toBe(true);
    expect(inner().hasAttribute('inert')).toBe(true);
  });

  it('hides the bar on Today even when open and keeps a closed state when returning', () => {
    boot();
    activate('today');
    expect(bar().hidden).toBe(true);
    expect(bar().classList.contains('is-closed')).toBe(false);
    click(toggle());
    activate('costs');
    expect(bar().hidden).toBe(false);
    expect(bar().classList.contains('is-closed')).toBe(true);
    expect(inner().hasAttribute('inert')).toBe(true);
  });

  it('uses Hungarian texts after switching language', () => {
    boot();
    setLang('hu');
    expect(toggle().title).toBe('Szűrők elrejtése');
    click(toggle());
    expect(toggle().title).toBe('Szűrők megjelenítése');
  });
});

describe('quick period buttons', () => {
  it('renders five buttons in order with English labels', () => {
    boot();
    expect(quicks().map((b) => b.dataset.quick)).toEqual(['all', 'prevMonth', 'curMonth', 'prevYear', 'curYear']);
    expect(quicks().map((b) => b.firstElementChild.textContent)).toEqual([
      'All data',
      'Previous month',
      'Current month',
      'Previous year',
      'Current year',
    ]);
  });

  it('shows the period under the label', () => {
    boot();
    expect(quick('curMonth').lastElementChild.textContent).toBe('Oct 2026');
    expect(quick('prevMonth').lastElementChild.textContent).toBe('Sep 2026');
    expect(quick('curYear').lastElementChild.textContent).toBe('2026');
  });

  it('disables a button without data and leaves its sub line empty', () => {
    boot();
    expect(quick('prevYear').disabled).toBe(true);
    expect(quick('prevYear').lastElementChild.textContent).toBe('');
    expect(quick('prevYear').title).toBe('Previous year: no data in this period.');
    expect(quick('curMonth').disabled).toBe(false);
    expect(quick('curMonth').title).toBe('Current month (Oct 1, 2026 - Oct 15, 2026). The pages show this period.');
  });

  it('disables every button when there is no data', () => {
    state.allEntries = [];
    state.autoDateFrom = '';
    boot();
    expect(quicks().every((b) => b.disabled)).toBe(true);
    expect(quicks().every((b) => b.lastElementChild.textContent === '')).toBe(true);
  });

  it('highlights only the button matching the current range', () => {
    boot({ from: '2026-10-01', to: '2026-10-15' });
    expect(quicks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false', 'false']);
  });

  it('puts All data first and enables it while another range is shown', () => {
    boot();
    expect(quicks()[0].dataset.quick).toBe('all');
    expect(quick('all').disabled).toBe(false);
    expect(quick('all').getAttribute('aria-pressed')).toBe('false');
  });

  it('disables All data and keeps the other buttons with data enabled while the full period is shown', () => {
    boot({ from: '2026-09-20', to: '2026-10-15' });
    expect(quick('all').disabled).toBe(true);
    expect(quick('all').getAttribute('aria-pressed')).toBe('true');
    expect(quick('prevMonth').disabled).toBe(false);
    expect(quick('curMonth').disabled).toBe(false);
    expect(quick('prevYear').disabled).toBe(true);
  });

  it('sets the full period on click and then disables All data', () => {
    boot();
    click(quick('all'));
    expect(document.getElementById('date-from').value).toBe('2026-09-20');
    expect(document.getElementById('date-to').value).toBe('2026-10-15');
    expect(quick('all').disabled).toBe(true);
    expect(quick('curMonth').getAttribute('aria-pressed')).toBe('false');
  });

  it('does not re-render on a click of the disabled All data', () => {
    const renders = boot({ from: '2026-09-20', to: '2026-10-15' });
    const before = renders.overview.mock.calls.length;
    click(quick('all'));
    expect(renders.overview).toHaveBeenCalledTimes(before);
  });

  it('highlights nothing for a custom range', () => {
    boot({ from: '2026-10-02', to: '2026-10-15' });
    expect(quicks().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('highlights nothing for the former last 7 days range', () => {
    boot();
    expect(quicks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'false', 'false']);
  });

  it('applies the preset range, re-renders and highlights it on click', () => {
    const renders = boot();
    click(quick('curMonth'));
    expect(document.getElementById('date-from').value).toBe('2026-10-01');
    expect(document.getElementById('date-to').value).toBe('2026-10-15');
    expect(renders.overview).toHaveBeenCalledTimes(2);
    const range = renders.overview.mock.calls[1][1].range;
    expect(range.from).toBe('2026-10-01');
    expect(range.to).toBe('2026-10-15');
    expect(quick('curMonth').getAttribute('aria-pressed')).toBe('true');
    expect(quick('prevMonth').getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('clauditor_date_from')).toBe('2026-10-01');
  });

  it('applies a previous month range with its own end date', () => {
    boot();
    click(quick('prevMonth'));
    expect(document.getElementById('date-from').value).toBe('2026-09-20');
    expect(document.getElementById('date-to').value).toBe('2026-09-30');
  });

  it('clears the saved start date when the preset starts at the earliest date', () => {
    boot();
    localStorage.setItem('clauditor_date_from', '2026-10-05');
    click(quick('all'));
    expect(document.getElementById('date-from').value).toBe('2026-09-20');
    expect(localStorage.getItem('clauditor_date_from')).toBe('');
  });

  it('ignores a click on a disabled button', () => {
    const renders = boot();
    click(quick('prevYear'));
    expect(renders.overview).toHaveBeenCalledTimes(1);
    expect(document.getElementById('date-from').value).toBe('2026-10-09');
  });

  it('keeps keyboard focus on the clicked button and updates it in place', () => {
    boot();
    const btn = quick('curMonth');
    btn.focus();
    click(btn);
    expect(quick('curMonth')).toBe(btn);
    expect(document.activeElement).toBe(btn);
    click(btn);
    expect(document.activeElement).toBe(btn);
  });

  it('shows Hungarian labels after switching language', () => {
    boot();
    setLang('hu');
    expect(quicks().map((b) => b.firstElementChild.textContent)).toEqual([
      'Összes adat',
      'Előző hónap',
      'Aktuális hónap',
      'Előző év',
      'Aktuális év',
    ]);
    expect(document.getElementById('period-quicks').getAttribute('aria-label')).toBe('Gyors időszakok');
  });
});

describe('period row placement', () => {
  it('keeps Day/Week/Month and Export CSV inside the period bar inside the app header', () => {
    boot();
    const header = document.querySelector('.app-header');
    expect(header.contains(bar())).toBe(true);
    expect(bar().contains(document.getElementById('view-toggle'))).toBe(true);
    expect(bar().contains(document.getElementById('btn-export'))).toBe(true);
    expect(bar().contains(document.getElementById('date-from'))).toBe(true);
    expect(bar().contains(document.getElementById('date-to'))).toBe(true);
    expect(bar().contains(document.getElementById('period-quicks'))).toBe(true);
    expect(bar().contains(document.getElementById('period-caption'))).toBe(true);
  });
});

describe('header controls', () => {
  it('has no language switch or theme button in the header', () => {
    boot();
    expect(document.getElementById('lang-switch')).toBeNull();
    expect(document.getElementById('btn-theme')).toBeNull();
    expect(document.querySelector('.app-header [data-lang]')).toBeNull();
  });

  it('keeps the data sources, settings, refresh and filter buttons in the header', () => {
    boot();
    const header = document.querySelector('.app-header');
    for (const id of ['btn-select', 'btn-settings', 'btn-refresh', 'filter-toggle']) {
      expect(header.querySelector(`#${id}`), id).not.toBeNull();
    }
  });
});
