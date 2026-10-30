import { fmtFixed, fmtInt, fmtMoney, fmtNum, tokenBar } from '../../core/utils.js';
import { esc } from '../../ui/dom.js';
import { t, tn } from '../../i18n/index.js';
import { TOKEN_TOKENS, TOKEN_TYPES, tokenUsage } from './data.js';
import { tokenTypeLabel } from './format.js';

const color = (type) => `var(${TOKEN_TOKENS[type]})`;

export function renderTokenUsage(host, entries, markup) {
  const { rows, totalTokens, totalCost, calls } = tokenUsage(entries, markup);
  const byType = new Map(rows.map((row) => [row.type, row]));
  const bar = tokenBar(TOKEN_TYPES.map((type) => ({
    label: tokenTypeLabel(type),
    value: byType.get(type).tokens,
    color: color(type),
  })));

  const sub = totalTokens > 0
    ? tn('costs.tokens.headlineSub', calls, { tokens: fmtNum(totalTokens) })
    : t('costs.tokens.none');
  const body = rows.map((row) => `<tr>
      <td><span class="mbar-dot token-dot" style="background:${color(row.type)}"></span>${esc(tokenTypeLabel(row.type))}</td>
      <td class="num" title="${esc(t('costs.tokens.tokensTitle', { value: fmtNum(row.tokens) }))}">${esc(fmtInt(row.tokens))}</td>
      <td class="num">${esc(totalTokens > 0 ? `${fmtFixed((row.tokens / totalTokens) * 100, 1)}%` : '-')}</td>
      <td class="num">${esc(fmtMoney(row.cost))}</td>
      <td class="num">${esc(totalCost > 0 ? `${fmtFixed((row.cost / totalCost) * 100, 1)}%` : '-')}</td>
    </tr>`).join('');

  host.innerHTML = `<div class="token-head">
      <div class="kv">
        <span class="stat-value">${esc(fmtInt(totalTokens))}</span>
        <span class="faint small">${esc(sub)}</span>
      </div>
      <div class="token-bar"></div>
    </div>
    <div class="table-scroll"><table class="tbl">
      <thead><tr>
        <th>${esc(t('costs.tokens.col.type'))}</th>
        <th class="num">${esc(t('costs.tokens.col.tokens'))}</th>
        <th class="num">${esc(t('costs.tokens.col.share'))}</th>
        <th class="num">${esc(t('costs.tokens.col.cost'))}</th>
        <th class="num">${esc(t('costs.tokens.col.costShare'))}</th>
      </tr></thead>
      <tbody>${body}<tr class="total-row">
        <td>${esc(t('costs.tokens.total'))}</td>
        <td class="num">${esc(fmtInt(totalTokens))}</td>
        <td class="num">${esc(totalTokens > 0 ? '100%' : '-')}</td>
        <td class="num">${esc(fmtMoney(totalCost))}</td>
        <td class="num">${esc(totalCost > 0 ? '100%' : '-')}</td>
      </tr></tbody>
    </table></div>`;
  host.querySelector('.token-bar').append(bar);
}
