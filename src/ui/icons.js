const SPRITE_ID = 'icon-sprite';

export const ICON_SPRITE = `<svg id="icon-sprite" style="display:none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
<symbol id="i-overview" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5" fill="var(--icon-fill, transparent)"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5" fill="var(--icon-fill, transparent)"/></symbol>
<symbol id="i-today" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/><circle cx="12" cy="15.5" r="2.2" fill="var(--icon-fill, transparent)"/></symbol>
<symbol id="i-models" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="var(--icon-fill, transparent)"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></symbol>
<symbol id="i-projects" viewBox="0 0 24 24"><path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" fill="var(--icon-fill, transparent)"/></symbol>
<symbol id="i-sessions" viewBox="0 0 24 24"><path d="M4 5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.5L7 20.5v-4H6a2 2 0 0 1-2-2Z" fill="var(--icon-fill, transparent)"/><path d="M8 8.5h8M8 12h5"/></symbol>
<symbol id="i-costs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="var(--icon-fill, transparent)"/><path d="M14.6 9.3c-.4-1-1.4-1.7-2.6-1.7-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.2 0-2.2-.7-2.6-1.7M12 6v1.6M12 16.4V18"/></symbol>
<symbol id="i-settings" viewBox="0 0 24 24"><path d="M20.5 10.2 20.5 13.8 17.7 13.9 16.5 16 17.8 18.5 14.7 20.3 13.2 17.9 10.8 17.9 9.3 20.3 6.2 18.5 7.5 16 6.3 13.9 3.5 13.8 3.5 10.2 6.3 10.2 7.5 8 6.2 5.5 9.3 3.7 10.8 6.1 13.2 6.1 14.7 3.7 17.8 5.5 16.5 8 17.7 10.2Z" fill="var(--icon-fill, transparent)"/><circle cx="12" cy="12" r="2.7"/></symbol>
<symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20.5 11A8.5 8.5 0 1 0 19 16.5"/><path d="M21 6.5V11h-4.5"/></symbol>
<symbol id="i-database" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3" fill="var(--icon-fill, transparent)"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></symbol>
<symbol id="i-archive" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4.5" rx="1.2" fill="var(--icon-fill, transparent)"/><path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M9.5 12.5h5"/></symbol>
<symbol id="i-filter" viewBox="0 0 24 24"><path d="M3.5 5h17l-6.5 7.5v5.2L10 20v-7.5Z" fill="var(--icon-fill, transparent)"/></symbol>
<symbol id="i-filter-off" viewBox="0 0 24 24"><path d="M3.5 5h17l-6.5 7.5v5.2L10 20v-7.5Z" fill="var(--icon-fill, transparent)"/><path d="M4.5 20.5 19.5 3.5"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" fill="var(--icon-fill, transparent)"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" fill="var(--icon-fill, transparent)"/></symbol>
<symbol id="i-theme-auto" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="var(--icon-fill, currentColor)"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="var(--icon-fill, transparent)"/><path d="M12 11v5M12 7.6v.01"/></symbol>
<symbol id="i-warn" viewBox="0 0 24 24"><path d="M12 3.5 22 20H2Z" fill="var(--icon-fill, transparent)"/><path d="M12 10v4.5M12 17.4v.01"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="var(--icon-fill, transparent)"/><path d="m8 12.5 2.7 2.7L16.5 9"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="var(--icon-fill, transparent)"/><path d="m15.2 15.2 4.8 4.8"/></symbol>
<symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 16.5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></symbol>
<symbol id="i-trend-up" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></symbol>
<symbol id="i-trend-down" viewBox="0 0 24 24"><path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/></symbol>
<symbol id="i-chevron-left" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></symbol>
<symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
<symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/><rect x="7" y="13" width="4" height="4" rx="1" fill="var(--icon-fill, transparent)"/></symbol>
<symbol id="i-gauge" viewBox="0 0 24 24"><path d="M4 19a9 9 0 1 1 16 0"/><path d="M12 13l4.5-4.5"/><circle cx="12" cy="14" r="1.6" fill="var(--icon-fill, currentColor)"/></symbol>
<symbol id="i-wallet" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 9.5h18"/><rect x="14" y="12.5" width="7" height="4.5" rx="1.2" fill="var(--icon-fill, transparent)"/></symbol>
</defs>
</svg>`;

export function injectIcons() {
  if (document.getElementById(SPRITE_ID)) return;
  const div = document.createElement('div');
  div.innerHTML = ICON_SPRITE;
  document.body.prepend(div.firstElementChild);
}

export function icon(id, cls = 'icon') {
  if (typeof document !== 'undefined' && document.body && !document.getElementById(SPRITE_ID)) injectIcons();
  return `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
}
