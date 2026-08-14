# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Vite dev server (hot reload)
npm run build            # Build → dist/Clauditor.html (production single file)
npm run check:pricing    # Sanity-check the pricing table (run after editing config.js)
npm run electron:dev     # Build + launch Electron desktop app
npm run electron:build   # Build + package Electron installer (dist-electron/)
```

There are no tests.

## Architecture

Clauditor is a **zero-dependency single-file HTML dashboard** that reads Claude Code JSONL logs from the local filesystem via the File System Access API.

**Build pipeline:** `src/main.js` (ES module) + `index.html` → Vite bundles with `vite-plugin-singlefile` → inlines everything into `dist/Clauditor.html` → `scripts/postbuild.mjs` minifies the HTML. The final artifact is one self-contained `.html` file.

**Two distribution targets:**
- Browser: `dist/Clauditor.html` — open directly in Chrome/Edge
- Desktop: `electron/main.js` loads `dist/Clauditor.html` in a BrowserWindow

**Two tabs:** Overview (cost charts, model/project breakdown, heatmap) and Today (per-day cards, session list with expandable subagent breakdown, hourly chart). `switchTab` handles visibility; `renderAll` re-renders both.

## Source structure

```
src/
├── main.js                      # Entry point: imports all modules, wires onclick → window, runs init
├── styles.css                   # All CSS (extracted from index.html)
├── core/                        # Infrastructure — no DOM rendering
│   ├── config.js                # PRICING table (longest-pattern-first), calcCost(), getUnknownModels()
│   ├── dates.js                 # dayKey()/todayKey()/getWeekKey() — ALL date bucketing goes through here
│   ├── state.js                 # Single shared mutable object (allEntries, markup, view, …)
│   ├── db.js                    # IndexedDB helpers — persist directory handle across sessions
│   ├── fs.js                    # collectJsonlFiles() — recursive JSONL walker, reads .meta.json sidecars
│   ├── loader.js                # loadAndRender(), loadFromFileInput() — reads files, deduplicates, triggers render
│   ├── parser.js                # parseEntries(), entryKey()/durationKey(), getFilteredEntries(), bucketEntries()
│   ├── charts.js                # Shared Chart.js config helpers (chartOptions, pieOptions, chartTheme)
│   ├── theme.js                 # initTheme(), toggleTheme()
│   └── utils.js                 # fmtNum, fmtDuration, shortPath, DOM helpers, badgeClass
├── features/
│   ├── overview/                # Overview tab
│   │   ├── index.js             # renderAll(), setView(), exportCsv()
│   │   ├── cards.js             # Summary cards + burn rate bar
│   │   ├── charts.js            # Cost / token / cache charts
│   │   ├── heatmap.js           # Activity heatmap
│   │   ├── tables.js            # Model breakdown + top projects tables
│   │   └── detail.js            # Click-through day/week/month session detail panel
│   └── today/                   # Today tab
│       ├── index.js             # renderTodayView(), switchTab(), day navigation
│       ├── cards.js             # Today summary cards
│       ├── charts.js            # Hourly cost, response time, cache, pie charts
│       ├── sessions.js          # Sessions table with expandable subagent breakdown
│       └── tables.js            # Today projects table
└── html/
    └── partials/                # EJS partials included into index.html via vite-plugin-html
        ├── header.html
        ├── overview.html
        ├── today.html
        └── welcome.html
```

**Key gotcha:** Because the bundle is `type="module"`, top-level functions are not globally scoped. Any new function called from an HTML `onclick` attribute must be added to the `Object.assign(window, {...})` block at the bottom of `main.js`.

**Render callback:** `loader.js` does not import from `features/`. Instead, `main.js` calls `setRenderCallback(renderAll)` at startup to wire the post-load render without creating a circular dependency.

**State:** All rendering is driven by `src/core/state.js`: `allEntries` (full parsed dataset), `allDurations` (turn duration records), `markup` (cost multiplier), `view` (`daily`/`weekly`/`monthly`), `selectedDate` (Today tab). **Persistence is split:** IndexedDB stores the directory handle; localStorage stores `clauditor_date_from` and `clauditor_markup`.

**Timezones:** Log timestamps are UTC instants; every "which day" question is answered in the viewer's **local timezone** via `src/core/dates.js` (`dayKey`, `todayKey`, `getWeekKey`, `shiftDay`). Never derive a day by slicing a timestamp string — that yields the UTC day and misplaces evening entries for UTC+ users. Archived entries' `date` field is recomputed from `ts` on read, so archives are portable across timezones.

**Deduplication:** Streaming writes multiple partial entries per message ID; the loader keeps the max-output one. The archive stays append-only by writing only unseen keys. All identity checks go through `entryKey()`/`durationKey()` in `parser.js` — never inline the key expression, or the loader and archive can drift apart (past bugs lived here).

**Pricing:** The table in `config.js` matches longest-pattern-first (sorted at load, so insertion order can't shadow a specific entry). Unknown models fall back to `PRICING_DEFAULT` **and** surface a warning banner via `getUnknownModels()` in `finishLoading`. When a new Claude model ships: add its entry, then run `npm run check:pricing`.

**Dismissable banners (convention):** Every dismissable warning/error banner suppresses for **one month per item**, never forever — after the month it warns again. The shared store lives in `utils.js` (`readDismissals()` / `dismissForAMonth()`, localStorage `clauditor_dismissals` mapping key → expiry timestamp; expired entries are pruned on read). Each banner type namespaces its keys (pricing uses `pricing:<model>`; the static cost-estimate note uses `note:cost-estimates`). Static always-rendered notes wire up with `initDismissableNote(elId, key)` — give the element a `.note-close` button. When adding a new warning or error banner, reuse this store with a new namespace prefix — do not invent a separate persistence mechanism or a permanent dismissal.
