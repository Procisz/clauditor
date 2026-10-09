import { todayKey } from './dates.js';

export const state = {
  allEntries:    [],
  allDurations:  [],
  srcCode:       null,
  srcCowork:     null,
  srcCodeFromHandle: false,
  sessionTitles: new Map(),
  liveTitleSids: new Set(),
  markup:        1,
  view:          'daily',
  activeTab:     'overview',
  selectedDate:  todayKey(),
  tableSortDirs: {},
  tableSortCols: {},
  modelPanels:   {},
  projectsPage:  { pageSize: 10, pageIndex: 0 },
  autoDateFrom:  '',
  thousandsSep:  ',',
  decimalSep:    '.',
  moneyDecimals: 2,
  unpricedModels: [],
};
