export const DEFAULT_LIGHT = 'winter';
export const DEFAULT_DARK = 'dracula';

const theme = (id) => Object.freeze({ id, nameKey: `themes.${id}.name`, descKey: `themes.${id}.desc` });

export const LIGHT_THEMES = Object.freeze(['winter', 'sand', 'mint', 'lavender', 'sea'].map(theme));
export const DARK_THEMES = Object.freeze(['dracula', 'midnight', 'forest', 'graphite', 'plum'].map(theme));
