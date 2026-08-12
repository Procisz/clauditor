// ─────────────────────────────────────────────
// OVERVIEW — orchestrator: renderAll, setView, exportCsv
// ─────────────────────────────────────────────
import { state } from '../../core/state.js';
import { calcCost } from '../../core/config.js';
import { getFilteredEntries, bucketEntries } from '../../core/parser.js';
import { renderCards, renderBurnRate } from './cards.js';
import { renderCostChart, renderTokenChart, renderCacheChart, renderTreemap, renderCumulativeSpend } from './charts.js';
import { renderHeatmap } from './heatmap.js';
import { renderModelTable, renderProjectsTable } from './tables.js';
import { renderTodayView } from '../today/index.js';

function renderViewDependentCharts() {
  const entries = getFilteredEntries();
  renderCards(entries);
  renderBurnRate();
  const { labels, data } = bucketEntries(entries);
  renderCostChart(labels, data);
  renderTokenChart(labels, data);
  renderCacheChart(labels, data);
  renderModelTable(entries);
  renderTreemap(entries);
  renderProjectsTable(entries);
  renderCumulativeSpend();
  if (state.activeTab === 'today') renderTodayView();
}

export function renderAll() {
  state.markup = Math.max(0, parseFloat(document.getElementById('markup-input').value) || 1.35);
  localStorage.setItem('clauditor_markup', state.markup);
  const dateFrom = document.getElementById('date-from').value;
  if (dateFrom) localStorage.setItem('clauditor_date_from', dateFrom);
  renderViewDependentCharts();
  renderHeatmap();
}

export function onMarkupChange() { renderAll(); }

export function setView(v) {
  state.view = v;
  document.querySelectorAll('#view-toggle button').forEach(b => {
    const active = b.dataset.view === v;
    b.classList.toggle('btn-primary', active);
    b.classList.toggle('btn-ghost', !active);
  });
  renderViewDependentCharts();
}

export function exportCsv() {
  const entries = getFilteredEntries();
  const esc = v => (String(v).includes(',') || String(v).includes('"') || String(v).includes('\n'))
    ? '"' + String(v).replace(/"/g, '""') + '"'
    : String(v);

  const header = ['timestamp','date','session_id','project','model','agent_type',
    'input_tokens','output_tokens','cache_write_tokens','cache_read_tokens',
    'base_cost','final_cost'];

  const rows = entries.map(e => {
    const base = calcCost({ input_tokens: e.input, output_tokens: e.output,
      cache_creation_input_tokens: e.cacheWrite, cache_read_input_tokens: e.cacheRead }, e.model);
    return [e.ts, e.date, e.sessionId, e.cwd || e.slug, e.model, e.agentType,
      e.input, e.output, e.cacheWrite, e.cacheRead,
      base.toFixed(8), (base * state.markup).toFixed(8)].map(esc).join(',');
  });

  const csv = [header.join(','), ...rows].join('\r\n');
  const from = document.getElementById('date-from').value || 'all';
  const to   = document.getElementById('date-to').value   || 'all';
  const filename = `clauditor-${from}-to-${to}.csv`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
