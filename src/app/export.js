import { state } from '../core/state.js';
import { entryCost, cacheWrite5m, cacheWrite1h } from '../core/config.js';
import { getFilteredEntries } from '../core/parser.js';

export function exportCsv() {
  const entries = getFilteredEntries();
  const esc = v => (String(v).includes(',') || String(v).includes('"') || String(v).includes('\n'))
    ? '"' + String(v).replace(/"/g, '""') + '"'
    : String(v);

  const header = ['timestamp','date','session_id','project','model','agent_type',
    'input_tokens','output_tokens','cache_write_tokens','cache_write_5m_tokens','cache_write_1h_tokens','cache_read_tokens',
    'base_cost','final_cost'];

  const rows = entries.map(e => {
    const base = entryCost(e);
    return [e.ts, e.date, e.sessionId, e.cwd || e.slug, e.model, e.agentType,
      e.input, e.output, e.cacheWrite, cacheWrite5m(e), cacheWrite1h(e), e.cacheRead,
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
