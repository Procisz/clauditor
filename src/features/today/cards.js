import { state } from '../../core/state.js';
import { todayKey } from '../../core/dates.js';
import { entryCost, cacheWrite1h } from '../../core/config.js';
import { domEl, domText, domClear, fmtNum, fmtDuration, makeInfoIcon, calcSessionTime, fmtMoney, fmtFixed, cacheWriteSplitTitle } from '../../core/utils.js';

const STAT_COLOR = { accent: 'text-accent', yellow: 'text-warning', orange: 'text-primary', green: 'text-success' };

export function renderTodayCards(entries) {
  const today = todayKey();
  const isToday = state.selectedDate === today;
  const sessions = new Set(entries.map(e => e.sessionId));
  let totalBase = 0, totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalCacheWrite1h = 0;
  for (const e of entries) {
    totalBase      += entryCost(e);
    totalInput     += e.input;
    totalOutput    += e.output;
    totalCacheRead += e.cacheRead;
    totalCacheWrite += e.cacheWrite;
    totalCacheWrite1h += cacheWrite1h(e);
  }
  const finalCost = totalBase * state.markup;
  const cacheHitPct = (totalInput + totalCacheWrite + totalCacheRead) > 0
    ? fmtFixed((totalCacheRead / (totalInput + totalCacheWrite + totalCacheRead)) * 100, 1)
    : fmtFixed(0, 1);

  const todayDurations = state.allDurations.filter(d => d.date === state.selectedDate);
  const avgDurationMs = todayDurations.length > 0
    ? todayDurations.reduce((s, d) => s + d.durationMs, 0) / todayDurations.length
    : 0;
  const avgCostPerTurn = entries.length > 0
    ? finalCost / entries.length
    : 0;
  const sessionTimeMs = calcSessionTime(entries);

  const cards = [
    { label: (isToday ? "Today's" : state.selectedDate) + ' Final Cost', value: fmtMoney(finalCost, 4), cls: finalCost > 0 ? 'orange' : '', sub: 'incl. markup' },
    { label: 'Base Cost',          value: fmtMoney(totalBase, 4),    cls: '',       sub: 'Anthropic pricing' },
    { label: 'Sessions',           value: String(sessions.size),          cls: 'accent', sub: 'unique sessions' },
    { label: 'Session Time',       value: fmtDuration(sessionTimeMs),    cls: 'yellow', sub: 'wall-clock worked', tooltip: 'Sum of each session\'s span: last message timestamp minus first message timestamp. Includes time you spent reading and thinking, not just Claude\'s processing time.' },
    { label: 'API Calls',          value: fmtNum(entries.length),         cls: '',       sub: 'assistant turns' },
    { label: 'Input Tokens',       value: fmtNum(totalInput),             cls: '',       sub: 'fresh input' },
    { label: 'Cache Hit Rate',     value: cacheHitPct + '%',              cls: 'green',  sub: 'tokens from cache',
      tooltip: 'Share of prompt tokens served from cache, out of fresh input + cache writes + cache reads. '
        + cacheWriteSplitTitle(totalCacheWrite, totalCacheWrite1h)
        + '. A 1-hour write costs 2× the input rate, a 5-minute write 1.25×.' },
    { label: 'Avg Response Time',  value: fmtDuration(avgDurationMs),     cls: '',       sub: 'per turn' },
    { label: 'Avg Cost / Turn',    value: avgCostPerTurn > 0 ? fmtMoney(avgCostPerTurn, 4) : '—', cls: '', sub: 'incl. markup' },
  ];

  const container = document.getElementById('today-cards');
  domClear(container);
  for (const c of cards) {
    const card = domEl('div', 'card bg-base-100 card-border border-base-300');
    const body = domEl('div', 'card-body p-5 gap-1');
    const labelRow = domEl('div', 'flex items-center gap-1');
    labelRow.appendChild(domText('p', 'text-xs font-medium opacity-50 uppercase tracking-wider', c.label));
    if (c.tooltip) labelRow.appendChild(makeInfoIcon(c.tooltip));
    body.appendChild(labelRow);
    body.appendChild(domText('div', 'text-2xl font-bold tabular-nums' + (STAT_COLOR[c.cls] ? ' ' + STAT_COLOR[c.cls] : ''), c.value));
    body.appendChild(domText('p', 'text-xs opacity-40 mt-0.5', c.sub));
    card.appendChild(body);
    container.appendChild(card);
  }
}
