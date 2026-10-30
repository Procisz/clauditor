export const EVENTS = Object.freeze({
  theme: 'clauditor:themechange',
  lang: 'clauditor:langchange',
  rerender: 'clauditor:rerender',
});

export function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
