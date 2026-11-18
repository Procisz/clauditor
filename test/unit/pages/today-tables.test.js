import { beforeEach, describe, expect, it } from 'vitest';
import { projectsTable, sessionsTable } from '../../../src/pages/today/tables.js';
import { state } from '../../../src/core/state.js';
import { click, flushAll, input, mountPanel } from '../../helpers/dom.js';
import { entryCostingAtLeast, makeEntry } from '../../helpers/fixtures.js';

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

describe('today search and quick filter chips', () => {
  const TODAY = () => [
    entryCostingAtLeast(2, { sessionId: 'opus-code-01', cwd: '/work/alpha', model: 'claude-opus-999', ts: '2026-10-15T08:00:00.000Z' }),
    makeEntry({ sessionId: 'haiku-code-02', cwd: '/work/beta', model: 'claude-haiku-999', ts: '2026-10-15T09:00:00.000Z' }),
    makeEntry({ sessionId: 'sonnet-cowork-03', cwd: '', sessionKind: 'cowork', entrypoint: 'claude-desktop', model: 'claude-sonnet-999', ts: '2026-10-15T10:00:00.000Z' }),
  ];
  const chipLabels = (scope) => [...scope.querySelectorAll('.sub-filter-chip')].map((b) => b.textContent);
  const chipByLabel = (scope, label) => [...scope.querySelectorAll('.sub-filter-chip')].find((b) => b.textContent === label);
  const openedIds = (scope) => [...scope.querySelectorAll('button[data-open-session]')].map((b) => b.dataset.openSession);
  const rowNames = (scope) => [...scope.querySelectorAll('tbody tr')].map((tr) => tr.children[0].textContent);

  async function mountBoth(entries) {
    const sessions = mountPanel('today');
    sessions.innerHTML = `<div class="grid12">${sessionsTable(entries, 1)}</div>`;
    const projects = mountPanel('today');
    projects.innerHTML = `<div class="grid12">${projectsTable(entries, 1)}</div>`;
    await flushAll();
    return { sessions, projects };
  }

  it('offers the family and expensive chips of the sessions, not the type or source', async () => {
    const { sessions } = await mountBoth(TODAY());
    expect(chipLabels(sessions)).toEqual(['Opus', 'Sonnet', 'Haiku', 'Expensive only']);
  });

  it('keeps only the session at or above a dollar with the Expensive only chip', async () => {
    const { sessions } = await mountBoth(TODAY());
    click(chipByLabel(sessions, 'Expensive only'));
    expect(openedIds(sessions)).toEqual(['opus-code-01']);
  });

  it('searches the sessions by id', async () => {
    const { sessions } = await mountBoth(TODAY());
    input(sessions.querySelector('input[placeholder="Search sessions"]'), 'haiku-code');
    expect(openedIds(sessions)).toEqual(['haiku-code-02']);
  });

  it('offers the type and family chips of the projects', async () => {
    const { projects } = await mountBoth(TODAY());
    expect(chipLabels(projects)).toEqual(['Code', 'Cowork', 'Opus', 'Sonnet', 'Haiku']);
  });

  it('keeps only the Cowork projects with the Cowork chip', async () => {
    const { projects } = await mountBoth(TODAY());
    click(chipByLabel(projects, 'Cowork'));
    expect(rowNames(projects)).toEqual(['sonnet-c']);
  });

  it('keeps only the Code projects with the Code chip', async () => {
    const { projects } = await mountBoth(TODAY());
    click(chipByLabel(projects, 'Code'));
    expect(rowNames(projects).sort()).toEqual(['alpha', 'beta']);
  });

  it('searches the project names', async () => {
    const { projects } = await mountBoth(TODAY());
    input(projects.querySelector('input[placeholder="Search projects"]'), 'beta');
    expect(rowNames(projects)).toEqual(['beta']);
  });
});
