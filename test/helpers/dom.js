export function mountPanel(id = 'panel') {
  const el = document.createElement('section');
  el.dataset.page = id;
  el.id = `panel-${id}`;
  document.body.appendChild(el);
  return el;
}

export const flush = () => new Promise((r) => setTimeout(r, 0));

export async function flushAll(rounds = 3) {
  for (let i = 0; i < rounds; i++) await flush();
}

export function fire(el, type, init = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
}

export function click(el, init = {}) {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
}

export function key(el, keyName, init = {}) {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: keyName, ...init });
  el.dispatchEvent(ev);
  return ev;
}

export function input(el, value) {
  el.value = value;
  fire(el, 'input');
  fire(el, 'change');
}

export function textOf(el) {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
