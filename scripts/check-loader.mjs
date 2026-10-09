import { readLogFiles, memoryLogStore, recordsFromBytes } from '../src/core/logcache.js';
import { parseLogLines, parseEntries, parseDurations, parseSessionTitles } from '../src/core/parser.js';

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) { console.log(`  ok  ${label}`); }
  else    { console.error(`FAIL  ${label}${detail ? ': ' + detail : ''}`); failures++; }
}

const enc = new TextEncoder();
const fakeFile = (text, lastModified) => {
  const bytes = enc.encode(text);
  return { size: bytes.length, lastModified, slice: (a, b) => new Blob([bytes.subarray(a, b)]) };
};
const assistant = (id, out, ts = '2026-10-01T10:00:00.000Z') => JSON.stringify({
  type: 'assistant', timestamp: ts, sessionId: 's1', cwd: '/x', message: { id, model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: out } },
});
const userLine = big => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x'.repeat(big) }] } });
const duration = ms => JSON.stringify({ type: 'system', subtype: 'turn_duration', timestamp: '2026-10-01T10:00:00.000Z', sessionId: 's1', durationMs: ms });
const title = t => JSON.stringify({ type: 'custom-title', sessionId: 's1', customTitle: t });

const parse = (records, item) => ({ entries: parseEntries(records, item.args), durations: parseDurations(records), titles: [...parseSessionTitles(records)] });
const reference = text => parse(parseLogLines(text), { args: 'main' });
const sig = d => JSON.stringify({ e: d.entries.map(e => [e.msgId, e.output]), d: d.durations.map(x => x.durationMs), t: d.titles });
const load = (store, files, opts = {}) => readLogFiles('test', files.map(([path, text, mtime]) => ({ path, file: fakeFile(text, mtime), args: 'main' })), parse, { store, timeZone: 'Europe/Budapest', ...opts });

console.log('Line pre-filter:');
const mixed = [assistant('m1', 5), userLine(1000), duration(1200), title('First'), '{"type":"user","note":"no markers"}', '', 'not json "usage"'].join('\r\n');
const recs = parseLogLines(mixed);
check('keeps usage, turn_duration and custom-title lines, skips the rest', recs.length === 3 && recs[0].type === 'assistant' && recs[1].subtype === 'turn_duration' && recs[2].type === 'custom-title');
check('a user line that merely mentions usage is parsed, then ignored by the record parsers', parseEntries(parseLogLines(JSON.stringify({ type: 'user', text: '"usage"' })), 'main').length === 0);
check('chunked byte decoding matches a plain parse, even with lines longer than a chunk',
  recordsFromBytes(enc.encode([assistant('a', 1), userLine(20 * 1024 * 1024), assistant('b', 2), ''].join('\n'))).map(r => r.message.id).join() === 'a,b');

console.log('Incremental cache:');
const store = memoryLogStore();
const v1 = [assistant('m1', 5), userLine(500), duration(100), title('First'), ''].join('\n');
const cold = await load(store, [['a.jsonl', v1, 1000]]);
check('a cold read matches a full parse', sig(cold.results[0]) === sig(reference(v1)) && cold.stats.full === 1);
const warm = await load(store, [['a.jsonl', v1, 1000]]);
check('an unchanged file is served from the cache without reading a byte', sig(warm.results[0]) === sig(reference(v1)) && warm.stats.unchanged === 1 && warm.stats.bytesRead === 0);

const v2 = v1 + [assistant('m2', 7), title('Renamed'), ''].join('\n');
const grown = await load(store, [['a.jsonl', v2, 2000]]);
check('an appended file reads only its new tail and matches a full parse', sig(grown.results[0]) === sig(reference(v2))
  && grown.stats.appended === 1 && grown.stats.bytesRead < enc.encode(v2).length - enc.encode(v1).length + 100);
check('titles keep last-wins order across appends', grown.results[0].titles.at(-1)[1] === 'Renamed');

const partialLine = assistant('m3', 9);
const v3 = v2 + partialLine.slice(0, 40);
const midWrite = await load(store, [['a.jsonl', v3, 3000]]);
check('a half-written last line is not counted yet', sig(midWrite.results[0]) === sig(reference(v2)));
const v4 = v2 + partialLine + '\n';
const finished = await load(store, [['a.jsonl', v4, 4000]]);
check('once the line is complete it is counted exactly once', sig(finished.results[0]) === sig(reference(v4)) && finished.results[0].entries.filter(e => e.msgId === 'm3').length === 1);

const noNewline = v4 + assistant('m4', 11);
const eof = await load(store, [['a.jsonl', noNewline, 5000]]);
check('a complete last line without a trailing newline is counted', eof.results[0].entries.some(e => e.msgId === 'm4'));
const afterEof = noNewline + '\n' + assistant('m5', 13) + '\n';
const continued = await load(store, [['a.jsonl', afterEof, 6000]]);
check('appending after such a line neither drops nor repeats it', sig(continued.results[0]) === sig(reference(afterEof)));

const rewritten = afterEof.replace('"m1"', '"mX"');
const rw = await load(store, [['a.jsonl', rewritten, 7000]]);
check('a file rewritten in place is re-read in full', sig(rw.results[0]) === sig(reference(rewritten)) && rw.stats.full === 1);
const truncated = [assistant('t1', 1), ''].join('\n');
const tr = await load(store, [['a.jsonl', truncated, 8000]]);
check('a truncated file is re-read in full', sig(tr.results[0]) === sig(reference(truncated)) && tr.stats.full === 1);

console.log('Invalidation and pruning:');
const s2 = memoryLogStore();
await load(s2, [['a.jsonl', v1, 1], ['b.jsonl', v1, 1]]);
check('a different timezone rebuilds the cache (entry dates are local)', (await load(s2, [['a.jsonl', v1, 1]], { timeZone: 'Asia/Tokyo' })).stats.full === 1);
const argsChanged = await readLogFiles('test', [{ path: 'a.jsonl', file: fakeFile(v1, 1), args: 'agent' }], parse, { store: s2, timeZone: 'Asia/Tokyo' });
check('different parse arguments (an agent type) rebuild that file', argsChanged.stats.full === 1 && argsChanged.results[0].entries[0].agentType === 'agent');
check('files that disappeared are pruned from the cache', ![...s2.map.keys()].some(k => k.endsWith('b.jsonl')));
const other = memoryLogStore();
await readLogFiles('one', [{ path: 'a.jsonl', file: fakeFile(v1, 1), args: 'main' }], parse, { store: other });
await readLogFiles('two', [{ path: 'z.jsonl', file: fakeFile(v1, 1), args: 'main' }], parse, { store: other });
check('pruning one source never touches another source', [...other.map.keys()].sort().join() === 'one|a.jsonl,two|z.jsonl');
const broken = { getAll: async () => { throw new Error('quota'); }, putMany: async () => { throw new Error('quota'); }, deleteMany: async () => {} };
const survived = await readLogFiles('test', [{ path: 'a.jsonl', file: fakeFile(v1, 1), args: 'main' }], parse, { store: broken });
check('a failing cache store never breaks loading', sig(survived.results[0]) === sig(reference(v1)));

console.log('Files that change while they are being read:');
const notReadable = () => Object.assign(new Error('changed after snapshot'), { name: 'NotReadableError' });
const flakyFile = (text, mtime, failures) => {
  const good = fakeFile(text, mtime);
  let left = failures;
  return { ...good, slice: (a, b) => (left-- > 0 ? { arrayBuffer: async () => { throw notReadable(); } } : good.slice(a, b)) };
};
let snapshots = 0;
const retry = await readLogFiles('flaky', [{ path: 'live.jsonl', args: 'main', getFile: async () => { snapshots++; return snapshots === 1 ? flakyFile(v1, 1, 1) : fakeFile(v2, 2); } }], parse, { store: memoryLogStore() });
check('a file that changes mid-read is re-opened and read from a fresh snapshot', sig(retry.results[0]) === sig(reference(v2)) && snapshots === 2 && retry.stats.full === 1);
const s3 = memoryLogStore();
await readLogFiles('flaky', [{ path: 'live.jsonl', args: 'main', file: fakeFile(v1, 1) }], parse, { store: s3 });
const stuck = await readLogFiles('flaky', [{ path: 'live.jsonl', args: 'main', getFile: async () => flakyFile(v2, 9, 99) }, { path: 'ok.jsonl', args: 'main', file: fakeFile(v2, 1) }], parse, { store: s3 });
check('a file that stays unreadable falls back to its last cached data and the load still succeeds',
  sig(stuck.results[0]) === sig(reference(v1)) && sig(stuck.results[1]) === sig(reference(v2)) && stuck.stats.unreadable === 1);
const fresh = await readLogFiles('flaky', [{ path: 'new.jsonl', args: 'main', file: flakyFile(v1, 1, 99) }], parse, { store: memoryLogStore() });
check('an unreadable file with no cache is skipped, not fatal', fresh.results[0].entries.length === 0 && fresh.stats.unreadable === 1);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll loader checks passed.');
