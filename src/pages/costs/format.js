import { getLocale, t } from '../../i18n/index.js';

const utcDate = (key) => new Date(`${key.length === 7 ? `${key}-01` : key}T00:00:00Z`);

export function bucketLabel(key, view) {
  const options = view === 'monthly'
    ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(getLocale(), options).format(utcDate(key));
}

export function dayLabel(key) {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(utcDate(key));
}

export function monthLabel(key) {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcDate(key));
}

export function weekdayLabels() {
  const format = new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

export function previousMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function tokenTypeLabel(type) {
  return t(`costs.type.${type}`);
}
