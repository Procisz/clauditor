export const FIXED_NOW = new Date(2026, 9, 15, 10, 30, 0);

const media = new Map();

export function setMedia(query, matches) {
  media.set(query, Boolean(matches));
  for (const q of queries) if (q.media === query) q.fire();
}

export function resetMedia() {
  media.clear();
  queries.length = 0;
}

const queries = [];

function makeQuery(query) {
  const listeners = new Set();
  const q = {
    media: query,
    onchange: null,
    get matches() {
      return media.get(query) ?? false;
    },
    addEventListener(type, fn) {
      if (type === 'change') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'change') listeners.delete(fn);
    },
    addListener(fn) {
      listeners.add(fn);
    },
    removeListener(fn) {
      listeners.delete(fn);
    },
    dispatchEvent() {
      return true;
    },
    fire() {
      const ev = { media: query, matches: q.matches, type: 'change' };
      for (const fn of listeners) fn(ev);
      q.onchange?.(ev);
    },
  };
  queries.push(q);
  return q;
}

class FakeResizeObserver {
  static instances = [];
  constructor(cb) {
    this.cb = cb;
    this.targets = new Set();
    FakeResizeObserver.instances.push(this);
  }
  observe(el) {
    this.targets.add(el);
  }
  unobserve(el) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  trigger() {
    this.cb(
      [...this.targets].map((target) => ({ target, contentRect: target.getBoundingClientRect() })),
      this,
    );
  }
}

class FakeIntersectionObserver {
  static instances = [];
  constructor(cb, options = {}) {
    this.cb = cb;
    this.options = options;
    this.targets = new Set();
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el) {
    this.targets.add(el);
  }
  unobserve(el) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
  trigger(isIntersecting = true) {
    this.cb(
      [...this.targets].map((target) => ({ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 })),
      this,
    );
  }
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const RGB = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i;

export function parseColor(value) {
  const s = String(value ?? '').trim();
  let m = s.match(HEX6);
  if (m) return [m[1], m[2], m[3]].map((h) => Number.parseInt(h, 16));
  m = s.match(HEX3);
  if (m) return [m[1], m[2], m[3]].map((h) => Number.parseInt(h + h, 16));
  m = s.match(RGB);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [0, 0, 0];
}

class FakeContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.font = '10px sans-serif';
    this.calls = [];
  }
  fillRect(...args) {
    this.calls.push(['fillRect', ...args]);
    this.pixel = parseColor(this.fillStyle);
  }
  clearRect(...args) {
    this.calls.push(['clearRect', ...args]);
  }
  getImageData() {
    const [r, g, b] = this.pixel ?? [0, 0, 0];
    return { data: new Uint8ClampedArray([r, g, b, 255]) };
  }
  measureText(text) {
    return { width: String(text ?? '').length * 7 };
  }
  drawImage() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  fill() {}
  stroke() {}
  save() {}
  restore() {}
  scale() {}
  translate() {}
}

export function installPolyfills() {
  const g = globalThis;
  if (typeof g.matchMedia !== 'function' || g.matchMedia.clauditorFake !== true) {
    const fake = (query) => makeQuery(query);
    fake.clauditorFake = true;
    g.matchMedia = fake;
    g.window.matchMedia = fake;
  }
  g.ResizeObserver = FakeResizeObserver;
  g.IntersectionObserver = FakeIntersectionObserver;
  g.requestIdleCallback ??= (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
  g.cancelIdleCallback ??= (id) => clearTimeout(id);
  g.requestAnimationFrame ??= (cb) => setTimeout(() => cb(performance.now()), 16);
  g.cancelAnimationFrame ??= (id) => clearTimeout(id);
  g.Element.prototype.scrollIntoView ??= function () {};
  g.Element.prototype.scrollTo ??= function () {};
  g.Element.prototype.scrollBy ??= function () {};
  g.window.scrollTo = () => {};
  g.window.scrollBy = () => {};
  g.SVGElement.prototype.getBBox ??= function () {
    return { x: 0, y: 0, width: 0, height: 0 };
  };
  g.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== '2d') return null;
    this.clauditorCtx ??= new FakeContext2D(this);
    return this.clauditorCtx;
  };
  g.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  if (typeof g.Blob.prototype.stream !== 'function') {
    g.Blob.prototype.stream = function () {
      const blob = this;
      return new ReadableStream({
        async pull(controller) {
          controller.enqueue(new Uint8Array(await blob.arrayBuffer()));
          controller.close();
        },
      });
    };
  }
  g.URL.createObjectURL ??= () => `blob:http://localhost:5173/${Math.random().toString(36).slice(2)}`;
  g.URL.revokeObjectURL ??= () => {};
  if (typeof g.HTMLDialogElement === 'function') {
    const proto = g.HTMLDialogElement.prototype;
    proto.showModal ??= function () {
      this.setAttribute('open', '');
    };
    proto.show ??= function () {
      this.setAttribute('open', '');
    };
    proto.close ??= function (value) {
      this.removeAttribute('open');
      if (value !== undefined) this.returnValue = value;
      this.dispatchEvent(new Event('close'));
    };
  }
}

export { FakeResizeObserver, FakeIntersectionObserver, FakeContext2D };
