// ─────────────────────────────────────────────
// TODAY — sessions table with subagent breakdown
// ─────────────────────────────────────────────
import { ApexCharts, CHART_COLORS, getApexBaseOpts } from '../../core/charts.js';
import { state } from '../../core/state.js';
import { calcCost } from '../../core/config.js';
import { domEl, domText, domCell, domClear, fmtNum, fmtDuration, shortPath, badgeClass, shortModelName, applySortHeaders } from '../../core/utils.js';

// Palette ordered so consecutive indices are ≥63° apart on the hue wheel,
// minimising the chance that two agents sharing nearby hash values look similar.
// Hues: 225°(blue), 0°(red), 155°(green), 47°(yellow), 265°(purple),
//       185°(cyan), 28°(orange), 325°(pink), 85°(lime), 295°(fuchsia)
const AGENT_PALETTE = [
  { cls: 'badge-primary',   rgba: 'rgba(108,142,245,.85)' },  // 0 main
  { cls: 'badge-error',     rgba: 'rgba(248,113,113,.85)' },  // 1
  { cls: 'badge-success',   rgba: 'rgba(52,211,153,.85)'  },  // 2
  { cls: 'badge-warning',   rgba: 'rgba(251,191,36,.85)'  },  // 3
  { cls: 'badge-secondary', rgba: 'rgba(167,139,250,.85)' },  // 4
  { cls: 'badge-info',      rgba: 'rgba(34,211,238,.85)'  },  // 5
  { cls: 'badge-accent',     rgba: 'rgba(251,146,60,.85)'  },  // 6
  { cls: 'badge-neutral',    rgba: 'rgba(244,114,182,.85)' },  // 7
  { cls: 'badge-ghost',      rgba: 'rgba(163,230,53,.85)'  },  // 8
  { cls: 'badge-outline',    rgba: 'rgba(232,121,249,.85)' },  // 9
];

function agentPaletteIndex(agentType) {
  if (agentType === 'main') return 0;
  let h = 0;
  for (const c of (agentType || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return 1 + (h % (AGENT_PALETTE.length - 1));
}

const activeBreakdowns = new Map(); // sid → { detailTr, chart }

export function renderTodaySessionsTable(entries) {
  // Clean up any open breakdowns from previous render
  for (const [, { detailTr, chart }] of activeBreakdowns) {
    if (chart) chart.destroy();
    if (detailTr.parentNode) detailTr.remove();
  }
  activeBreakdowns.clear();

  const map = new Map();
  for (const e of entries) {
    const key = e.sessionId || '(unknown)';
    if (!map.has(key)) map.set(key, { slug: e.slug, cwd: e.cwd, minTs: e.ts, calls: 0, input: 0, output: 0, cacheRead: 0, base: 0, breakdown: new Map() });
    const s = map.get(key);
    s.calls++; s.input += e.input; s.output += e.output; s.cacheRead += e.cacheRead;
    const cost = calcCost({ input_tokens: e.input, output_tokens: e.output, cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model);
    s.base += cost;
    const bKey = (e.agentType || 'main') + '|' + e.model;
    if (!s.breakdown.has(bKey)) s.breakdown.set(bKey, { agentType: e.agentType || 'main', model: e.model, calls: 0, output: 0, base: 0 });
    const b = s.breakdown.get(bKey);
    b.calls++; b.output += e.output; b.base += cost;
  }

  // Build per-session avg response time from allDurations
  const sessionDurations = new Map();
  for (const d of state.allDurations) {
    if (d.date !== state.selectedDate) continue;
    const key = d.sessionId;
    if (!sessionDurations.has(key)) sessionDurations.set(key, { sum: 0, count: 0 });
    const s = sessionDurations.get(key);
    s.sum += d.durationMs; s.count++;
  }
  for (const [sid, d] of map) {
    const dur = sessionDurations.get(sid);
    d.avgResponse = dur ? dur.sum / dur.count : 0;
  }

  const sortCol = state.tableSortCols['table-today-sessions'];
  const sortDir = state.tableSortDirs['table-today-sessions'] || -1;
  const rows = [...map.entries()].sort((a, b) => {
    if (sortCol === 1) return (b[1].minTs || '').localeCompare(a[1].minTs || '');
    if (sortCol === 2) return (a[1].cwd || a[1].slug || '').localeCompare(b[1].cwd || b[1].slug || '');
    return b[1].base - a[1].base;
  });
  if (sortDir === 1) rows.reverse();
  applySortHeaders('table-today-sessions');
  const tbody = document.querySelector('#table-today-sessions tbody');
  domClear(tbody);
  if (rows.length === 0) {
    const tr = domEl('tr');
    const td = domEl('td'); td.colSpan = 10; td.className = 'text-center py-5 opacity-50';
    td.textContent = 'No sessions today'; tr.appendChild(td); tbody.appendChild(tr);
  } else {
    for (const [sid, d] of rows) {
      const agentTypes = new Set([...d.breakdown.values()].map(b => b.agentType));
      const hasSubagents = agentTypes.size > 1 || !agentTypes.has('main');
      const tr = domEl('tr');

      const slugCell = domCell('mono', d.slug || sid.slice(0, 8));
      slugCell.title = sid;
      if (hasSubagents) {
        const subCount = agentTypes.size - (agentTypes.has('main') ? 1 : 0);
        const badge = domEl('span', 'btn btn-xs btn-outline ml-1.5');
        badge.dataset.role = 'agents-toggle';
        badge.textContent = `▸ ${subCount} agent${subCount !== 1 ? 's' : ''}`;
        slugCell.appendChild(badge);
        tr.style.cursor = 'pointer';
        tr.onclick = () => toggleSessionBreakdown(sid, d, tr);
      }
      tr.appendChild(slugCell);
      let timeText = '—', timeTitle = '';
      if (d.minTs) {
        const dt = new Date(d.minTs);
        timeText  = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
        timeTitle = dt.toLocaleString();
      }
      const timeCell = domCell('num', timeText);
      if (timeTitle) timeCell.title = timeTitle;
      tr.appendChild(timeCell);
      tr.appendChild(domCell('mono', shortPath(d.cwd || '—')));
      tr.appendChild(domCell('num', fmtNum(d.calls)));
      tr.appendChild(domCell('num', d.avgResponse > 0 ? fmtDuration(d.avgResponse) : '—'));
      tr.appendChild(domCell('num', fmtNum(d.input)));
      tr.appendChild(domCell('num', fmtNum(d.output)));
      tr.appendChild(domCell('num', fmtNum(d.cacheRead)));
      tr.appendChild(domCell('num', '$' + d.base.toFixed(4)));
      tr.appendChild(domCell('num', '$' + (d.base * state.markup).toFixed(4)));
      tbody.appendChild(tr);
    }
  }
}

export function toggleSessionBreakdown(sid, d, parentTr) {
  if (activeBreakdowns.has(sid)) {
    const { detailTr, chart } = activeBreakdowns.get(sid);
    if (chart) chart.destroy();
    detailTr.remove();
    activeBreakdowns.delete(sid);
    const badge = parentTr.querySelector('[data-role="agents-toggle"]');
    if (badge) badge.textContent = badge.textContent.replace('▾', '▸');
    return;
  }

  // Build expanded detail row
  const detailTr = domEl('tr', 'breakdown-row');
  const td = domEl('td');
  td.colSpan = 10;

  const inner = domEl('div', 'breakdown-inner');

  // ── Left: breakdown table ──
  const tableWrap = domEl('div');
  tableWrap.style.flex = '1';
  const tbl = domEl('table', 'breakdown-table');
  const thead = domEl('thead');
  const htr = domEl('tr');
  for (const [label, cls] of [['Agent', ''], ['Model', ''], ['Calls', 'num'], ['Output', 'num'], ['Cost', 'num']]) {
    const th = domEl('th', cls); th.textContent = label; htr.appendChild(th);
  }
  thead.appendChild(htr);
  tbl.appendChild(thead);

  const tbdy = domEl('tbody');
  const bRows = [...d.breakdown.values()].sort((a, b) => b.base - a.base);

  // Assign colors by position within this session (main=0, others=1,2,3…)
  // Guarantees no two agents in the same breakdown share a color.
  const sessionColorIdx = new Map();
  let ci = 0;
  const mainRow = bRows.find(b => b.agentType === 'main');
  if (mainRow) sessionColorIdx.set('main', ci++);
  for (const b of bRows) {
    if (!sessionColorIdx.has(b.agentType)) sessionColorIdx.set(b.agentType, ci++);
  }
  const sessionBadgeClass  = t => AGENT_PALETTE[sessionColorIdx.get(t) % AGENT_PALETTE.length].cls;
  const sessionChartColor  = t => AGENT_PALETTE[sessionColorIdx.get(t) % AGENT_PALETTE.length].rgba;

  for (const b of bRows) {
    const btr = domEl('tr');
    const agTd = domEl('td');
    const agBadge = domEl('span', 'badge ' + sessionBadgeClass(b.agentType));
    agBadge.textContent = b.agentType;
    agTd.appendChild(agBadge); btr.appendChild(agTd);
    const mTd = domEl('td');
    const mBadge = domEl('span', 'badge ' + badgeClass(b.model));
    mBadge.textContent = shortModelName(b.model);
    mTd.appendChild(mBadge); btr.appendChild(mTd);
    btr.appendChild(domCell('num', String(b.calls)));
    btr.appendChild(domCell('num', fmtNum(b.output)));
    btr.appendChild(domCell('num', '$' + (b.base * state.markup).toFixed(4)));
    tbdy.appendChild(btr);
  }
  tbl.appendChild(tbdy);
  tableWrap.appendChild(tbl);
  inner.appendChild(tableWrap);

  // ── Right: donut chart ──
  const chartWrap = domEl('div', 'breakdown-chart');
  inner.appendChild(chartWrap);
  td.appendChild(inner);
  detailTr.appendChild(td);
  parentTr.insertAdjacentElement('afterend', detailTr);

  const agentTotals = new Map();
  for (const b of bRows) agentTotals.set(b.agentType, (agentTotals.get(b.agentType) || 0) + b.base * state.markup);
  const labels = [...agentTotals.keys()];
  const base   = getApexBaseOpts();
  const chart  = new ApexCharts(chartWrap, {
    chart:      { ...base.chart, type: 'donut', height: 160, width: 160, animations: { enabled: false } },
    theme:      base.theme,
    series:     labels.map(l => agentTotals.get(l)),
    labels,
    colors:     labels.map(l => sessionChartColor(l)),
    tooltip:    { ...base.tooltip, y: { formatter: v => '$' + v.toFixed(4) } },
    dataLabels: { enabled: false },
    legend:     { show: false },
    plotOptions: { pie: { donut: { size: '60%' } } },
  });
  chart.render();

  activeBreakdowns.set(sid, { detailTr, chart });
  const badge = parentTr.querySelector('[data-role="agents-toggle"]');
  if (badge) badge.textContent = badge.textContent.replace('▸', '▾');
}
