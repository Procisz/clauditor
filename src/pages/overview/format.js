import { getLocale } from '../../i18n/index.js';

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

export function shortMonthLabel(key) {
  return new Intl.DateTimeFormat(getLocale(), { month: 'short', timeZone: 'UTC' }).format(utcDate(key));
}

export function weekdayLabels() {
  const format = new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

export function weekdayIndex(dayKeyString) {
  return (utcDate(dayKeyString).getUTCDay() + 6) % 7;
}
