export function dayKey(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d)) return '';
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

export function todayKey() { return dayKey(new Date()); }

export function getMonthKey(dateStr) { return dateStr.slice(0, 7); }

export function getWeekKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const diff = d - day + (day === 0 ? -6 : 1);
  const mon = new Date(Date.UTC(y, m - 1, diff));
  return mon.toISOString().slice(0, 10);
}

export function shiftDay(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
