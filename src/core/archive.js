// ─────────────────────────────────────────────
// ARCHIVE — optional on-disk snapshot to survive Claude Code log pruning.
// Format: one append-only JSONL file per calendar month:
//   clauditor-archive-YYYY-MM.jsonl
// Each line is {kind:'e',...entryFields} or {kind:'d',...durationFields}.
// Reads skip months outside the active date-from filter, so loading stays
// fast even as the archive grows over years.
// ─────────────────────────────────────────────
import { state } from './state.js';
import { openDB } from './db.js';
import { entryKey, durationKey } from './parser.js';
import { dayKey } from './dates.js';

const ARCHIVE_KEY = 'archiveHandle';

function monthFileName(ym) { return `clauditor-archive-${ym}.jsonl`; }
function monthOf(ts) { return ts.slice(0, 7); }

async function saveArchiveHandle(handle) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, ARCHIVE_KEY);
    tx.oncomplete = res;
    tx.onerror = e => rej(e.target.error);
  });
}

export async function getArchiveHandle() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(ARCHIVE_KEY);
    req.onsuccess = e => res(e.target.result || null);
    req.onerror = e => rej(e.target.error);
  });
}

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
  const entries = [], durations = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const r = JSON.parse(line);
      // The stored `date` was derived in whatever timezone wrote the archive —
      // recompute from the timestamp so display follows the current viewer's clock
      if (r.kind === 'e') { const { kind: _, ...e } = r; e.date = dayKey(e.ts); entries.push(e); }
      else if (r.kind === 'd') { const { kind: _, ...d } = r; d.date = dayKey(d.ts); durations.push(d); }
    } catch { console.warn('Archive: skipping malformed line:', line.slice(0, 80)); }
  }
  return { entries, durations };
}

// Returns the sorted list of YYYY-MM strings that have archive files in the folder.
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
    return { entries: [], durations: [] };
  }
}

// Read archive months that fall within [fromMonth, ∞).
// fromMonth is YYYY-MM or '' (read all).
export async function readArchive(handle, fromMonth = '') {
  if (!handle) return { entries: [], durations: [] };
  try {
    if (!await ensurePermission(handle)) return { entries: [], durations: [] };
    const months = await listArchiveMonths(handle);
    const relevant = fromMonth ? months.filter(m => m >= fromMonth) : months;
    const allEntries = [], allDurations = [];
    for (const ym of relevant) {
      const { entries, durations } = await readMonthFile(handle, ym);
      allEntries.push(...entries);
      allDurations.push(...durations);
    }
    return { entries: allEntries, durations: allDurations };
  } catch (e) {
    console.warn('Archive read failed:', e);
    return { entries: [], durations: [] };
  }
}

// Append only new entries to their respective month files.
export async function writeArchive(handle) {
  if (!handle) return;
  try {
    if (!await ensurePermission(handle)) return;

    // Group state entries/durations by month
    const byMonth = new Map();
    const touch = ym => { if (!byMonth.has(ym)) byMonth.set(ym, { entries: [], durations: [] }); return byMonth.get(ym); };
    for (const e of state.allEntries)   touch(monthOf(e.ts)).entries.push(e);
    for (const d of state.allDurations) touch(monthOf(d.ts)).durations.push(d);

    for (const [ym, { entries, durations }] of byMonth) {
      // Read existing month file once — derive both the dedup key set and byte length
      const seenKeys = new Set();
      let existingByteLength = 0;
      try {
        const fh = await handle.getFileHandle(monthFileName(ym));
        const file = await fh.getFile();
        existingByteLength = file.size;
        const parsed = parseLines(await file.text());
        for (const e of parsed.entries)   seenKeys.add(entryKey(e));
        for (const d of parsed.durations) seenKeys.add(durationKey(d));
      } catch {}

      const newEntries   = entries.filter(e => !seenKeys.has(entryKey(e)));
      const newDurations = durations.filter(d => !seenKeys.has(durationKey(d)));
      if (newEntries.length === 0 && newDurations.length === 0) continue;

      const lines = [
        ...newEntries.map(e   => JSON.stringify({ kind: 'e', ...e })),
        ...newDurations.map(d => JSON.stringify({ kind: 'd', ...d })),
      ].join('\n') + '\n';

      const fileHandle = await handle.getFileHandle(monthFileName(ym), { create: true });
      // keepExistingData: true preserves existing bytes in the stream; we seek to end to append
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
    if (state.allEntries.length > 0) {
      // Merge any existing archive entries into current state before writing,
      // so historical data from a prior session is not lost.
      const fromMonth = localStorage.getItem('clauditor_date_from')?.slice(0, 7) || '';
      const { entries, durations } = await readArchive(handle, fromMonth);
      const existingIds = new Set(state.allEntries.map(entryKey));
      for (const e of entries) {
        if (!existingIds.has(entryKey(e))) state.allEntries.push(e);
      }
      const existingDurKeys = new Set(state.allDurations.map(durationKey));
      for (const d of durations) {
        if (!existingDurKeys.has(durationKey(d))) state.allDurations.push(d);
      }
      state.allEntries.sort((a, b) => a.ts.localeCompare(b.ts));
      await writeArchive(handle);
      rerenderCallback?.();
    }
  } catch (e) {
    if (e.name !== 'AbortError') console.error('Archive folder error:', e);
  }
}
