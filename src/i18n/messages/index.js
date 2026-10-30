import common from './common.js';
import shell from './shell.js';
import start from './start.js';
import settings from './settings.js';
import themes from './themes.js';
import pricing from './pricing.js';
import components from './components.js';
import overview from './overview.js';
import today from './today.js';
import models from './models.js';
import projects from './projects.js';
import sessions from './sessions.js';
import costs from './costs.js';

const areas = [common, shell, start, settings, themes, pricing, components, overview, today, models, projects, sessions, costs];

function merge(lang) {
  const dict = Object.create(null);
  for (const area of areas) Object.assign(dict, area[lang]);
  return dict;
}

export default Object.freeze({ en: merge('en'), hu: merge('hu') });
