import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../../../src/core/state.js';
import { setScreen } from '../../../src/core/utils.js';
import { setLang, initLang } from '../../../src/i18n/index.js';
import { EVENTS, emit } from '../../../src/app/events.js';
import { activate, currentPage, pageFromLocation, panelOf } from '../../../src/app/router.js';
import { initShell, markAllDirty, pageContext, renderAll, renderActive } from '../../../src/app/shell.js';
import { makeChart } from '../../../src/ui/charts.js';
import ApexCharts from '../../mocks/apexcharts.js';
import { click, key } from '../../helpers/dom.js';
import { fixtureEntries, fixtureDurations } from '../../helpers/fixtures.js';
import { mountShellDom } from '../../helpers/shell-dom.js';

const IDS = ['overview', 'today', 'models', 'projects', 'sessions', 'costs'];

function fakePages({ throwOn = null, usesRange = (id) => id !== 'today' } = {}) {
  const renders = Object.fromEntries(IDS.map((id) => [id, vi.fn()]));
  const pages = IDS.map((id) => ({
    id,
    titleKey: `nav.${id}`,
    icon: `i-${id}`,
    usesRange: usesRange(id),
    render(mount, ctx) {
      renders[id](mount, ctx);
      if (id === throwOn) throw new Error('boom');
      mount.innerHTML = `<p class="probe">${id}</p>`;
    },
  }));
  return { pages, renders };
}

function boot(options) {
  const fake = fakePages(options);
  mountShellDom();
  setScreen('start');
  initShell(fake.pages);
  setScreen('dashboard');
  renderAll();
  return fake;
}

const tab = (id) => document.getElementById(`tab-${id}`);
const visiblePanels = () => [...document.querySelectorAll('#app-main > [data-page]')].filter((p) => !p.hidden).map((p) => p.dataset.page);

beforeEach(() => {
  initLang();
  state.allEntries = fixtureEntries();
  state.allDurations = fixtureDurations();
  state.activePage = 'overview';
  state.renderedPages.clear();
  state.view = 'daily';
  state.markup = 1;
  state.budget = 0;
  state.autoDateFrom = '';
});

describe('routing by hash', () => {
  it('opens the page named by the hash', () => {
    location.hash = '#models';
    boot();
    expect(state.activePage).toBe('models');
    expect(visiblePanels()).toEqual(['models']);
    expect(tab('models').getAttribute('aria-selected')).toBe('true');
    expect(tab('overview').getAttribute('aria-selected')).toBe('false');
  });

  it('opens Overview for an empty hash', () => {
    boot();
    expect(state.activePage).toBe('overview');
    expect(visiblePanels()).toEqual(['overview']);
  });

  it('opens Overview for an unknown hash', () => {
    location.hash = '#nonsense';
    boot();
    expect(state.activePage).toBe('overview');
    expect(pageFromLocation()).toBe('overview');
    expect(location.hash).toBe('#overview');
  });

  it('uses English slugs for all six pages', () => {
    boot();
    expect([...document.querySelectorAll('#page-nav [role="tab"]')].map((a) => a.getAttribute('href'))).toEqual(IDS.map((id) => `#${id}`));
  });

  it('follows a hashchange event', () => {
    boot();
    location.hash = '#costs';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(state.activePage).toBe('costs');
    expect(visiblePanels()).toEqual(['costs']);
  });

  it('activates a page on tab click and writes its hash', () => {
    boot();
    click(tab('sessions'));
    expect(state.activePage).toBe('sessions');
    expect(location.hash).toBe('#sessions');
    expect(currentPage().id).toBe('sessions');
  });

  it('moves with arrow keys, Home and End', () => {
    boot();
    key(document.getElementById('page-nav'), 'ArrowRight');
    expect(state.activePage).toBe('today');
    key(document.getElementById('page-nav'), 'End');
    expect(state.activePage).toBe('costs');
    key(document.getElementById('page-nav'), 'ArrowRight');
    expect(state.activePage).toBe('overview');
    key(document.getElementById('page-nav'), 'ArrowLeft');
    expect(state.activePage).toBe('costs');
    key(document.getElementById('page-nav'), 'Home');
    expect(state.activePage).toBe('overview');
  });

  it('keeps only the selected tab in the tab order', () => {
    boot();
    activate('models');
    expect(tab('models').tabIndex).toBe(0);
    expect(tab('overview').tabIndex).toBe(-1);
  });

  it('links each tab to its panel', () => {
    boot();
    expect(tab('today').getAttribute('aria-controls')).toBe('panel-today');
    expect(panelOf('today').getAttribute('aria-labelledby')).toBe('tab-today');
  });
});

describe('nav labels and language', () => {
  it('shows English labels by default', () => {
    boot();
    expect(IDS.map((id) => tab(id).textContent)).toEqual(['Overview', 'Today', 'Models', 'Projects', 'Sessions', 'Costs']);
  });

  it('relabels the tabs when the language changes', () => {
    boot();
    setLang('hu');
    expect(IDS.map((id) => tab(id).textContent)).toEqual(['Áttekintés', 'Ma', 'Modellek', 'Projektek', 'Munkamenetek', 'Költségek']);
  });

  it('re-renders the active page in the new language', () => {
    const { renders } = boot();
    expect(renders.overview).toHaveBeenCalledTimes(1);
    setLang('hu');
    expect(renders.overview).toHaveBeenCalledTimes(2);
  });
});

describe('rendering only the active page', () => {
  it('renders the active page and no other', () => {
    const { renders } = boot();
    expect(renders.overview).toHaveBeenCalledTimes(1);
    for (const id of IDS.slice(1)) expect(renders[id]).not.toHaveBeenCalled();
    expect(panelOf('overview').querySelector('.probe').textContent).toBe('overview');
    expect(panelOf('models').children).toHaveLength(0);
  });

  it('renders a page once when it is activated for the first time', () => {
    const { renders } = boot();
    activate('models');
    expect(renders.models).toHaveBeenCalledTimes(1);
    expect(panelOf('models').querySelector('.probe').textContent).toBe('models');
  });

  it('does not render again when returning to an up to date page', () => {
    const { renders } = boot();
    activate('models');
    activate('overview');
    expect(renders.overview).toHaveBeenCalledTimes(1);
    expect(renders.models).toHaveBeenCalledTimes(1);
  });

  it('marks pages dirty and renders them on activation', () => {
    const { renders } = boot();
    activate('models');
    markAllDirty();
    expect(state.renderedPages.size).toBe(0);
    activate('overview');
    expect(renders.overview).toHaveBeenCalledTimes(2);
    expect(renders.models).toHaveBeenCalledTimes(1);
    activate('models');
    expect(renders.models).toHaveBeenCalledTimes(2);
  });

  it('re-renders only the active page on the rerender event and leaves the others dirty', () => {
    const { renders } = boot();
    activate('models');
    activate('overview');
    emit(EVENTS.rerender);
    expect(renders.overview).toHaveBeenCalledTimes(2);
    expect(renders.models).toHaveBeenCalledTimes(1);
    activate('models');
    expect(renders.models).toHaveBeenCalledTimes(2);
  });

  it('re-renders when the granularity changes', () => {
    const { renders } = boot();
    click(document.querySelector('#view-toggle [data-view="weekly"]'));
    expect(state.view).toBe('weekly');
    expect(renders.overview).toHaveBeenCalledTimes(2);
    expect(renders.overview.mock.calls[1][1].range.view).toBe('weekly');
    expect(document.querySelector('#view-toggle [data-view="weekly"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#view-toggle [data-view="daily"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('does not render before data is ready or off the dashboard screen', () => {
    const fake = fakePages();
    mountShellDom();
    setScreen('start');
    initShell(fake.pages);
    renderActive({ force: true });
    expect(fake.renders.overview).not.toHaveBeenCalled();
  });

  it('forces a re-render of an up to date page', () => {
    const { renders } = boot();
    renderActive();
    expect(renders.overview).toHaveBeenCalledTimes(1);
    renderActive({ force: true });
    expect(renders.overview).toHaveBeenCalledTimes(2);
  });

  it('destroys the charts of a page before it renders again', () => {
    ApexCharts.reset();
    const fake = fakePages();
    fake.pages[0].render = (mount) => {
      mount.innerHTML = '<div id="host"></div>';
      makeChart(mount.querySelector('#host'), { chart: { type: 'bar' }, series: [] });
    };
    mountShellDom();
    setScreen('start');
    initShell(fake.pages);
    setScreen('dashboard');
    renderAll();
    expect(ApexCharts.instances).toHaveLength(1);
    expect(ApexCharts.instances[0].destroyed).toBe(false);
    renderActive({ force: true });
    expect(ApexCharts.instances[0].destroyed).toBe(true);
    expect(ApexCharts.instances[1].destroyed).toBe(false);
  });

  it('shows a failure message instead of the page when render throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    boot({ throwOn: 'overview' });
    expect(panelOf('overview').textContent).toContain('This page could not be displayed: boom');
    expect(state.renderedPages.has('overview')).toBe(false);
    expect(error).toHaveBeenCalled();
  });
});

describe('page context', () => {
  it('passes the period, the previous period and the shared values', () => {
    state.markup = 1.25;
    state.budget = 40;
    const { renders } = boot();
    const ctx = renders.overview.mock.calls[0][1];
    expect(ctx.range).toEqual({ from: '2026-10-09', to: '2026-10-15', view: 'daily' });
    expect(ctx.previous.from).toBe('2026-10-02');
    expect(ctx.previous.to).toBe('2026-10-08');
    expect(ctx.markup).toBe(1.25);
    expect(ctx.budget).toBe(40);
    expect(ctx.today).toBe('2026-10-15');
    expect(ctx.allEntries).toBe(state.allEntries);
    expect(ctx.durations).toBe(state.allDurations);
    expect(typeof ctx.rerender).toBe('function');
    expect(typeof ctx.openSession).toBe('function');
  });

  it('limits entries to the period and previous entries to the previous period', () => {
    const { renders } = boot();
    const ctx = renders.overview.mock.calls[0][1];
    expect(ctx.entries.every((e) => e.date >= '2026-10-09' && e.date <= '2026-10-15')).toBe(true);
    expect(ctx.entries).toHaveLength(6);
    expect(ctx.previous.entries.map((e) => e.date)).toEqual([]);
    expect(ctx.allEntries).toHaveLength(7);
  });

  it('collects the previous period entries from all entries', () => {
    mountShellDom({ from: '2026-10-13', to: '2026-10-15' });
    const ctx = pageContext();
    expect(ctx.previous).toMatchObject({ from: '2026-10-10', to: '2026-10-12' });
    expect(ctx.previous.entries.map((e) => e.date)).toEqual(['2026-10-10']);
  });

  it('falls back to the auto start date when the from field is empty', () => {
    mountShellDom({ from: '', to: '2026-10-15' });
    state.autoDateFrom = '2026-10-01';
    expect(pageContext().range.from).toBe('2026-10-01');
  });

  it('the rerender callback renders the active page again', () => {
    const { renders } = boot();
    renders.overview.mock.calls[0][1].rerender();
    expect(renders.overview).toHaveBeenCalledTimes(2);
  });
});

describe('period bar', () => {
  it('is hidden on a page that does not use the range', () => {
    boot();
    expect(document.getElementById('period-bar').hidden).toBe(false);
    activate('today');
    expect(document.getElementById('period-bar').hidden).toBe(true);
    activate('models');
    expect(document.getElementById('period-bar').hidden).toBe(false);
  });

  it('shows the comparison caption for the previous period', () => {
    boot();
    expect(document.getElementById('period-caption').textContent).toBe('Compared with Oct 2, 2026 to Oct 8, 2026');
  });

  it('saves a manual start date and clears the key when it equals the auto date', () => {
    boot();
    state.autoDateFrom = '2026-10-01';
    const from = document.getElementById('date-from');
    from.value = '2026-10-05';
    from.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('clauditor_date_from')).toBe('2026-10-05');
    from.value = '2026-10-01';
    from.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('clauditor_date_from')).toBe('');
  });

  it('re-renders the active page with the new period', () => {
    const { renders } = boot();
    const from = document.getElementById('date-from');
    from.value = '2026-10-13';
    from.dispatchEvent(new Event('change'));
    expect(renders.overview).toHaveBeenCalledTimes(2);
    expect(renders.overview.mock.calls[1][1].range.from).toBe('2026-10-13');
  });

  it('hides tabs and period bar outside the dashboard screen', () => {
    boot();
    setScreen('start');
    expect(document.getElementById('page-nav').hidden).toBe(true);
    expect(document.getElementById('period-bar').hidden).toBe(true);
  });
});
