// ─────────────────────────────────────────────
// APP STATE — single mutable object shared across modules
// ─────────────────────────────────────────────
export const state = {
  allEntries:    [],
  allDurations:  [],
  markup:        1.35,
  view:          'daily',   // 'daily' | 'weekly' | 'monthly'
  activeTab:     'overview',
  selectedDate:  new Date().toISOString().slice(0, 10),
  tableSortDirs: {},        // tableId → 1 (asc) | -1 (desc)
  tableSortCols: {},        // tableId → active sort column index
};
