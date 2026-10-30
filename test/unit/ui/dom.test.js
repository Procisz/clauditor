import { describe, expect, it } from 'vitest';
import { chartCard, deltaChip, emptyState, esc, modelBadge, modelTone, statCard, tipDot } from '../../../src/ui/dom.js';
import { state } from '../../../src/core/state.js';

const parse = (html) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

describe('esc', () => {
  it('escapes the five html characters', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('turns null and undefined into an empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('deltaChip', () => {
  it('shows a rise as a percentage of the fraction with a plus sign', () => {
    const chip = parse(deltaChip(0.123));
    expect(chip.textContent).toBe('+12.3%');
    expect(chip.firstElementChild.dataset.dir).toBe('up');
  });

  it('shows a fall with a minus sign and the down direction', () => {
    const chip = parse(deltaChip(-0.5));
    expect(chip.textContent).toBe('-50.0%');
    expect(chip.firstElementChild.dataset.dir).toBe('down');
  });

  it('treats a fall as good when goodWhenDown is set', () => {
    expect(parse(deltaChip(-0.2, { goodWhenDown: true })).firstElementChild.dataset.dir).toBe('up');
    expect(parse(deltaChip(0.2, { goodWhenDown: true })).firstElementChild.dataset.dir).toBe('down');
  });

  it('shows a flat chip for a change that rounds to zero', () => {
    const chip = parse(deltaChip(0.0001));
    expect(chip.firstElementChild.dataset.dir).toBe('flat');
    expect(chip.textContent).toBe('0.0%');
  });

  it('returns nothing for null, undefined and non-finite values', () => {
    expect(deltaChip(null)).toBe('');
    expect(deltaChip(undefined)).toBe('');
    expect(deltaChip(Number.NaN)).toBe('');
    expect(deltaChip(Infinity)).toBe('');
  });

  it('uses the configured separators', () => {
    state.thousandsSep = '.';
    state.decimalSep = ',';
    expect(parse(deltaChip(1234.5)).textContent).toBe('+123.450,0%');
    state.thousandsSep = ',';
    state.decimalSep = '.';
  });
});

describe('modelTone and modelBadge', () => {
  it.each([
    ['claude-opus-4-1', 'opus'],
    ['claude-sonnet-4', 'sonnet'],
    ['claude-haiku-4', 'haiku'],
    ['claude-fable-9', 'fable'],
    ['claude-mythos-1', 'mythos'],
    ['gpt-oss:20b', 'other'],
    ['', 'other'],
    [null, 'other'],
  ])('maps %s to %s', (model, tone) => {
    expect(modelTone(model)).toBe(tone);
  });

  it('is case insensitive', () => {
    expect(modelTone('Claude-OPUS-4')).toBe('opus');
  });

  it('renders a badge with the tone and the full id as title', () => {
    const badge = parse(modelBadge('claude-sonnet-4')).firstElementChild;
    expect(badge.dataset.model).toBe('sonnet');
    expect(badge.title).toBe('claude-sonnet-4');
    expect(badge.textContent).toBe('sonnet');
  });

  it('escapes the model id in the badge', () => {
    const badge = parse(modelBadge('<x>')).firstElementChild;
    expect(badge.title).toBe('<x>');
    expect(badge.querySelector('x')).toBeNull();
  });
});

describe('cards', () => {
  it('tipDot returns nothing without a tip and a button with it', () => {
    expect(tipDot('')).toBe('');
    const dot = parse(tipDot('Why')).firstElementChild;
    expect(dot.tagName).toBe('BUTTON');
    expect(dot.dataset.tip).toBe('Why');
    expect(dot.getAttribute('aria-label')).toBe('Why');
  });

  it('statCard sets the accent color and escapes the label', () => {
    const card = parse(statCard({ label: '<b>L</b>', value: '5', color: 'var(--c-cost)', foot: 'foot' })).firstElementChild;
    expect(card.dataset.accent).toBeDefined();
    expect(card.style.getPropertyValue('--c')).toBe('var(--c-cost)');
    expect(card.querySelector('.stat-label').textContent).toBe('<b>L</b>');
    expect(card.querySelector('.stat-value').textContent).toBe('5');
    expect(card.querySelector('.stat-foot').textContent).toBe('foot');
  });

  it('chartCard creates the host with the given id and span', () => {
    const card = parse(chartCard({ id: 'my-chart', title: 'T', span: 8 })).firstElementChild;
    expect(card.dataset.span).toBe('8');
    expect(card.querySelector('#my-chart')).not.toBeNull();
    expect(card.querySelector('.card-title').textContent).toBe('T');
  });

  it('emptyState shows the no data message by default', () => {
    expect(parse(emptyState()).textContent).toContain('No data');
  });
});
