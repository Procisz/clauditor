import { describe, expect, it, vi } from 'vitest';
import { PAGE_SIZES, cell, dataTable, subTable } from '../../../src/ui/table.js';
import { setLang } from '../../../src/i18n/index.js';
import messages from '../../../src/i18n/messages/index.js';
import { click, flush, input, key, mountPanel, textOf } from '../../helpers/dom.js';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'cost', label: 'Cost', num: true },
];

const makeRows = (list) => list.map(([name, cost]) => ({ name: cell(name), cost: cell(cost, `$${cost}`) }));

const BY_COST = makeRows([['zeta', 9], ['alpha', 7], ['mid', 5], ['beta', 3], ['omega', 1]]);

async function mount(options, page = 'models') {
  const panel = mountPanel(page);
  panel.innerHTML = dataTable({ title: 'T', columns: COLUMNS, rows: BY_COST, defaultSort: { key: 'cost', dir: 'desc' }, ...options });
  await flush();
  return panel;
}

const names = (panel) => [...panel.querySelectorAll('tbody tr')].map((tr) => tr.children[tr.classList.contains('dt-row') ? 1 : 0].textContent);
const header = (panel, key) => panel.querySelector(`th[data-key="${key}"]`);
const pagerText = (panel) => textOf(panel.querySelector('.dt-pager'));
const manyRows = (n) => makeRows(Array.from({ length: n }, (_, i) => [`row-${String(i + 1).padStart(2, '0')}`, n - i]));

describe('sorting', () => {
  it('opens sorted by cost descending', async () => {
    const panel = await mount();
    expect(names(panel)).toEqual(['zeta', 'alpha', 'mid', 'beta', 'omega']);
    expect(header(panel, 'cost').getAttribute('aria-sort')).toBe('descending');
    expect(header(panel, 'name').getAttribute('aria-sort')).toBe('none');
  });

  it('cycles ascending, descending and neutral on a header click', async () => {
    const panel = await mount();
    click(header(panel, 'name'));
    expect(names(panel)).toEqual(['alpha', 'beta', 'mid', 'omega', 'zeta']);
    expect(header(panel, 'name').getAttribute('aria-sort')).toBe('ascending');
    click(header(panel, 'name'));
    expect(names(panel)).toEqual(['zeta', 'omega', 'mid', 'beta', 'alpha']);
    expect(header(panel, 'name').getAttribute('aria-sort')).toBe('descending');
    click(header(panel, 'name'));
    expect(names(panel)).toEqual(['zeta', 'alpha', 'mid', 'beta', 'omega']);
    expect(header(panel, 'name').getAttribute('aria-sort')).toBe('none');
  });

  it('goes neutral from the default cost descending sort and then ascending', async () => {
    const panel = await mount();
    click(header(panel, 'cost'));
    expect(header(panel, 'cost').getAttribute('aria-sort')).toBe('none');
    expect(names(panel)).toEqual(['zeta', 'alpha', 'mid', 'beta', 'omega']);
    click(header(panel, 'cost'));
    expect(names(panel)).toEqual(['omega', 'beta', 'mid', 'alpha', 'zeta']);
  });

  it('sorts numbers by value, not by text', async () => {
    const rows = makeRows([['a', 100], ['b', 9], ['c', 20]]);
    const panel = await mount({ rows, defaultSort: null });
    click(header(panel, 'cost'));
    expect(names(panel)).toEqual(['b', 'c', 'a']);
  });

  it('sorts with the keyboard', async () => {
    const panel = await mount();
    key(header(panel, 'name'), 'Enter');
    expect(names(panel)[0]).toBe('alpha');
  });

  it('keeps rows in the given order without a default sort', async () => {
    const panel = await mount({ defaultSort: null });
    expect(names(panel)).toEqual(['zeta', 'alpha', 'mid', 'beta', 'omega']);
  });

  it('does not make a column with sortable false clickable', async () => {
    const columns = [{ key: 'name', label: 'Name', sortable: false }, COLUMNS[1]];
    const panel = await mount({ columns });
    expect(header(panel, 'name').classList.contains('th-sort')).toBe(false);
    expect(header(panel, 'name').hasAttribute('aria-sort')).toBe(false);
  });
});

describe('paging', () => {
  it('shows one page of rows with the range', async () => {
    const panel = await mount({ rows: manyRows(12), defaultSort: null });
    expect(names(panel)).toHaveLength(5);
    expect(pagerText(panel)).toContain('1-5 of 12');
  });

  it('moves to the next, last, previous and first page', async () => {
    const panel = await mount({ rows: manyRows(12), defaultSort: null });
    const nav = (n) => panel.querySelector(`.dt-nav button[aria-label="${n}"]`);
    click(nav('Next page'));
    expect(names(panel)[0]).toBe('row-06');
    expect(pagerText(panel)).toContain('6-10 of 12');
    click(nav('Last page'));
    expect(names(panel)).toEqual(['row-11', 'row-12']);
    expect(pagerText(panel)).toContain('11-12 of 12');
    click(nav('Previous page'));
    expect(names(panel)[0]).toBe('row-06');
    click(nav('First page'));
    expect(names(panel)[0]).toBe('row-01');
  });

  it('disables first and previous on the first page and next and last on the last', async () => {
    const panel = await mount({ rows: manyRows(7), defaultSort: null });
    const buttons = () => [...panel.querySelectorAll('.dt-nav button')].map((b) => b.disabled);
    expect(buttons()).toEqual([true, true, false, false]);
    click(panel.querySelector('.dt-nav button[aria-label="Last page"]'));
    expect(buttons()).toEqual([false, false, true, true]);
  });

  it('offers the page sizes and defaults to the given one', async () => {
    const panel = await mount({ pageSize: 10 });
    expect([...panel.querySelectorAll('.dt-size option')].map((o) => Number(o.value))).toEqual(PAGE_SIZES);
    expect(panel.querySelector('.dt-size').value).toBe('10');
  });

  it('saves the chosen page size in clauditor_table_rows under the page and columns', async () => {
    const panel = await mount({ rows: manyRows(30), defaultSort: null });
    const select = panel.querySelector('.dt-size');
    select.value = '25';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(names(panel)).toHaveLength(25);
    expect(JSON.parse(localStorage.getItem('clauditor_table_rows'))).toEqual({ 'models:name.cost': 25 });
  });

  it('restores the saved page size for the same page and columns', async () => {
    localStorage.setItem('clauditor_table_rows', JSON.stringify({ 'models:name.cost': 10 }));
    const panel = await mount({ rows: manyRows(30), defaultSort: null });
    expect(names(panel)).toHaveLength(10);
    expect(panel.querySelector('.dt-size').value).toBe('10');
  });

  it('does not apply a size saved for another page', async () => {
    localStorage.setItem('clauditor_table_rows', JSON.stringify({ 'projects:name.cost': 10 }));
    const panel = await mount({ rows: manyRows(30), defaultSort: null });
    expect(names(panel)).toHaveLength(5);
  });

  it('ignores a saved size that is not an allowed page size and survives broken storage', async () => {
    localStorage.setItem('clauditor_table_rows', JSON.stringify({ 'models:name.cost': 7 }));
    expect(names(await mount({ rows: manyRows(30), defaultSort: null }))).toHaveLength(5);
    document.body.innerHTML = '';
    localStorage.setItem('clauditor_table_rows', '{broken');
    expect(names(await mount({ rows: manyRows(30), defaultSort: null }))).toHaveLength(5);
  });

  it('keeps other saved sizes when a new one is saved', async () => {
    localStorage.setItem('clauditor_table_rows', JSON.stringify({ 'projects:other': 50 }));
    const panel = await mount({ rows: manyRows(30), defaultSort: null });
    const select = panel.querySelector('.dt-size');
    select.value = '10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(JSON.parse(localStorage.getItem('clauditor_table_rows'))).toEqual({ 'projects:other': 50, 'models:name.cost': 10 });
  });

  it('shows the empty message when there are no rows', async () => {
    const panel = await mount({ rows: [] });
    expect(panel.querySelector('tbody').textContent).toBe('No data');
    expect(pagerText(panel)).toContain('0-0 of 0');
  });

  it('translates the pager', async () => {
    setLang('hu');
    const panel = await mount({ rows: manyRows(12), defaultSort: null });
    expect(pagerText(panel)).toContain('1-5 / 12');
  });
});

describe('search filter', () => {
  const rows = makeRows([['Árvíztűrő', 5], ['alpha release', 4], ['beta', 3], ['alphabet', 2]]);

  async function filtered() {
    return mount({ rows, defaultSort: null, filter: { keys: ['name'] } });
  }

  it('shows no search box without a filter option', async () => {
    const panel = await mount();
    expect(panel.querySelector('.sub-filter-input')).toBeNull();
  });

  it('narrows the rows while typing and shows the total', async () => {
    const panel = await filtered();
    input(panel.querySelector('.sub-filter-input'), 'alpha');
    expect(names(panel)).toEqual(['alpha release', 'alphabet']);
    expect(pagerText(panel)).toContain('1-2 of 2 · 4 in total');
  });

  it('matches every word in any order', async () => {
    const panel = await filtered();
    input(panel.querySelector('.sub-filter-input'), 'release alpha');
    expect(names(panel)).toEqual(['alpha release']);
  });

  it('ignores case and accents', async () => {
    const panel = await filtered();
    input(panel.querySelector('.sub-filter-input'), 'arviztur');
    expect(names(panel)).toEqual(['Árvíztűrő']);
  });

  it('says there are no matches', async () => {
    const panel = await filtered();
    input(panel.querySelector('.sub-filter-input'), 'zzz');
    expect(panel.querySelector('tbody').textContent).toBe('No matches');
  });

  it('shows the custom empty text', async () => {
    const panel = await mount({ rows, defaultSort: null, filter: { keys: ['name'], emptyText: 'Nothing here' } });
    input(panel.querySelector('.sub-filter-input'), 'zzz');
    expect(panel.querySelector('tbody').textContent).toBe('Nothing here');
  });

  it('clears the search with the clear button', async () => {
    const panel = await filtered();
    input(panel.querySelector('.sub-filter-input'), 'beta');
    click(panel.querySelector('.sub-filter-clear'));
    expect(names(panel)).toHaveLength(4);
    expect(panel.querySelector('.sub-filter-input').value).toBe('');
  });

  it('clears the search with Escape', async () => {
    const panel = await filtered();
    input(panel.querySelector('.sub-filter-input'), 'beta');
    key(panel.querySelector('.sub-filter-input'), 'Escape');
    expect(names(panel)).toHaveLength(4);
  });

  it('goes back to the first page when the query changes', async () => {
    const many = manyRows(12);
    const panel = await mount({ rows: many, defaultSort: null, filter: { keys: ['name'] } });
    click(panel.querySelector('.dt-nav button[aria-label="Next page"]'));
    input(panel.querySelector('.sub-filter-input'), 'row');
    expect(pagerText(panel)).toContain('1-5 of 12');
  });
});

describe('expanding rows', () => {
  const expandOptions = (onToggle, extra = {}) => ({
    expand: {
      key: (row) => row.name.v,
      render: (row, host) => {
        host.textContent = `detail of ${row.name.v}`;
      },
      onToggle,
      ...extra,
    },
  });

  it('renders no detail until a row is opened', async () => {
    const panel = await mount(expandOptions(vi.fn()));
    expect(panel.querySelectorAll('.dt-panel-content')).toHaveLength(0);
    expect(panel.querySelector('tr.dt-row').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a row on click, renders its detail and reports the toggle', async () => {
    const onToggle = vi.fn();
    const panel = await mount(expandOptions(onToggle));
    click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
    expect(panel.querySelector('.dt-panel-content').textContent).toBe('detail of alpha');
    expect(panel.querySelector('tr.dt-row[data-row-id="alpha"]').getAttribute('aria-expanded')).toBe('true');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('alpha', true);
  });

  it('opens with the keyboard', async () => {
    const onToggle = vi.fn();
    const panel = await mount(expandOptions(onToggle));
    key(panel.querySelector('tr.dt-row[data-row-id="mid"]'), 'Enter');
    expect(onToggle).toHaveBeenCalledWith('mid', true);
  });

  it('reports the close at once and removes the detail after the transition', async () => {
    const onToggle = vi.fn();
    const panel = await mount(expandOptions(onToggle));
    click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
    click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
    expect(onToggle).toHaveBeenLastCalledWith('alpha', false);
    const wrap = panel.querySelector('.expand-wrap');
    const end = new Event('transitionend', { bubbles: true });
    end.propertyName = 'grid-template-rows';
    wrap.dispatchEvent(end);
    expect(panel.querySelectorAll('.dt-panel-content')).toHaveLength(0);
    expect(panel.querySelector('tr.dt-row[data-row-id="alpha"]').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the rows listed in defaultOpen', async () => {
    const panel = await mount(expandOptions(vi.fn(), { defaultOpen: ['beta'] }));
    expect(panel.querySelector('.dt-panel-content').dataset.rowId).toBe('beta');
    expect(panel.querySelector('.dt-panel-content').textContent).toBe('detail of beta');
  });

  it('keeps an open row open across sorting', async () => {
    const panel = await mount(expandOptions(vi.fn()));
    click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
    click(header(panel, 'name'));
    expect(panel.querySelector('.dt-panel-content').textContent).toBe('detail of alpha');
  });

  it('adds a chevron column and ignores onRowClick when expanding', async () => {
    const onRowClick = vi.fn();
    const panel = await mount({ ...expandOptions(vi.fn()), onRowClick });
    expect(panel.querySelector('th.th-chevron')).not.toBeNull();
    click(panel.querySelector('tr.dt-row'));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('row click', () => {
  it('passes the clicked row to onRowClick', async () => {
    const onRowClick = vi.fn();
    const panel = await mount({ onRowClick });
    click(panel.querySelectorAll('tbody tr.dt-click')[1]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0].name.v).toBe('alpha');
  });

  it('is not clickable without onRowClick', async () => {
    const panel = await mount();
    expect(panel.querySelector('tr.dt-click')).toBeNull();
  });
});

describe('card', () => {
  it('escapes the title and shows the tip', async () => {
    const panel = await mount({ title: '<b>x</b>', tip: 'Hint' });
    expect(panel.querySelector('.card-title').textContent).toBe('<b>x</b>');
    expect(panel.querySelector('.card-title b')).toBeNull();
    expect(panel.querySelector('.info-dot').dataset.tip).toBe('Hint');
  });

  it('escapes cell text by default', async () => {
    const panel = await mount({ rows: [{ name: cell('<i>x</i>'), cost: cell(1) }] });
    expect(panel.querySelector('tbody td').textContent).toBe('<i>x</i>');
    expect(panel.querySelector('tbody td i')).toBeNull();
  });

  it('shows a dash for an empty cell value', () => {
    expect(cell(null).html).toBe('-');
  });
});

describe('subTable', () => {
  const rows = makeRows([['b', 2], ['a', 1], ['c', 3]]);

  it('renders into a host with the default sort', () => {
    const panel = mountPanel('sessions');
    const host = document.createElement('div');
    panel.append(host);
    subTable(host, { columns: COLUMNS, rows, defaultSort: { key: 'cost', dir: 'desc' } });
    expect(names(host)).toEqual(['c', 'b', 'a']);
  });

  it('sorts and pages like a data table', () => {
    const panel = mountPanel('sessions');
    const host = document.createElement('div');
    panel.append(host);
    subTable(host, { columns: COLUMNS, rows: manyRows(8), pageSize: 5 });
    expect(names(host)).toHaveLength(5);
    click(host.querySelector('.dt-nav button[aria-label="Next page"]'));
    expect(names(host)).toEqual(['row-06', 'row-07', 'row-08']);
    click(host.querySelector('th[data-key="name"]'));
    expect(host.querySelector('th[data-key="name"]').getAttribute('aria-sort')).toBe('ascending');
  });

  it('saves the page size under the page key', () => {
    const panel = mountPanel('sessions');
    const host = document.createElement('div');
    panel.append(host);
    subTable(host, { columns: COLUMNS, rows: manyRows(8), pageSize: 5 });
    const select = host.querySelector('.dt-size');
    select.value = '10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(JSON.parse(localStorage.getItem('clauditor_table_rows'))).toEqual({ 'sessions:name.cost': 10 });
  });

  it('calls onRowClick with the clicked row', () => {
    const panel = mountPanel('sessions');
    const host = document.createElement('div');
    panel.append(host);
    const onRowClick = vi.fn();
    subTable(host, { columns: COLUMNS, rows, defaultSort: { key: 'cost', dir: 'desc' }, onRowClick });
    click(host.querySelectorAll('tbody tr')[0]);
    expect(onRowClick.mock.calls[0][0].name.v).toBe('c');
  });
});

describe('quick filter chips', () => {
  const TAGGED = [
    ['alpha', 9, 'opus', 'code'],
    ['beta', 8, 'haiku', 'code'],
    ['gamma', 7, 'opus', 'cowork'],
    ['delta', 6, 'sonnet', 'cowork'],
    ['epsilon', 5, 'haiku', 'cowork'],
    ['zeta', 4, 'opus', 'code'],
  ];
  const tagged = (list) => list.map(([name, cost, family, kind]) => ({
    name: cell(name),
    cost: cell(cost, `$${cost}`),
    family: cell(family),
    kind: cell(kind),
  }));
  const FAMILY = [
    { id: 'opus', label: 'Opus', group: 'family', test: (r) => r.family.v === 'opus' },
    { id: 'haiku', label: 'Haiku', group: 'family', test: (r) => r.family.v === 'haiku' },
    { id: 'sonnet', label: 'Sonnet', group: 'family', test: (r) => r.family.v === 'sonnet' },
  ];
  const KIND = [
    { id: 'code', label: 'Code', group: 'kind', test: (r) => r.kind.v === 'code' },
    { id: 'cowork', label: 'Cowork', group: 'kind', test: (r) => r.kind.v === 'cowork' },
  ];
  const withChips = (chips, extra = {}) => ({
    rows: tagged(TAGGED),
    pageSize: 10,
    filter: { keys: ['name'], chips, ...extra },
    ...extra.top,
  });
  const chip = (scope, id) => scope.querySelector(`.sub-filter-chip[data-chip="${id}"]`);
  const chipLabels = (scope) => [...scope.querySelectorAll('.sub-filter-chip')].map((b) => b.textContent);
  const pressed = (scope, id) => chip(scope, id).getAttribute('aria-pressed');
  const parentChips = (panel) => [...panel.querySelectorAll('.sub-filter-chip')].filter((b) => !b.closest('.dt-panel-content'));
  const rowNames = (panel) => [...panel.querySelectorAll('tr.dt-row')].map((tr) => tr.children[1].textContent);

  it('shows a chip only when some row matches it', async () => {
    const panel = await mount(withChips([...FAMILY, { id: 'none', label: 'Nothing', test: () => false }]));
    expect(chipLabels(panel)).toEqual(['Opus', 'Haiku', 'Sonnet']);
  });

  it('filters the rows when a chip is toggled and restores them when it is toggled off', async () => {
    const panel = await mount(withChips(FAMILY));
    click(chip(panel, 'opus'));
    expect(names(panel)).toEqual(['alpha', 'gamma', 'zeta']);
    expect(pressed(panel, 'opus')).toBe('true');
    click(chip(panel, 'opus'));
    expect(names(panel)).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
    expect(pressed(panel, 'opus')).toBe('false');
  });

  it('resets to the first page when a chip changes', async () => {
    const many = tagged(Array.from({ length: 12 }, (_, i) => [`row-${String(i + 1).padStart(2, '0')}`, 12 - i, i % 2 ? 'haiku' : 'opus', 'code']));
    const panel = await mount({ rows: many, defaultSort: null, pageSize: 5, filter: { chips: FAMILY } });
    click(panel.querySelector('.dt-nav button[aria-label="Next page"]'));
    expect(names(panel)[0]).toBe('row-06');
    click(chip(panel, 'opus'));
    expect(pagerText(panel)).toContain('1-5 of 6 · 12 in total');
    expect(names(panel)).toEqual(['row-01', 'row-03', 'row-05', 'row-07', 'row-09']);
  });

  it('combines the chips of one group with OR', async () => {
    const panel = await mount(withChips(FAMILY));
    click(chip(panel, 'opus'));
    click(chip(panel, 'haiku'));
    expect(names(panel)).toEqual(['alpha', 'beta', 'gamma', 'epsilon', 'zeta']);
  });

  it('combines the chips of different groups with AND', async () => {
    const panel = await mount(withChips([...FAMILY, ...KIND]));
    click(chip(panel, 'opus'));
    click(chip(panel, 'haiku'));
    click(chip(panel, 'cowork'));
    expect(names(panel)).toEqual(['gamma', 'epsilon']);
  });

  it('treats chips without a group as separate groups', async () => {
    const panel = await mount(withChips([
      { id: 'opus', label: 'Opus', test: (r) => r.family.v === 'opus' },
      { id: 'code', label: 'Code', test: (r) => r.kind.v === 'code' },
    ]));
    click(chip(panel, 'opus'));
    click(chip(panel, 'code'));
    expect(names(panel)).toEqual(['alpha', 'zeta']);
  });

  it('combines a chip with the search by AND', async () => {
    const panel = await mount(withChips(FAMILY));
    input(panel.querySelector('.sub-filter-input'), 'ta');
    expect(names(panel)).toEqual(['beta', 'delta', 'zeta']);
    click(chip(panel, 'opus'));
    expect(names(panel)).toEqual(['zeta']);
  });

  it('shows no search box when the filter has chips but no search keys', async () => {
    const panel = await mount({ rows: tagged(TAGGED), pageSize: 10, filter: { chips: FAMILY } });
    expect(panel.querySelector('.sub-filter-input')).toBeNull();
    expect(chipLabels(panel)).toEqual(['Opus', 'Haiku', 'Sonnet']);
    click(chip(panel, 'opus'));
    expect(names(panel)).toEqual(['alpha', 'gamma', 'zeta']);
  });

  it('says there are no matches when the chips leave no row', async () => {
    const panel = await mount(withChips([...FAMILY, ...KIND]));
    click(chip(panel, 'sonnet'));
    click(chip(panel, 'code'));
    expect(panel.querySelector('tbody').textContent).toBe('No matches');
    expect(pagerText(panel)).toContain('0-0 of 0 · 6 in total');
  });

  it('shows the custom empty text when the chips leave no row', async () => {
    const panel = await mount(withChips([...FAMILY, ...KIND], { emptyText: 'Nothing here' }));
    click(chip(panel, 'sonnet'));
    click(chip(panel, 'code'));
    expect(panel.querySelector('tbody').textContent).toBe('Nothing here');
  });

  it('shows the total in the pager with only a chip active', async () => {
    const panel = await mount(withChips(FAMILY));
    click(chip(panel, 'opus'));
    expect(pagerText(panel)).toContain('1-3 of 3 · 6 in total');
  });

  it('clears only the query with the clear button and keeps the chips', async () => {
    const panel = await mount(withChips(FAMILY));
    input(panel.querySelector('.sub-filter-input'), 'ta');
    click(chip(panel, 'opus'));
    expect(names(panel)).toEqual(['zeta']);
    click(panel.querySelector('.sub-filter-clear'));
    expect(names(panel)).toEqual(['alpha', 'gamma', 'zeta']);
    expect(pressed(panel, 'opus')).toBe('true');
  });

  it('clears only the query with Escape and keeps the chips', async () => {
    const panel = await mount(withChips(FAMILY));
    input(panel.querySelector('.sub-filter-input'), 'ta');
    click(chip(panel, 'opus'));
    key(panel.querySelector('.sub-filter-input'), 'Escape');
    expect(names(panel)).toEqual(['alpha', 'gamma', 'zeta']);
    expect(pressed(panel, 'opus')).toBe('true');
  });

  it('labels the chip group in English and Hungarian', async () => {
    const english = await mount(withChips(FAMILY));
    expect(english.querySelector('.sub-filter-chips').getAttribute('aria-label')).toBe('Quick filters');
    document.body.innerHTML = '';
    setLang('hu');
    const hungarian = await mount(withChips(FAMILY));
    expect(hungarian.querySelector('.sub-filter-chips').getAttribute('aria-label')).toBe('Gyorsszűrők');
    expect(messages.hu['common.quickFilters']).toBe('Gyorsszűrők');
  });

  it('keeps the chips of a nested table apart from the parent table', async () => {
    const panel = await mount({
      rows: tagged(TAGGED),
      pageSize: 10,
      defaultSort: { key: 'cost', dir: 'desc' },
      filter: { chips: FAMILY },
      expand: {
        key: (row) => row.name.v,
        render: (row, host) => subTable(host, {
          columns: COLUMNS,
          rows: tagged(TAGGED),
          pageSize: 10,
          defaultSort: { key: 'cost', dir: 'desc' },
          filter: { chips: KIND },
        }),
      },
    });
    click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
    const nestedNames = () => [...panel.querySelector('.dt-panel-content').querySelectorAll('.sub-tbl tbody tr')].map((tr) => tr.children[0].textContent);
    click(panel.querySelector('.dt-panel-content .sub-filter-chip[data-chip="code"]'));
    expect(nestedNames()).toEqual(['alpha', 'beta', 'zeta']);
    expect(parentChips(panel).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
    expect(rowNames(panel)).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
  });

  it('turns the parent chip without touching the chips of an expanded table', async () => {
    const panel = await mount({
      rows: tagged(TAGGED),
      pageSize: 10,
      defaultSort: { key: 'cost', dir: 'desc' },
      filter: { chips: FAMILY },
      expand: {
        key: (row) => row.name.v,
        render: (row, host) => subTable(host, { columns: COLUMNS, rows: tagged(TAGGED), pageSize: 10, filter: { chips: KIND } }),
      },
    });
    click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
    click(parentChips(panel).find((b) => b.dataset.chip === 'opus'));
    expect(rowNames(panel)).toEqual(['alpha', 'gamma', 'zeta']);
    expect(parentChips(panel).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(panel.querySelector('.dt-panel-content .sub-filter-chip[data-chip="code"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('filters a subTable by its chips and keeps the default cost order', () => {
    const panel = mountPanel('sessions');
    const host = document.createElement('div');
    panel.append(host);
    subTable(host, { columns: COLUMNS, rows: tagged(TAGGED), defaultSort: { key: 'cost', dir: 'desc' }, filter: { chips: FAMILY } });
    click(chip(host, 'opus'));
    expect(names(host)).toEqual(['alpha', 'gamma', 'zeta']);
    expect(pressed(host, 'opus')).toBe('true');
  });

  it('keeps an active chip visible when the rows no longer match it', () => {
    const panel = mountPanel('sessions');
    const host = document.createElement('div');
    panel.append(host);
    subTable(host, { columns: COLUMNS, rows: tagged(TAGGED), defaultSort: { key: 'cost', dir: 'desc' }, filter: { chips: FAMILY } });
    click(chip(host, 'sonnet'));
    expect(names(host)).toEqual(['delta']);
    subTable(host, { columns: COLUMNS, rows: tagged(TAGGED.filter((r) => r[2] !== 'sonnet')), defaultSort: { key: 'cost', dir: 'desc' }, filter: { chips: FAMILY } });
    expect(chipLabels(host)).toEqual(['Opus', 'Haiku', 'Sonnet']);
    expect(pressed(host, 'sonnet')).toBe('true');
    expect(host.querySelector('tbody').textContent).toBe('No matches');
  });

  describe('nested state across parent re-renders', () => {
    const nestedInput = (panel, rowId = 'alpha') => panel.querySelector(`.dt-panel-content[data-row-id="${rowId}"] .sub-filter-input`);
    const nestedNames = (panel, rowId = 'alpha') => [...panel.querySelectorAll(`.dt-panel-content[data-row-id="${rowId}"] .sub-tbl tbody tr`)].map((tr) => tr.children[0].textContent);
    const nestedChipPressed = (panel, id, rowId = 'alpha') => panel.querySelector(`.dt-panel-content[data-row-id="${rowId}"] .sub-filter-chip[data-chip="${id}"]`).getAttribute('aria-pressed');
    const ownNode = (panel, selector) => [...panel.querySelectorAll(selector)].filter((n) => !n.closest('.dt-panel-content'))[0];
    const nestedNav = (panel, label, rowId = 'alpha') => panel.querySelector(`.dt-panel-content[data-row-id="${rowId}"] .dt-nav button[aria-label="${label}"]`);
    const parentRowIds = (panel) => [...panel.querySelectorAll('tr.dt-row')].map((tr) => tr.dataset.rowId);
    const expandable = (parent = {}, nestedPageSize = 10) => ({
      rows: tagged(TAGGED),
      defaultSort: { key: 'cost', dir: 'desc' },
      pageSize: 10,
      filter: { keys: ['name'], chips: FAMILY },
      expand: {
        key: (row) => row.name.v,
        render: (row, host) => subTable(host, {
          columns: COLUMNS,
          rows: tagged(TAGGED),
          pageSize: nestedPageSize,
          defaultSort: { key: 'cost', dir: 'desc' },
          filter: { keys: ['name'], chips: KIND },
        }),
      },
      ...parent,
    });

    it('keeps the nested search and chips while the parent is sorted, paged and searched', async () => {
      const panel = await mount(expandable({ pageSize: 2 }));
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      input(nestedInput(panel), 'ta');
      click(panel.querySelector('.dt-panel-content .sub-filter-chip[data-chip="code"]'));
      expect(nestedNames(panel)).toEqual(['beta', 'zeta']);
      expect(nestedChipPressed(panel, 'code')).toBe('true');

      click(ownNode(panel, 'th[data-key="name"]'));
      expect(nestedInput(panel).value).toBe('ta');
      expect(nestedNames(panel)).toEqual(['beta', 'zeta']);
      expect(nestedChipPressed(panel, 'code')).toBe('true');

      click(ownNode(panel, '.dt-nav button[aria-label="Next page"]'));
      expect(panel.querySelector('.dt-panel-content[data-row-id="alpha"]')).toBeNull();
      click(ownNode(panel, '.dt-nav button[aria-label="First page"]'));
      expect(nestedInput(panel).value).toBe('ta');
      expect(nestedNames(panel)).toEqual(['beta', 'zeta']);
      expect(nestedChipPressed(panel, 'code')).toBe('true');

      input(ownNode(panel, '.sub-filter-input'), 'alpha');
      expect(parentRowIds(panel)).toEqual(['alpha']);
      expect(nestedNames(panel)).toEqual(['beta', 'zeta']);
    });

    it('keeps the nested sort and page while the parent is sorted', async () => {
      const panel = await mount(expandable({}, 2));
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      click(panel.querySelector('.dt-panel-content th[data-key="name"]'));
      expect(nestedNames(panel)).toEqual(['alpha', 'beta']);
      click(nestedNav(panel, 'Next page'));
      expect(nestedNames(panel)).toEqual(['delta', 'epsilon']);

      click(ownNode(panel, 'th[data-key="name"]'));
      expect(nestedNames(panel)).toEqual(['delta', 'epsilon']);
    });

    it('keeps the search of each open row separate', async () => {
      const panel = await mount(expandable());
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      click(panel.querySelector('tr.dt-row[data-row-id="beta"]'));
      input(nestedInput(panel, 'alpha'), 'ta');
      input(nestedInput(panel, 'beta'), 'zeta');

      click(ownNode(panel, 'th[data-key="name"]'));
      expect(nestedInput(panel, 'alpha').value).toBe('ta');
      expect(nestedNames(panel, 'alpha')).toEqual(['beta', 'delta', 'zeta']);
      expect(nestedInput(panel, 'beta').value).toBe('zeta');
      expect(nestedNames(panel, 'beta')).toEqual(['zeta']);
    });

    it('starts a row fresh once it closed and its transition ended', async () => {
      const panel = await mount(expandable());
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      input(nestedInput(panel), 'ta');
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      const end = new Event('transitionend', { bubbles: true });
      end.propertyName = 'grid-template-rows';
      panel.querySelector('.expand-wrap').dispatchEvent(end);
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      expect(nestedInput(panel).value).toBe('');
      expect(nestedNames(panel)).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
    });

    it('keeps the nested search when a row is closed and reopened before its transition ends', async () => {
      const panel = await mount(expandable());
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      input(nestedInput(panel), 'ta');
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      click(panel.querySelector('tr.dt-row[data-row-id="alpha"]'));
      expect(nestedInput(panel).value).toBe('ta');
      expect(nestedNames(panel)).toEqual(['beta', 'delta', 'zeta']);
    });
  });
});
