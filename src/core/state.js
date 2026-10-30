import { todayKey } from './dates.js';

export const state = {
  allEntries:    [],
  allDurations:  [],
  srcCode:       null,
  srcCowork:     null,
  srcCodeFromHandle: false,
  sessionTitles: new Map(),
  markup:        1,
  view:          'daily',
  activePage:    'overview',
  renderedPages: new Set(),
  budget:        0,
  openRows:      {},
  lastUpdated:   null,
  archiveName:   '',
  selectedDate:  todayKey(),
  autoDateFrom:  '',
  thousandsSep:  ',',
  decimalSep:    '.',
  moneyDecimals: 2,
  unpricedModels: [],
};
