export const SUN_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
export const MOON_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

export function _syncThemeBtn(theme) {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  btn.innerHTML = theme === 'dracula' ? SUN_ICON : MOON_ICON;
  btn.title = theme === 'dracula' ? 'Switch to light mode' : 'Switch to dark mode';
}

export function initTheme() {
  const saved = localStorage.getItem('clauditor_theme');
  const theme = saved === 'dracula' ? 'dracula' : 'winter';
  document.documentElement.dataset.theme = theme;
  _syncThemeBtn(theme);
}

export function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dracula';
  const next = isDark ? 'winter' : 'dracula';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('clauditor_theme', next);
  _syncThemeBtn(next);
}
