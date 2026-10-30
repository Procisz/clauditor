import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', '..');

export function mountShellDom({ from = '2026-10-09', to = '2026-10-15' } = {}) {
  const header = readFileSync(path.join(root, 'src', 'html', 'partials', 'header.html'), 'utf8');
  document.body.innerHTML = `${header}
    <main>
      <div id="welcome"></div>
      <div id="loading" hidden><p id="loading-text"></p></div>
      <div id="dashboard" hidden><div id="app-main"></div></div>
    </main>`;
  document.getElementById('date-from').value = from;
  document.getElementById('date-to').value = to;
}
