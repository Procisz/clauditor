export const charts = [];

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function mergeOptions(a, b) {
  const out = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = isObj(v) && isObj(out[k]) ? mergeOptions(out[k], v) : v;
  }
  return out;
}

export default class ApexCharts {
  static instances = charts;
  static exec() {
    return undefined;
  }
  static reset() {
    charts.length = 0;
  }
  constructor(el, options = {}) {
    this.el = el ?? null;
    this.opts = options;
    this.w = { config: options, globals: { dom: { baseEl: el ?? null }, collapsedSeriesIndices: [] } };
    this.rendered = false;
    this.destroyed = false;
    this.hidden = new Set();
    this.updates = [];
    this.seriesUpdates = [];
    this.listeners = {};
    charts.push(this);
  }
  addEventListener(name, handler) {
    (this.listeners[name] ??= []).push(handler);
  }
  fire(name) {
    for (const handler of this.listeners[name] ?? []) handler(this, this.w);
  }
  render() {
    this.rendered = true;
    if (this.el) {
      this.el.innerHTML =
        '<div class="apexcharts-canvas"><svg class="apexcharts-svg" xmlns="http://www.w3.org/2000/svg"><g class="apexcharts-inner"><g class="apexcharts-yaxis-texts-g"></g></g></svg></div>';
    }
    return Promise.resolve();
  }
  updateOptions(options = {}, redraw = false, animate = true) {
    this.updates.push({ options, redraw, animate });
    this.opts = mergeOptions(this.opts, options);
    this.w.config = this.opts;
    return Promise.resolve();
  }
  updateSeries(series, animate = true) {
    this.seriesUpdates.push({ series, animate });
    this.opts = { ...this.opts, series };
    this.w.config = this.opts;
    return Promise.resolve();
  }
  toggleSeries(name) {
    if (this.hidden.has(name)) this.hidden.delete(name);
    else this.hidden.add(name);
    return !this.hidden.has(name);
  }
  hideSeries(name) {
    this.hidden.add(name);
  }
  showSeries(name) {
    this.hidden.delete(name);
  }
  destroy() {
    this.destroyed = true;
    if (this.el) this.el.innerHTML = '';
  }
  dataURI() {
    return Promise.resolve({ imgURI: 'data:image/png;base64,', svgURI: 'data:image/svg+xml,' });
  }
}
