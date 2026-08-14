// ─────────────────────────────────────────────
// DATES — single source of truth for date bucketing.
//
// Log timestamps are UTC instants (ISO strings ending in Z). Every "which day
// does this belong to" question is answered in the VIEWER'S LOCAL TIMEZONE,
// so sessions recorded in any timezone group consistently with the wall clock
// of whoever is looking at the dashboard. Never derive a day by slicing the
// raw timestamp string — that yields the UTC day and shifts evening entries
// to the next day for UTC+ viewers.
//
// Day strings (YYYY-MM-DD) are pure calendar values. Arithmetic on them
// (week start, day shift) intentionally uses Date.UTC internals: with only
// calendar math applied, no DST or offset can leak in.
// ─────────────────────────────────────────────

// UTC instant (ISO string or Date) → local calendar day 'YYYY-MM-DD'
export function dayKey(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d)) return '';
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

export function todayKey() { return dayKey(new Date()); }

// Day string → month key 'YYYY-MM'
export function getMonthKey(dateStr) { return dateStr.slice(0, 7); }

// Day string → Monday of that week, as a day string
export function getWeekKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=Sun
  const diff = d - day + (day === 0 ? -6 : 1); // Mon
  const mon = new Date(Date.UTC(y, m - 1, diff));
  return mon.toISOString().slice(0, 10);
}

// Day string ± n days → day string
export function shiftDay(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
