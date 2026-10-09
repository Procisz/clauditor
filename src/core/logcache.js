import { parseLogLines } from './parser.js';
import { openDB, LOG_STORE } from './db.js';

export const LOG_CACHE_VERSION = 1;
const FINGERPRINT_BYTES = 64;
const CHUNK_BYTES = 16 * 1024 * 1024;
const BYTE_BUDGET = 256 * 1024 * 1024;
const MAX_PARALLEL = 8;
const NEWLINE = 10;

const decoder = new TextDecoder();

export const currentTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || '';

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function recordsFromBytes(bytes) {
  const records = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + CHUNK_BYTES, bytes.length);
    if (end < bytes.length) {
      const back = bytes.lastIndexOf(NEWLINE, end - 1);
      end = back >= start ? back + 1 : (bytes.indexOf(NEWLINE, end) + 1 || bytes.length);
    }
    for (const r of parseLogLines(decoder.decode(bytes.subarray(start, end)))) records.push(r);
    start = end;
  }
  return records;
}

export async function readCompleteLines(file, from, expectedFingerprint) {
  const fpLen = expectedFingerprint ? expectedFingerprint.length : 0;
  const bytes = new Uint8Array(await file.slice(from - fpLen, file.size).arrayBuffer());
  if (fpLen && !sameBytes(bytes.subarray(0, fpLen), expectedFingerprint)) return null;
  const body = bytes.subarray(fpLen);
  let complete = body.lastIndexOf(NEWLINE) + 1;
  const records = recordsFromBytes(body.subarray(0, complete));
  if (complete < body.length) {
    const tail = decoder.decode(body.subarray(complete)).trim();
    if (tail) {
      try {
        const parsed = parseLogLines(tail);
        JSON.parse(tail);
        records.push(...parsed);
        complete = body.length;
      } catch {}
    }
  }
  const endInBytes = fpLen + complete;
  return {
    records,
    parsedUpTo: from + complete,
    fingerprint: bytes.slice(Math.max(0, endInBytes - FINGERPRINT_BYTES), endInBytes),
    bytesRead: bytes.length,
  };
}

const mergeData = (a, b) => ({
  entries: a.entries.concat(b.entries),
  durations: a.durations.concat(b.durations),
  titles: [...new Map([...a.titles, ...b.titles])],
});

function byteBudget(limit) {
  let used = 0;
  const waiting = [];
  const releaser = n => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      used -= n;
      while (waiting.length && (used === 0 || used + waiting[0].n <= limit)) {
        const w = waiting.shift();
        used += w.n;
        w.resolve(releaser(w.n));
      }
    };
  };
  return {
    acquire: n => new Promise(resolve => {
      if (used === 0 || used + n <= limit) { used += n; resolve(releaser(n)); }
      else waiting.push({ n, resolve });
    }),
  };
}

export async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const run = async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run));
  return out;
}

const EMPTY_DATA = () => ({ entries: [], durations: [], titles: [] });
const MAX_READ_ATTEMPTS = 4;

async function readChanged(file, cachedRecord, parse, item) {
  let read = null;
  let base = null;
  let kind = 'full';
  if (cachedRecord && file.size > cachedRecord.parsedUpTo && cachedRecord.fingerprint && cachedRecord.fingerprint.length) {
    read = await readCompleteLines(file, cachedRecord.parsedUpTo, cachedRecord.fingerprint);
    if (read) { base = cachedRecord.data; kind = 'appended'; }
  }
  if (!read) read = await readCompleteLines(file, 0, null);
  const fresh = parse(read.records, item);
  return { kind, read, data: base ? mergeData(base, fresh) : fresh };
}

export async function readLogFiles(source, items, parse, { store = idbLogStore, onProgress, timeZone = currentTimeZone() } = {}) {
  const prefix = source + '|';
  let cachedList = [];
  try { cachedList = await store.getAll(prefix); } catch {}
  const cached = new Map(cachedList.map(r => [r.key, r]));
  const results = new Array(items.length);
  const updates = [];
  const stats = { files: items.length, unchanged: 0, appended: 0, full: 0, unreadable: 0, bytesRead: 0 };
  const budget = byteBudget(BYTE_BUDGET);
  let done = 0;

  await mapLimit(items, MAX_PARALLEL, async (item, i) => {
    const key = prefix + item.path;
    const c = cached.get(key);
    const usable = c && c.v === LOG_CACHE_VERSION && c.args === item.args && c.tz === timeZone ? c : null;
    let outcome = null;
    for (let attempt = 0; attempt < MAX_READ_ATTEMPTS && !outcome; attempt++) {
      let file;
      try { file = item.getFile ? await item.getFile() : item.file; } catch { break; }
      if (usable && usable.size === file.size && usable.lastModified === file.lastModified) {
        outcome = { kind: 'unchanged', data: usable.data };
        break;
      }
      const release = await budget.acquire(file.size);
      try {
        const r = await readChanged(file, usable, parse, item);
        outcome = r;
        stats.bytesRead += r.read.bytesRead;
        updates.push({
          key, v: LOG_CACHE_VERSION, args: item.args, tz: timeZone, size: file.size, lastModified: file.lastModified,
          parsedUpTo: r.read.parsedUpTo, fingerprint: r.read.fingerprint, data: r.data,
        });
      } catch (err) {
        if (!(err && err.name === 'NotReadableError' && item.getFile)) break;
      } finally {
        release();
      }
    }
    if (!outcome) outcome = { kind: 'unreadable', data: usable ? usable.data : EMPTY_DATA() };
    results[i] = outcome.data;
    stats[outcome.kind]++;
    done++;
    if (onProgress) onProgress(done, items.length);
  });

  const live = new Set(items.map(it => prefix + it.path));
  const stale = [...cached.keys()].filter(k => !live.has(k));
  try { if (updates.length) await store.putMany(updates); } catch {}
  try { if (stale.length) await store.deleteMany(stale); } catch {}
  return { results, stats };
}

function tx(mode, run) {
  return openDB().then(db => new Promise((res, rej) => {
    const t = db.transaction(LOG_STORE, mode);
    const out = run(t.objectStore(LOG_STORE));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = e => rej(e.target.error);
    t.onabort = e => rej(e.target.error);
  }));
}

export const idbLogStore = {
  getAll: prefix => tx('readonly', s => s.getAll(IDBKeyRange.bound(prefix, prefix + '￿'))),
  putMany: records => tx('readwrite', s => { for (const r of records) s.put(r, r.key); }),
  deleteMany: keys => tx('readwrite', s => { for (const k of keys) s.delete(k); }),
};

export function memoryLogStore() {
  const map = new Map();
  return {
    map,
    getAll: async prefix => [...map.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
    putMany: async records => { for (const r of records) map.set(r.key, structuredClone(r)); },
    deleteMany: async keys => { for (const k of keys) map.delete(k); },
  };
}
