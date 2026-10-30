import { describe, expect, it } from 'vitest';
import { activeQuickId, quickPeriods } from '../../../src/core/periods.js';

const byId = (periods) => Object.fromEntries(periods.map((p) => [p.id, p]));
const base = { today: '2026-10-15', min: '2026-09-20', max: '2026-10-15' };

describe('quickPeriods', () => {
  it('returns the five presets in button order', () => {
    expect(quickPeriods(base).map((p) => p.id)).toEqual(['all', 'prevMonth', 'curMonth', 'prevYear', 'curYear']);
  });

  it('computes each preset range for a mid-October today', () => {
    const p = byId(quickPeriods(base));
    expect(p.all).toEqual({ id: 'all', from: '2026-09-20', to: '2026-10-15', has: true });
    expect(p.prevMonth).toEqual({ id: 'prevMonth', from: '2026-09-20', to: '2026-09-30', has: true });
    expect(p.curMonth).toEqual({ id: 'curMonth', from: '2026-10-01', to: '2026-10-15', has: true });
    expect(p.curYear).toEqual({ id: 'curYear', from: '2026-09-20', to: '2026-10-15', has: true });
  });

  it('disables the previous year when the data starts this year', () => {
    expect(byId(quickPeriods(base)).prevYear.has).toBe(false);
  });

  it('keeps the full previous month and year when the data covers them', () => {
    const p = byId(quickPeriods({ today: '2026-10-15', min: '2024-03-02', max: '2026-10-15' }));
    expect(p.prevMonth).toMatchObject({ from: '2026-09-01', to: '2026-09-30', has: true });
    expect(p.prevYear).toMatchObject({ from: '2025-01-01', to: '2025-12-31', has: true });
    expect(p.curYear).toMatchObject({ from: '2026-01-01', to: '2026-10-15', has: true });
  });

  it('rolls the previous month over into December of last year in January', () => {
    const p = byId(quickPeriods({ today: '2026-01-15', min: '2025-01-01', max: '2026-01-15' }));
    expect(p.prevMonth).toMatchObject({ from: '2025-12-01', to: '2025-12-31', has: true });
    expect(p.curMonth).toMatchObject({ from: '2026-01-01', to: '2026-01-15' });
  });

  it('ends the previous month on the 28th in a non-leap February and the 29th in a leap one', () => {
    const plain = byId(quickPeriods({ today: '2026-03-10', min: '2025-01-01', max: '2026-03-10' }));
    expect(plain.prevMonth.to).toBe('2026-02-28');
    const leap = byId(quickPeriods({ today: '2024-03-10', min: '2023-01-01', max: '2024-03-10' }));
    expect(leap.prevMonth.to).toBe('2024-02-29');
  });

  it('disables every preset when there is no data', () => {
    const periods = quickPeriods({ today: '2026-10-15', min: '', max: '' });
    expect(periods).toHaveLength(5);
    expect(periods.every((p) => p.has === false)).toBe(true);
  });

  it('disables the current month but keeps all when the data ended long ago', () => {
    const p = byId(quickPeriods({ today: '2026-10-15', min: '2026-01-05', max: '2026-02-10' }));
    expect(p.curMonth.has).toBe(false);
    expect(p.all.has).toBe(true);
    expect(p.all.from).toBe('2026-01-05');
    expect(p.curYear.has).toBe(true);
  });
});

describe('activeQuickId', () => {
  const periods = quickPeriods(base);

  it('returns the id of the preset matching the range', () => {
    expect(activeQuickId(periods, { from: '2026-10-01', to: '2026-10-15' })).toBe('curMonth');
  });

  it('returns the first preset when several share the same range', () => {
    expect(activeQuickId(periods, { from: '2026-09-20', to: '2026-10-15' })).toBe('all');
  });

  it('returns an empty string when no preset matches', () => {
    expect(activeQuickId(periods, { from: '2026-10-02', to: '2026-10-15' })).toBe('');
  });

  it('returns an empty string for the former last 7 days range', () => {
    expect(activeQuickId(periods, { from: '2026-10-09', to: '2026-10-15' })).toBe('');
  });

  it('returns an empty string when the matching preset is disabled', () => {
    const none = quickPeriods({ today: '2026-10-15', min: '', max: '' });
    expect(activeQuickId(none, { from: '', to: '2026-10-15' })).toBe('');
  });
});
