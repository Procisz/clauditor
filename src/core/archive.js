import { state } from './state.js';
import { saveHandle, loadHandle } from './db.js';
import { entryKey, durationKey } from './parser.js';
import { dayKey } from './dates.js';

const ARCHIVE_KEY = 'archiveHandle';

function monthFileName(ym) { return `clauditor-archive-${ym}.jsonl`; }
function monthOf(ts) { return ts.slice(0, 7); }

function saveArchiveHandle(handle) { return saveHandle(handle, ARCHIVE_KEY); }

export function getArchiveHandle() { return loadHandle(ARCHIVE_KEY); }

export function updateArchiveButton(folderName) {
  const btn = document.getElementById('btn-archive');
  if (!btn) return;
  if (folderName) {
    btn.textContent = 'Archive: ' + folderName;
    btn.title = 'Archive active — click to change folder';
    btn.classList.replace('btn-ghost', 'btn-success');
  } else {
    btn.textContent = 'Set Archive';
    btn.title = 'Set a folder to persist data across Claude Code log cleanups';
    btn.classList.replace('btn-success', 'btn-ghost');
  }
}

async function ensurePermission(handle) {
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') return true;
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

function parseLines(text) {
  const entries = [], durations = [], titles = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const r = JSON.parse(line);

      if (r.kind === 'e') { const { kind: _, ...e } = r; e.date = dayKey(e.ts); entries.push(e); }
      else if (r.kind === 'd') { const { kind: _, ...d } = r; d.date = dayKey(d.ts); durations.push(d); }
      else if (r.kind === 't') { if (r.sessionId && r.title) titles.push([r.sessionId, r.title]); }
    } catch { console.warn('Archive: skipping malformed line:', line.slice(0, 80)); }
  }
  return { entries, durations, titles };
}

async function listArchiveMonths(handle) {
  const months = [];
  for await (const [name] of handle.entries()) {
    const m = name.match(/^clauditor-archive-(\d{4}-\d{2})\.jsonl$/);
    if (m) months.push(m[1]);
  }
  return months.sort();
}

async function readMonthFile(handle, ym) {
  try {
    const fh = await handle.getFileHandle(monthFileName(ym));
    return parseLines(await (await fh.getFile()).text());
  } catch {
    return { entries: [], durations: [], titles: [] };
  }
}

export async function readArchive(handle, fromMonth = '') {
  if (!handle) return { entries: [], durations: [], titles: new Map() };
  try {
    if (!await ensurePermission(handle)) return { entries: [], durations: [], titles: new Map() };
    const months = await listArchiveMonths(handle);
    const relevant = fromMonth ? months.filter(m => m >= fromMonth) : months;
    const allEntries = [], allDurations = [];
    const allTitles = new Map();
    for (const ym of relevant) {
      const { entries, durations, titles } = await readMonthFile(handle, ym);
      allEntries.push(...entries);
      allDurations.push(...durations);
      for (const [sid, t] of titles) allTitles.set(sid, t);
    }
    return { entries: allEntries, durations: allDurations, titles: allTitles };
  } catch (e) {
    console.warn('Archive read failed:', e);
    return { entries: [], durations: [], titles: new Map() };
  }
}

export async function writeArchive(handle) {
  if (!handle) return;
  try {
    if (!await ensurePermission(handle)) return;

    const byMonth = new Map();
    const touch = ym => { if (!byMonth.has(ym)) byMonth.set(ym, { entries: [], durations: [] }); return byMonth.get(ym); };
    for (const e of state.allEntries)   touch(monthOf(e.ts)).entries.push(e);
    for (const d of state.allDurations) touch(monthOf(d.ts)).durations.push(d);

    for (const [ym, { entries, durations }] of byMonth) {

      const seenKeys = new Set();

      const missingEntrypoint = new Set();
      const lastArchivedTitle = new Map();
      let existingByteLength = 0;
      try {
        const fh = await handle.getFileHandle(monthFileName(ym));
        const file = await fh.getFile();
        existingByteLength = file.size;
        const parsed = parseLines(await file.text());
        for (const e of parsed.entries) {
          const k = entryKey(e);
          seenKeys.add(k);
          if (e.entrypoint === undefined) missingEntrypoint.add(k);
          else missingEntrypoint.delete(k);
        }
        for (const d of parsed.durations) seenKeys.add(durationKey(d));

        for (const [sid, t] of parsed.titles) lastArchivedTitle.set(sid, t);
      } catch {}

      const newEntries = entries.filter(e => {
        const k = entryKey(e);
        return !seenKeys.has(k) || (e.entrypoint && missingEntrypoint.has(k));
      });
      const newDurations = durations.filter(d => !seenKeys.has(durationKey(d)));

      const monthSids = new Set(entries.map(e => e.sessionId).filter(Boolean));
      const newTitles = [...monthSids]
        .map(sid => [sid, state.sessionTitles.get(sid)])
        .filter(([sid, t]) => t && lastArchivedTitle.get(sid) !== t);
      if (newEntries.length === 0 && newDurations.length === 0 && newTitles.length === 0) continue;

      const lines = [
        ...newEntries.map(e   => JSON.stringify({ kind: 'e', ...e })),
        ...newDurations.map(d => JSON.stringify({ kind: 'd', ...d })),
        ...newTitles.map(([sessionId, title]) => JSON.stringify({ kind: 't', sessionId, title })),
      ].join('\n') + '\n';

      const fileHandle = await handle.getFileHandle(monthFileName(ym), { create: true });

      const writable = await fileHandle.createWritable({ keepExistingData: true });
      await writable.seek(existingByteLength);
      await writable.write(lines);
      await writable.close();
    }
  } catch (e) {
    console.warn('Archive write failed:', e);
  }
}

export async function selectArchiveFolder(rerenderCallback) {
  if (!('showDirectoryPicker' in window)) return;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveArchiveHandle(handle);
    updateArchiveButton(handle.name);
    if (state.srcCode || state.srcCowork) {

      const src = state.srcCode || (state.srcCode = { entries: [], durations: [], titles: new Map(), liveSids: new Set() });
      const fromMonth = localStorage.getItem('clauditor_date_from')?.slice(0, 7) || '';
      const { entries, durations, titles } = await readArchive(handle, fromMonth);

      for (const [sid, t] of titles) {
        if (!src.liveSids.has(sid) && !(state.srcCowork && state.srcCowork.titles.has(sid))) src.titles.set(sid, t);
      }
      const existingIds = new Set(state.allEntries.map(entryKey));

      const byKey = new Map();
      for (const e of entries) byKey.set(entryKey(e), e);
      for (const e of byKey.values()) {
        if (!existingIds.has(entryKey(e))) src.entries.push(e);
      }
      const existingDurKeys = new Set(src.durations.map(durationKey));
      for (const d of durations) {
        if (!existingDurKeys.has(durationKey(d))) src.durations.push(d);
      }
      rerenderCallback?.();
    }
  } catch (e) {
    if (e.name !== 'AbortError') console.error('Archive folder error:', e);
  }
}
