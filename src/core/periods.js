const pad = (n) => String(n).padStart(2, '0');

function monthEnd(year, month) {
  return `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
}

export function quickPeriods({ today, min, max }) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const prevMonthYear = month === 1 ? year - 1 : year;
  const prevMonthNumber = month === 1 ? 12 : month - 1;
  const raw = [
    ['all', min, today],
    ['prevMonth', `${prevMonthYear}-${pad(prevMonthNumber)}-01`, monthEnd(prevMonthYear, prevMonthNumber)],
    ['curMonth', `${year}-${pad(month)}-01`, today],
    ['prevYear', `${year - 1}-01-01`, `${year - 1}-12-31`],
    ['curYear', `${year}-01-01`, today],
  ];
  return raw.map(([id, rawFrom, rawTo]) => {
    const from = rawFrom > min ? rawFrom : min;
    const to = rawTo < today ? rawTo : today;
    const has = min !== '' && rawFrom <= max && rawTo >= min && from <= to;
    return { id, from, to, has };
  });
}

export function activeQuickId(periods, { from, to }) {
  return periods.find((p) => p.has && p.from === from && p.to === to)?.id ?? '';
}
