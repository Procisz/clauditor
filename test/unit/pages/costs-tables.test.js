import { beforeEach, describe, expect, it } from 'vitest';
import { monthlyTable } from '../../../src/pages/costs/tables.js';
import { monthLabel } from '../../../src/pages/costs/format.js';
import { setLang } from '../../../src/i18n/index.js';
import messages from '../../../src/i18n/messages/index.js';
import { click, flushAll, input, mountPanel, textOf } from '../../helpers/dom.js';
import { makeEntry } from '../../helpers/fixtures.js';

const monthEntry = (month, overrides = {}) => makeEntry({ ts: `${month}-15T10:00:00.000Z`, ...overrides });

async function mountMonthly(allEntries) {
  const panel = mountPanel('costs');
  panel.innerHTML = `<div class="grid12">${monthlyTable({ allEntries, markup: 1 })}</div>`;
  await flushAll();
  return panel;
}

const header = (panel, key) => panel.querySelector(`th[data-key="${key}"]`);
const monthCells = (panel) => [...panel.querySelectorAll('tbody tr')].map((row) => textOf(row.querySelector('td')));

beforeEach(() => {
  setLang('en');
});

describe('costs monthlyTable default order', () => {
  it('opens with the latest month first', async () => {
    const panel = await mountMonthly([
      monthEntry('2026-08'),
      monthEntry('2026-10'),
      monthEntry('2026-09'),
    ]);
    expect(monthCells(panel)).toEqual([monthLabel('2026-10'), monthLabel('2026-09'), monthLabel('2026-08')]);
    expect(header(panel, 'month').getAttribute('aria-sort')).toBe('descending');
    expect(header(panel, 'cost').getAttribute('aria-sort')).toBe('none');
  });

  it('keeps the latest month first even when an older month costs more', async () => {
    const panel = await mountMonthly([
      monthEntry('2026-08', { input: 5_000_000 }),
      monthEntry('2026-10', { input: 1000 }),
    ]);
    expect(monthCells(panel)).toEqual([monthLabel('2026-10'), monthLabel('2026-08')]);
    expect(header(panel, 'cost').getAttribute('aria-sort')).toBe('none');
  });

  it('pages through the months latest first', async () => {
    const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    const panel = await mountMonthly(months.map((m) => monthEntry(m)));
    expect(monthCells(panel)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06'].map(monthLabel));
    expect(monthCells(panel)).not.toContain(monthLabel('2026-05'));
    expect(monthCells(panel)).not.toContain(monthLabel('2026-04'));
  });

  it('keeps latest first in the neutral state and cycles through every sort state', async () => {
    const panel = await mountMonthly([
      monthEntry('2026-08'),
      monthEntry('2026-10'),
      monthEntry('2026-09'),
    ]);
    const latestFirst = [monthLabel('2026-10'), monthLabel('2026-09'), monthLabel('2026-08')];
    const oldestFirst = [...latestFirst].reverse();

    click(header(panel, 'month'));
    expect(header(panel, 'month').getAttribute('aria-sort')).toBe('none');
    expect(monthCells(panel)).toEqual(latestFirst);

    click(header(panel, 'month'));
    expect(header(panel, 'month').getAttribute('aria-sort')).toBe('ascending');
    expect(monthCells(panel)).toEqual(oldestFirst);

    click(header(panel, 'month'));
    expect(header(panel, 'month').getAttribute('aria-sort')).toBe('descending');
    expect(monthCells(panel)).toEqual(latestFirst);

    click(header(panel, 'month'));
    expect(header(panel, 'month').getAttribute('aria-sort')).toBe('none');
    expect(monthCells(panel)).toEqual(latestFirst);
  });

  it('shows the latest month first in the English subtitle', async () => {
    const panel = await mountMonthly([monthEntry('2026-10')]);
    expect(textOf(panel.querySelector('.card-sub'))).toBe('All data, latest month first');
  });

  it('shows the Hungarian subtitle after switching the language', async () => {
    setLang('hu');
    const panel = await mountMonthly([monthEntry('2026-10')]);
    const sub = textOf(panel.querySelector('.card-sub'));
    expect(sub).toBe(messages.hu['costs.monthly.sub']);
    expect(sub).not.toBe(messages.en['costs.monthly.sub']);
  });

  it('computes the change of the latest month against the month before it', async () => {
    const panel = await mountMonthly([
      monthEntry('2026-08', { input: 1000, output: 0 }),
      monthEntry('2026-09', { input: 1000, output: 0 }),
      monthEntry('2026-10', { input: 2000, output: 0 }),
    ]);
    const latestChange = textOf(panel.querySelector('tbody tr td:last-child'));
    expect(latestChange).toContain('100');
    const septemberChange = textOf(panel.querySelectorAll('tbody tr td:last-child')[1]);
    expect(septemberChange).not.toContain('100');
  });
});

describe('costs monthlyTable search and quick filter chips', () => {
  const chipLabels = (panel) => [...panel.querySelectorAll('.sub-filter-chip')].map((b) => b.textContent);
  const chipByLabel = (panel, label) => [...panel.querySelectorAll('.sub-filter-chip')].find((b) => b.textContent === label);
  const searchInput = (panel) => panel.querySelector('.sub-filter-input');
  const rising = () => [
    monthEntry('2026-08', { input: 1000 }),
    monthEntry('2026-09', { input: 3000 }),
    monthEntry('2026-10', { input: 1000 }),
  ];

  it('finds a month by its label', async () => {
    const panel = await mountMonthly(rising());
    input(searchInput(panel), monthLabel('2026-09'));
    expect(monthCells(panel)).toEqual([monthLabel('2026-09')]);
  });

  it('finds a month by its key', async () => {
    const panel = await mountMonthly(rising());
    input(searchInput(panel), '2026-09');
    expect(monthCells(panel)).toEqual([monthLabel('2026-09')]);
  });

  it('shows the months that cost more than the month before with Cost up', async () => {
    const panel = await mountMonthly(rising());
    click(chipByLabel(panel, 'Cost up'));
    expect(monthCells(panel)).toEqual([monthLabel('2026-09')]);
  });

  it('shows the months that cost less than the month before with Cost down', async () => {
    const panel = await mountMonthly(rising());
    click(chipByLabel(panel, 'Cost down'));
    expect(monthCells(panel)).toEqual([monthLabel('2026-10')]);
  });

  it('keeps the two change chips in one group and the latest month first', async () => {
    const panel = await mountMonthly(rising());
    click(chipByLabel(panel, 'Cost up'));
    click(chipByLabel(panel, 'Cost down'));
    expect(monthCells(panel)).toEqual([monthLabel('2026-10'), monthLabel('2026-09')]);
    expect(header(panel, 'month').getAttribute('aria-sort')).toBe('descending');
  });

  it('hides a change chip when no month matches it', async () => {
    const panel = await mountMonthly([monthEntry('2026-08', { input: 1000 }), monthEntry('2026-09', { input: 3000 })]);
    expect(chipLabels(panel)).toEqual(['Cost up']);
  });

  it('shows no change chips when there is only one month', async () => {
    const panel = await mountMonthly([monthEntry('2026-10')]);
    expect(panel.querySelector('.sub-filter-chips')).toBeNull();
  });

  it('combines the month search with a change chip by AND', async () => {
    const panel = await mountMonthly(rising());
    input(searchInput(panel), '2026-09');
    click(chipByLabel(panel, 'Cost down'));
    expect(panel.querySelector('tbody').textContent).toBe('No matches');
    click(chipByLabel(panel, 'Cost up'));
    expect(monthCells(panel)).toEqual([monthLabel('2026-09')]);
  });

  it('translates the change chips to Hungarian', async () => {
    setLang('hu');
    const panel = await mountMonthly(rising());
    expect(chipLabels(panel)).toEqual([messages.hu['costs.filter.rising'], messages.hu['costs.filter.falling']]);
    expect(chipLabels(panel)).toEqual(['Költség nő', 'Költség csökken']);
  });
});
