import { state } from '../core/state.js';
import { t } from '../i18n/index.js';
import { icon } from '../ui/icons.js';
import { rebinder } from '../ui/listen.js';

const DEFAULT_PAGE = 'overview';

const pages = new Map();
const listeners = [];
const bindEvents = rebinder();

export function registerPage(page) {
  pages.set(page.id, page);
}

export function pageList() {
  return [...pages.values()];
}

export function onActivate(fn) {
  listeners.push(fn);
}

export function currentPage() {
  return pages.get(state.activePage) ?? null;
}

export function panelOf(id) {
  return document.getElementById(`panel-${id}`);
}

export function pageFromLocation() {
  const token = location.hash.replace(/^#/, '');
  if (pages.has(token)) return token;
  return pages.has(DEFAULT_PAGE) ? DEFAULT_PAGE : (pages.keys().next().value ?? null);
}

function tabOf(id) {
  return document.querySelector(`#page-nav [data-page="${id}"]`);
}

export function buildNav() {
  const nav = document.getElementById('page-nav');
  const main = document.getElementById('app-main');
  nav.replaceChildren();
  main.replaceChildren();
  for (const page of pages.values()) {
    const tab = document.createElement('a');
    tab.setAttribute('role', 'tab');
    tab.id = `tab-${page.id}`;
    tab.href = `#${page.id}`;
    tab.dataset.page = page.id;
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-controls', `panel-${page.id}`);
    tab.tabIndex = -1;
    tab.innerHTML = `${icon(page.icon)}<span class="tab-label"></span>`;
    tab.querySelector('.tab-label').textContent = t(page.titleKey);
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      activate(page.id, { push: true });
    });
    nav.append(tab);

    const section = document.createElement('section');
    section.className = 'panel';
    section.id = `panel-${page.id}`;
    section.dataset.page = page.id;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', tab.id);
    section.hidden = true;
    main.append(section);
  }
  nav.onkeydown = onTabKey;
}

function onTabKey(e) {
  const ids = [...pages.keys()];
  const at = ids.indexOf(state.activePage);
  let next = -1;
  if (e.key === 'ArrowRight') next = (at + 1) % ids.length;
  else if (e.key === 'ArrowLeft') next = (at - 1 + ids.length) % ids.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = ids.length - 1;
  if (next < 0) return;
  e.preventDefault();
  activate(ids[next], { push: true });
  tabOf(ids[next])?.focus();
}

export function relabelNav() {
  for (const page of pages.values()) {
    const tab = tabOf(page.id);
    if (tab) tab.querySelector('.tab-label').textContent = t(page.titleKey);
  }
}

export function activate(id, { push = false } = {}) {
  if (!pages.has(id)) id = pageFromLocation();
  if (id === null) return;
  state.activePage = id;
  const target = `#${id}`;
  if (location.hash !== target) {
    if (push) location.hash = target;
    else history.replaceState(null, '', target);
  }
  for (const tab of document.querySelectorAll('#page-nav [role="tab"]')) {
    const selected = tab.dataset.page === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('#app-main > [data-page]')) {
    panel.hidden = panel.dataset.page !== id;
  }
  tabOf(id)?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  for (const fn of listeners) fn(id);
}

function onHashChange() {
  const id = pageFromLocation();
  if (id !== state.activePage) activate(id);
}

export function initRouter() {
  bindEvents([[window, 'hashchange', onHashChange]]);
}
