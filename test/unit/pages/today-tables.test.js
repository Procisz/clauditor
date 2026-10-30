import { beforeEach, describe, expect, it } from 'vitest';
import { sessionsTable } from '../../../src/pages/today/tables.js';
import { state } from '../../../src/core/state.js';
import { flushAll, mountPanel } from '../../helpers/dom.js';
import { makeEntry } from '../../helpers/fixtures.js';

const LONG_NAME = 'Refactor the billing export so that long session names never wrap inside the sessions table cell';

async function mountTable(entries) {
  const panel = mountPanel('today');
  panel.innerHTML = `<div class="grid12">${sessionsTable(entries, 1)}</div>`;
  await flushAll();
  return panel;
}

beforeEach(() => {
  state.markup = 1;
  state.sessionTitles = new Map();
});

describe('today sessionsTable name button', () => {
  it('holds the full session name and the open hint in its title', async () => {
    state.sessionTitles = new Map([['sess-a', LONG_NAME]]);
    const panel = await mountTable([makeEntry({ sessionId: 'sess-a' })]);
    const button = panel.querySelector('button[data-open-session="sess-a"]');
    expect(button).not.toBeNull();
    expect(button.title).toBe(`${LONG_NAME}\nOpen session`);
    expect(button.textContent).toBe(LONG_NAME);
  });

  it('keeps the link-btn and trunc classes that cut the visible name', async () => {
    state.sessionTitles = new Map([['sess-a', LONG_NAME]]);
    const panel = await mountTable([makeEntry({ sessionId: 'sess-a' })]);
    const button = panel.querySelector('button[data-open-session="sess-a"]');
    expect(button.classList.contains('link-btn')).toBe(true);
    expect(button.classList.contains('trunc')).toBe(true);
  });

  it('shows a resolved prompt title in the button title', async () => {
    state.sessionTitles = new Map([['sess-a', 'Fix the login timeout']]);
    const panel = await mountTable([makeEntry({ sessionId: 'sess-a' })]);
    expect(panel.querySelector('button[data-open-session="sess-a"]').title).toBe('Fix the login timeout\nOpen session');
  });

  it('falls back to the id prefix in the title when the session has no name', async () => {
    const panel = await mountTable([makeEntry({ sessionId: 'abcdef123456', slug: '' })]);
    expect(panel.querySelector('button[data-open-session="abcdef123456"]').title).toBe('abcdef12\nOpen session');
  });

  it('escapes quotes and angle brackets in the title attribute', async () => {
    state.sessionTitles = new Map([['sess-a', 'say "hi" <b>']]);
    const panel = await mountTable([makeEntry({ sessionId: 'sess-a' })]);
    const button = panel.querySelector('button[data-open-session="sess-a"]');
    expect(button.title).toBe('say "hi" <b>\nOpen session');
    expect(button.querySelector('b')).toBeNull();
  });
});
