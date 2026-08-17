// ─────────────────────────────────────────────
// APP STATE — single mutable object shared across modules
// ─────────────────────────────────────────────
import { todayKey } from './dates.js';

export const state = {
  allEntries:    [],         // assembled from srcCode + srcCowork by assembleState()
  allDurations:  [],
  srcCode:       null,       // { entries, durations, titles: Map, liveSids: Set } — Claude Code logs + archive
  srcCowork:     null,       // { entries, durations, titles: Map } — Cowork store (audit + .claude trees)
  srcCodeFromHandle: false,  // code source came from a persistent handle (enables Refresh)
  sessionTitles: new Map(),  // sessionId → user-facing title (from custom-title records)
  liveTitleSids: new Set(),  // sids whose title came from live logs (beats any archive's copy)
  markup:        1,
  view:          'daily',   // 'daily' | 'weekly' | 'monthly'
  activeTab:     'overview',
  selectedDate:  todayKey(),
  tableSortDirs: {},        // tableId → 1 (asc) | -1 (desc)
  tableSortCols: {},        // tableId → active sort column index
  modelPanels:   {},        // 'm:'+model / 'p:'+projectKey → { open, sortCol, sortDir, pageSize, pageIndex } (expansion panels)
  projectsPage:  { pageSize: 10, pageIndex: 0 },  // Top Projects table pagination
  autoDateFrom:  '',        // earliest loaded date, auto-filled into "from" (≠ a user choice)
  thousandsSep:  ',',       // number formatting separators (user-configurable, persisted)
  decimalSep:    '.',
};
