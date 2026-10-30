import { beforeEach, describe, expect, it } from 'vitest';
import {
  PROMPT_TITLE_MAX,
  parseAiTitles,
  parseFirstPrompts,
  parseLogLines,
  parseSessionTitles,
  promptTitle,
  resolveSessionTitles,
} from '../../../src/core/parser.js';
import { assembleState } from '../../../src/core/loader.js';
import { state } from '../../../src/core/state.js';
import { sessionName } from '../../../src/core/utils.js';

const line = (record) => JSON.stringify(record);

beforeEach(() => {
  state.srcCode = null;
  state.srcCowork = null;
  state.sessionTitles = new Map();
});

describe('parseLogLines pre-filter', () => {
  it('keeps ai-title and last-prompt lines', () => {
    const text = [
      line({ type: 'ai-title', sessionId: 's1', aiTitle: 'Fix login' }),
      line({ type: 'last-prompt', sessionId: 's1', lastPrompt: 'hello there' }),
    ].join('\n');
    expect(parseLogLines(text).map((r) => r.type)).toEqual(['ai-title', 'last-prompt']);
  });

  it('keeps usage, turn_duration and custom-title lines too', () => {
    const text = [
      line({ type: 'assistant', message: { usage: { input_tokens: 1 } } }),
      line({ type: 'system', subtype: 'turn_duration', durationMs: 5 }),
      line({ type: 'custom-title', sessionId: 's1', customTitle: 'Mine' }),
    ].join('\n');
    expect(parseLogLines(text)).toHaveLength(3);
  });

  it('drops lines without any marker', () => {
    const text = [
      line({ type: 'user', message: { content: 'plain text' } }),
      line({ type: 'ai-title', sessionId: 's1', aiTitle: 'Kept' }),
      '',
      'not json "ai-title"',
    ].join('\n');
    const records = parseLogLines(text);
    expect(records).toHaveLength(1);
    expect(records[0].aiTitle).toBe('Kept');
  });
});

describe('promptTitle', () => {
  it('collapses whitespace runs and newlines into single spaces and trims', () => {
    expect(promptTitle('  fix \n\n the\t login   bug  ')).toBe('fix the login bug');
  });

  it('returns an empty string for blank or non-string input', () => {
    expect(promptTitle('   \n ')).toBe('');
    expect(promptTitle('')).toBe('');
    expect(promptTitle(undefined)).toBe('');
    expect(promptTitle(42)).toBe('');
  });

  it('keeps a text of exactly 80 characters whole', () => {
    const text = 'a'.repeat(PROMPT_TITLE_MAX);
    expect(PROMPT_TITLE_MAX).toBe(80);
    expect(promptTitle(text)).toBe(text);
  });

  it('cuts a longer text to 79 characters plus an ellipsis', () => {
    const out = promptTitle('b'.repeat(200));
    expect(out).toBe(`${'b'.repeat(79)}…`);
    expect(out).toHaveLength(80);
  });

  it('drops the space before the ellipsis when the cut lands after a space', () => {
    const text = `${'c'.repeat(78)} ${'d'.repeat(30)}`;
    expect(promptTitle(text)).toBe(`${'c'.repeat(78)}…`);
  });
});

describe('parseAiTitles', () => {
  it('maps each session to its ai title and lets the last one win', () => {
    const titles = parseAiTitles([
      { type: 'ai-title', sessionId: 's1', aiTitle: 'First' },
      { type: 'ai-title', sessionId: 's2', aiTitle: 'Other' },
      { type: 'ai-title', sessionId: 's1', aiTitle: 'Second' },
    ]);
    expect([...titles]).toEqual([['s1', 'Second'], ['s2', 'Other']]);
  });

  it('skips empty titles, missing session ids and other record types', () => {
    const titles = parseAiTitles([
      { type: 'ai-title', sessionId: 's1', aiTitle: '' },
      { type: 'ai-title', aiTitle: 'No session' },
      { type: 'custom-title', sessionId: 's2', customTitle: 'Custom', aiTitle: 'Wrong type' },
      { type: 'assistant', sessionId: 's3', aiTitle: 'Nope' },
    ]);
    expect(titles.size).toBe(0);
  });

  it('keeps an earlier title when a later record has an empty one', () => {
    const titles = parseAiTitles([
      { type: 'ai-title', sessionId: 's1', aiTitle: 'Keep me' },
      { type: 'ai-title', sessionId: 's1', aiTitle: '' },
    ]);
    expect(titles.get('s1')).toBe('Keep me');
  });
});

describe('parseFirstPrompts', () => {
  it('keeps the first prompt per session', () => {
    const prompts = parseFirstPrompts([
      { type: 'last-prompt', sessionId: 's1', lastPrompt: 'first prompt' },
      { type: 'last-prompt', sessionId: 's1', lastPrompt: 'later prompt' },
      { type: 'last-prompt', sessionId: 's2', lastPrompt: 'other session' },
    ]);
    expect([...prompts]).toEqual([['s1', 'first prompt'], ['s2', 'other session']]);
  });

  it('collapses whitespace and cuts at 80 characters with an ellipsis', () => {
    const prompts = parseFirstPrompts([
      { type: 'last-prompt', sessionId: 's1', lastPrompt: 'fix\n  the   bug' },
      { type: 'last-prompt', sessionId: 's2', lastPrompt: 'x'.repeat(300) },
    ]);
    expect(prompts.get('s1')).toBe('fix the bug');
    expect(prompts.get('s2')).toBe(`${'x'.repeat(79)}…`);
  });

  it('skips empty prompts so a later non-empty one can still name the session', () => {
    const prompts = parseFirstPrompts([
      { type: 'last-prompt', sessionId: 's1', lastPrompt: '  \n ' },
      { type: 'last-prompt', sessionId: 's1', lastPrompt: 'real prompt' },
    ]);
    expect(prompts.get('s1')).toBe('real prompt');
  });

  it('ignores records without a session id and other types', () => {
    const prompts = parseFirstPrompts([
      { type: 'last-prompt', lastPrompt: 'orphan' },
      { type: 'user', sessionId: 's1', lastPrompt: 'wrong type' },
    ]);
    expect(prompts.size).toBe(0);
  });
});

describe('parseSessionTitles', () => {
  it('still returns custom titles only', () => {
    const titles = parseSessionTitles([
      { type: 'custom-title', sessionId: 's1', customTitle: 'Mine' },
      { type: 'ai-title', sessionId: 's1', aiTitle: 'AI' },
      { type: 'last-prompt', sessionId: 's1', lastPrompt: 'prompt' },
    ]);
    expect([...titles]).toEqual([['s1', 'Mine']]);
  });
});

describe('resolveSessionTitles', () => {
  const all = () => ({
    titles: new Map([['s1', 'custom']]),
    aiTitles: new Map([['s1', 'ai'], ['s2', 'ai-2']]),
    prompts: new Map([['s1', 'prompt'], ['s2', 'prompt-2'], ['s3', 'prompt-3']]),
    archivedTitles: new Map([['s1', 'archived'], ['s2', 'archived-2'], ['s3', 'archived-3'], ['s4', 'archived-4']]),
  });

  it('prefers custom, then ai, then prompt, then archived', () => {
    const resolved = resolveSessionTitles(all());
    expect([...resolved]).toEqual([
      ['s1', 'custom'],
      ['s2', 'ai-2'],
      ['s3', 'prompt-3'],
      ['s4', 'archived-4'],
    ]);
  });

  it('ignores a source that is missing', () => {
    const { aiTitles, prompts } = all();
    const resolved = resolveSessionTitles({ aiTitles, prompts });
    expect([...resolved]).toEqual([['s1', 'ai'], ['s2', 'ai-2'], ['s3', 'prompt-3']]);
  });

  it('returns an empty map for no input', () => {
    expect(resolveSessionTitles().size).toBe(0);
    expect(resolveSessionTitles({}).size).toBe(0);
  });

  it('drops empty values and falls through to the next source', () => {
    const resolved = resolveSessionTitles({
      titles: new Map([['s1', '']]),
      aiTitles: new Map([['s1', 'ai']]),
      prompts: new Map([['s2', '']]),
    });
    expect([...resolved]).toEqual([['s1', 'ai']]);
  });
});

describe('assembleState session titles', () => {
  const source = (overrides = {}) => ({
    entries: [],
    durations: [],
    titles: new Map(),
    aiTitles: new Map(),
    prompts: new Map(),
    archivedTitles: new Map(),
    ...overrides,
  });

  it('resolves the Code titles in order custom, ai, prompt, archived', () => {
    state.srcCode = source({
      titles: new Map([['s1', 'custom']]),
      aiTitles: new Map([['s1', 'ai'], ['s2', 'ai-2']]),
      prompts: new Map([['s1', 'prompt'], ['s2', 'prompt-2'], ['s3', 'prompt-3']]),
      archivedTitles: new Map([['s3', 'archived-3'], ['s4', 'archived-4']]),
    });
    assembleState();
    expect([...state.sessionTitles]).toEqual([
      ['s1', 'custom'],
      ['s2', 'ai-2'],
      ['s3', 'prompt-3'],
      ['s4', 'archived-4'],
    ]);
  });

  it('lets a Cowork title override the resolved Code title', () => {
    state.srcCode = source({ aiTitles: new Map([['task-1', 'ai title']]), prompts: new Map([['s1', 'prompt']]) });
    state.srcCowork = source({ titles: new Map([['task-1', 'Cowork title']]) });
    assembleState();
    expect(state.sessionTitles.get('task-1')).toBe('Cowork title');
    expect(state.sessionTitles.get('s1')).toBe('prompt');
  });

  it('keeps the Cowork titles when there is no Code source', () => {
    state.srcCowork = source({ titles: new Map([['task-1', 'Cowork title']]) });
    assembleState();
    expect([...state.sessionTitles]).toEqual([['task-1', 'Cowork title']]);
  });

  it('names a session that only has a last-prompt record by the start of its prompt', () => {
    const records = parseLogLines(line({ type: 'last-prompt', sessionId: 'sess-xyz', lastPrompt: 'Explain\nthe   cache design' }));
    state.srcCode = source({ prompts: parseFirstPrompts(records) });
    assembleState();
    expect(sessionName('sess-xyz', '')).toBe('Explain the cache design');
  });

  it('shows an ai title over the prompt but a custom title over both in sessionName', () => {
    const records = parseLogLines([
      line({ type: 'last-prompt', sessionId: 'a', lastPrompt: 'prompt a' }),
      line({ type: 'ai-title', sessionId: 'a', aiTitle: 'AI A' }),
      line({ type: 'last-prompt', sessionId: 'b', lastPrompt: 'prompt b' }),
      line({ type: 'ai-title', sessionId: 'b', aiTitle: 'AI B' }),
      line({ type: 'custom-title', sessionId: 'b', customTitle: 'Custom B' }),
    ].join('\n'));
    state.srcCode = source({
      titles: parseSessionTitles(records),
      aiTitles: parseAiTitles(records),
      prompts: parseFirstPrompts(records),
    });
    assembleState();
    expect(sessionName('a', 'slug')).toBe('AI A');
    expect(sessionName('b', 'slug')).toBe('Custom B');
  });

  it('falls back to the slug and then the id prefix when nothing names the session', () => {
    state.srcCode = source();
    assembleState();
    expect(sessionName('abcdef123456', 'cool-slug')).toBe('cool-slug');
    expect(sessionName('abcdef123456', '')).toBe('abcdef12');
  });
});
