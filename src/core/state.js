// ─────────────────────────────────────────────
// APP STATE — single mutable object shared across modules
// ─────────────────────────────────────────────
import { todayKey } from './dates.js';

export const state = {
  allEntries:    [],
  allDurations:  [],
  markup:        1,
  view:          'daily',   // 'daily' | 'weekly' | 'monthly'
  activeTab:     'overview',
  selectedDate:  todayKey(),
  tableSortDirs: {},        // tableId → 1 (asc) | -1 (desc)
  tableSortCols: {},        // tableId → active sort column index
};
