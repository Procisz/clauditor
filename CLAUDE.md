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
- Browser: `dist/Clauditor.html` — open directly in Chrome/Edge; data sources are browsed on the start page (statuses + explicit **Open Dashboard** button — loading never auto-presents)
- Desktop: `electron/main.js` loads `dist/Clauditor.html` in a BrowserWindow. `electron/preload.js` exposes `window.clauditorFS` (read-only IPC, restricted to the two data roots); `core/native.js` detects it and auto-loads both sources with no pickers or welcome screen

**Two tabs:** Overview (cost charts, model/project breakdown, heatmap) and Today (per-day cards, session list with expandable subagent breakdown, hourly chart). `switchTab` handles visibility; `renderAll` re-renders both.

## Source structure

```
src/
├── main.js                      # Entry point: imports all modules, wires onclick → window, runs init
├── styles.css                   # All CSS (extracted from index.html)
├── core/                        # Infrastructure — no DOM rendering
│   ├── config.js                # PRICING table (version-anchored regexes), entryCost(), cacheWrite5m/1h(), getUnknownModels()
│   ├── dates.js                 # dayKey()/todayKey()/getWeekKey() — ALL date bucketing goes through here
│   ├── state.js                 # Single shared mutable object (allEntries, markup, view, …)
│   ├── db.js                    # IndexedDB helpers — persist directory handle across sessions
│   ├── folder.js                # Source browsing + statuses on the start page, reauth, refresh
│   ├── native.js                # Electron auto-loader via the preload bridge (window.clauditorFS)
│   ├── fs.js                    # collectJsonlFiles() — recursive JSONL walker, reads .meta.json sidecars
│   ├── loader.js                # loadAndRender(), loadFromFileInput() — reads files, deduplicates, triggers render
│   ├── parser.js                # parseEntries(), entryKey()/durationKey(), sessionType()/sessionOrigin(), parseSessionTitles(), getFilteredEntries(), bucketEntries()
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
│   │   ├── model-sessions.js    # Expandable per-model sessions panel + session detail modal
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

**Code style — no comments:** the source is deliberately comment-free (repo owner's preference). Do not add code comments; document invariants and conventions in THIS file instead.

**Shared helpers — always use, never inline:** `entryCost(e)` in config.js (cost of one parsed entry — the ONLY cost function; there is no `calcCost`, and no site may re-derive a cost from raw usage fields), `cacheWrite5m(e)`/`cacheWrite1h(e)` in config.js (the cache-write TTL split), `usageTokens(usage)` in parser.js (raw log usage → entry token fields; both parsers share it), `parseJsonlLines(text)` in parser.js (JSONL → records), `fmtMoney/fmtFixed/fmtInt/fmtNum` in utils.js (all display numbers), `buildPaginator` in utils.js (all pagination UI), `showToast(message, kind, ms)` / `copyToClipboard(text, label)` in utils.js (transient confirmations — the toast host is created lazily on first use, a repeat of the same message replaces the visible one rather than stacking, and removal is driven by `transitionend` with a timeout fallback because background tabs throttle timers). Clipboard writes go through `navigator.clipboard` and fall back to a hidden-textarea `execCommand('copy')`, since `Clauditor.html` is often opened over `file://`; both paths can fail when the document is not focused, which is why the failure is reported in the toast rather than swallowed. Directory handles persist via `saveHandle/loadHandle(key)` in db.js (archive uses its own key).

**Click-to-copy paths:** any element carrying `.path-copy` inside `#welcome` copies its own `textContent` on click; `initPathCopy('welcome')` in main.js wires ONE delegated listener, so new path rows need no per-element handler and no `window` exposure. Use a real `<button>` so it stays keyboard-reachable. The delegation root is `#welcome` — a `.path-copy` placed outside it needs its own `initPathCopy` call.

**Key gotcha:** Because the bundle is `type="module"`, top-level functions are not globally scoped. Any new function called from an HTML `onclick` attribute must be added to the `Object.assign(window, {...})` block at the bottom of `main.js`.

**Render callback:** `loader.js` does not import from `features/`. Instead, `main.js` calls `setRenderCallback(renderAll)` at startup to wire the post-load render without creating a circular dependency.

**State:** All rendering is driven by `src/core/state.js`: `allEntries` (full parsed dataset), `allDurations` (turn duration records), `markup` (cost multiplier), `view` (`daily`/`weekly`/`monthly`), `selectedDate` (Today tab), `modelPanels` (Model Breakdown expansion: open/sort/page per model, so panels survive re-renders), `sessionTitles` (sessionId → display title from `custom-title` records; render session names via `sessionName()` in utils.js, never `slug || sid.slice(…)` inline). **Persistence is split:** IndexedDB stores the directory handle; localStorage stores `clauditor_date_from` and `clauditor_markup`.

**Timezones:** Log timestamps are UTC instants; every "which day" question is answered in the viewer's **local timezone** via `src/core/dates.js` (`dayKey`, `todayKey`, `getWeekKey`, `shiftDay`). Never derive a day by slicing a timestamp string — that yields the UTC day and misplaces evening entries for UTC+ users. Archived entries' `date` field is recomputed from `ts` on read, so archives are portable across timezones.

**Cache-write TTL:** Anthropic bills a 5-minute cache write at 1.25× input and a 1-hour write at 2×. A parsed entry stores `cacheWrite` (the **total**, from `usage.cache_creation_input_tokens`) plus `cacheWrite1h` (the **1-hour subset**, from `usage.cache_creation.ephemeral_1h_input_tokens`, clamped to the total in `usageTokens()`). The 5-minute portion is always derived, never stored — that is what makes an entry written before this split existed (`cacheWrite1h` undefined → 0) price exactly as it did before. Never add the two fields together: `cacheWrite` already includes `cacheWrite1h`. Read them only through `cacheWrite5m(e)` / `cacheWrite1h(e)` in config.js, which apply the clamp; a raw `e.cacheWrite1h` loses it. Three invariants keep archived history correct: entries parsed from live logs are pushed **after** archive entries in loader.js, dedupe keeps the last entry on an output tie (`>=`, not `>`), so a freshly-parsed entry carrying the split beats the archived one; and archive.js's `BACKFILL` list rewrites archived entries that predate a field — add a `{field, has}` entry there when a new entry field must reach already-archived records.

**Non-Anthropic models:** a model id that does not look like a Claude model (`isAnthropicModel()` in config.js) resolves to `PRICING_LOCAL` and costs zero — a locally-run `gpt-oss:20b` is not an Anthropic charge. Those are excluded from the unpriced-model banner, because $0 is exact, not an estimate. An id that *does* contain `claude` but matches no row still falls to `PRICING_DEFAULT` and warns.

**Deduplication:** Streaming writes multiple partial entries per message ID; the loader keeps the max-output one. The archive stays append-only by writing only unseen keys. All identity checks go through `entryKey()`/`durationKey()` in `parser.js` — never inline the key expression, or the loader and archive can drift apart (past bugs lived here).

**Number formatting:** every user-visible number goes through `fmtMoney()`/`fmtFixed()`/`fmtInt()`/`fmtNum()` in utils.js, which honor the user-configurable separators (`state.thousandsSep`/`decimalSep`, persisted). Never concatenate `'$' + x.toFixed(n)` in display code; chart *series data* and the CSV export deliberately stay raw.

**Projects:** group by `projectKey()` in utils.js (Code: cwd; Cowork: `'cowork:'+taskId` — one project per task) and display via `projectName()` (folder basename / task title). Never group or label projects by raw cwd — Cowork cwds point into the app's store.

**Session taxonomy:** Type (Chat/Cowork/Code) comes from `sessionKind` on each entry — `parseEntries` tags `'code'`, `parseCoworkEntries` tags `'cowork'`; never infer type from cwd paths (a past bug). Source (Desktop app/CLI) comes from the `entrypoint` record field. Cowork tasks never write `~/.claude/projects`; each task in the Desktop app's `~/Library/Application Support/Claude/local-agent-mode-sessions` store keeps usage in TWO places that must both be read (dedupe by message id makes it safe): the signed `local_<taskId>/audit.jsonl` mirror AND a full private Claude Code tree at `local_<taskId>/.claude/projects/**` (subagent sidechains and turn durations exist only there); `local_<taskId>.json` holds the title. In the browser this is browsed on the start page via a classic `<input webkitdirectory>` picker, NOT `showDirectoryPicker`, because Chrome's File System Access blocklist refuses persistent handles under `~/Library`; persistence comes from the archive instead (cowork entries/titles are archived once loaded). In Electron both sources load natively and automatically.

**Data sources / presentation split:** loaders fill `state.srcCode` / `state.srcCowork` independently; `presentDashboard()` in loader.js assembles them into `allEntries` etc., dedupes, renders, and writes the archive. Never push directly into `state.allEntries` — assembly rebuilds it. One Cowork task = one session row (audit session ids are per-command, so entries are grouped under the task id). Chat conversations have no local data at all.

**Pricing:** The table in `config.js` is an ordered list of version-anchored regexes, matched first-hit-wins. Build rows with the `model()` helper (exact rates; its pattern tolerates an optional trailing `-YYYYMMDD` snapshot and refuses to match a longer version number, so `opus-4-1` cannot swallow `opus-4-10`) or `family()` (bare family word, no version anchor). **Every `model()` row must precede every `family()` row**, and family rows carry `approx: true` so `getUnknownModels()` reports them alongside true `PRICING_DEFAULT` misses — that is what makes the warning banner fire for a Claude model released after this table was written, the failure recorded in CHANGELOG 1.12.1. Cache rates are derived from the input price (write 1.25×, read 0.1×) with one documented exception: the 5.1 generation reads at 0.025×. When a new Claude model ships: add a `model()` row, then run `npm run check:pricing` — it asserts every id's four rates, the multipliers, the anchoring, and the row ordering.

**Dismissable banners (convention):** Every dismissable warning/error banner suppresses for **one month per item**, never forever — after the month it warns again. The shared store lives in `utils.js` (`readDismissals()` / `dismissForAMonth()`, localStorage `clauditor_dismissals` mapping key → expiry timestamp; expired entries are pruned on read). Each banner type namespaces its keys (pricing uses `pricing:<model>`; the static cost-estimate note uses `note:cost-estimates`). Static always-rendered notes wire up with `initDismissableNote(elId, key)` — give the element a `.note-close` button. When adding a new warning or error banner, reuse this store with a new namespace prefix — do not invent a separate persistence mechanism or a permanent dismissal. **One deliberate exception:** the Cowork-missing warning (`#cowork-warning`, `updateCoworkWarning()`) has NO suppression at all — per explicit product decision it re-appears on every dashboard presentation while no Cowork data is loaded; ✕ hides it only until the next present.
