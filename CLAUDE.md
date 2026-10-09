# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Vite dev server (hot reload)
npm run build            # Build → dist/Clauditor.html (production single file)
npm run check:pricing    # Validate pricing.json and the pricing engine (the workflow runs it too)
npm run update:pricing   # Fetch Anthropic's pricing page and merge changes into pricing.json
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
│   ├── config.js                # Pricing engine over pricing.json: priceAt()/tierAt(), entryCost(), cacheWrite5m/1h(), getUnknownModels()
│   ├── pricing.json             # Dated per-model price history, kept current by .github/workflows/update-pricing.yml
│   ├── dates.js                 # dayKey()/todayKey()/getWeekKey() — ALL date bucketing goes through here
│   ├── state.js                 # Single shared mutable object (allEntries, markup, view, …)
│   ├── db.js                    # IndexedDB helpers — persist directory handle across sessions
│   ├── folder.js                # Source browsing + statuses on the start page, reauth, refresh
│   ├── native.js                # Electron auto-loader via the preload bridge (window.clauditorFS)
│   ├── fs.js                    # collectJsonlFiles(): recursive JSONL walker with relative paths, reads .meta.json sidecars
│   ├── logcache.js              # readLogFiles(): incremental per-file parse cache in IndexedDB (append-aware)
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
│   │   ├── tokens.js            # All-time token usage section (per-type tokens + cost)
│   ├── pricing-help.js          # "How to add" guide opened from the unpriced-model banner
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

**Shared helpers (always use, never inline):** `entryCost(e)` in config.js (cost of one parsed entry, the ONLY cost function; there is no `calcCost`, and no site may re-derive a cost from raw usage fields), `cacheWrite5m(e)`/`cacheWrite1h(e)` in config.js (the cache-write TTL split), `entryCostByType(e)` in config.js (per-type dollar breakdown of one entry; `entryCost` is its sum, so the two cannot disagree), `tokenBar(parts)`/`BAR_COLORS` in utils.js (the proportion bar + legend and the one colour per token type, shared by the session modal and the Token Usage section), `usageTokens(usage)` in parser.js (raw log usage → entry token fields; both parsers share it), `parseLogLines(text)` in parser.js (JSONL to records, skipping every line without a usage, turn_duration or custom-title marker before `JSON.parse`), `fmtMoney/fmtFixed/fmtInt/fmtNum` in utils.js (all display numbers), `buildPaginator` in utils.js (all pagination UI), `showToast(message, kind, ms)` / `copyToClipboard(text, label)` in utils.js (transient confirmations: the toast host is created lazily on first use, a repeat of the same message replaces the visible one rather than stacking, and removal is driven by `transitionend` with a timeout fallback because background tabs throttle timers). Clipboard writes go through `navigator.clipboard` and fall back to a hidden-textarea `execCommand('copy')`, since `Clauditor.html` is often opened over `file://`; both paths can fail when the document is not focused, which is why the failure is reported in the toast rather than swallowed. Directory handles persist via `saveHandle/loadHandle(key)` in db.js (archive uses its own key).

**Default sort is final cost, most expensive first, everywhere:** every table (Model Breakdown, Top Projects, the session panels, the cost-chart drill-down, Today sessions/projects, the modal's Models/Agents tables, the Token Usage type table) opens ordered by final cost descending and falls back to that order in its neutral sort state. The session panels express this through `effectiveSort(p)` in model-sessions.js, which both the comparator and the header markers read, so the neutral state can never sort one way and highlight another. Base cost and final cost order identically (markup is one constant), so comparators may use `base`.

**Modals never exceed 80vh:** a single unlayered rule in styles.css (`.modal-box { max-height: 80vh; overflow-y: auto; }`) caps every DaisyUI dialog (the settings modal, the session modal, and any added later), with the content scrolling inside the box. Build new popups on `<dialog class="modal"><div class="modal-box">` so they inherit it; never set a per-modal height or `max-height` that would override it, and never move the rule into a `@layer`, where DaisyUI's own `max-height: calc(100vh - 5em)` would win again.

**Click-to-copy paths:** any element carrying `.path-copy` inside `#welcome` copies its own `textContent` on click; `initPathCopy('welcome')` in main.js wires ONE delegated listener, so new path rows need no per-element handler and no `window` exposure. Use a real `<button>` so it stays keyboard-reachable. The delegation root is `#welcome` — a `.path-copy` placed outside it needs its own `initPathCopy` call.

**Loading is incremental (logcache.js):** logs are gigabytes of transcript text, so every loader (`loadCodeData`, `loadCodeDataFromFiles`, `loadCoworkData`) goes through `readLogFiles(source, items, parse)`, which caches each file's parsed output in the IndexedDB `logs` store (db.js, version 2), keyed `source|path`. A file is reused when its size and modification time match; when it only grew and the 64 bytes before the last parsed offset are unchanged, only the new tail is read (JSONL is append-only); otherwise it is re-read in full. Cache records also carry `LOG_CACHE_VERSION`, the parse arguments (`args`: agent type, task id) and the timezone (entry dates are local): **bump `LOG_CACHE_VERSION` whenever parseEntries/parseDurations/parseSessionTitles/parseCoworkEntries change their output**, or users keep stale cached entries. Parse functions passed to it must be pure per record (outputs of file segments are concatenated; titles merge last-wins). Pass `getFile` (not a `File`) for FS Access handles: a `File` is a snapshot and throws `NotReadableError` once the live session file changes, so files are opened right before reading, retried with a fresh snapshot, and on failure fall back to their cached data; one unreadable file never fails the load. Reads run 8 at a time under a 256 MB in-flight byte budget. The Electron path (native.js) uses the line pre-filter but not the cache yet. `npm run check:loader` covers all of this.

**Key gotcha:** Because the bundle is `type="module"`, top-level functions are not globally scoped. Any new function called from an HTML `onclick` attribute must be added to the `Object.assign(window, {...})` block at the bottom of `main.js`.

**Render callback:** `loader.js` does not import from `features/`. Instead, `main.js` calls `setRenderCallback(renderAll)` at startup to wire the post-load render without creating a circular dependency.

**State:** All rendering is driven by `src/core/state.js`: `allEntries` (full parsed dataset), `allDurations` (turn duration records), `markup` (cost multiplier), `view` (`daily`/`weekly`/`monthly`), `selectedDate` (Today tab), `modelPanels` (Model Breakdown expansion: open/sort/page per model, so panels survive re-renders), `sessionTitles` (sessionId → display title from `custom-title` records; render session names via `sessionName()` in utils.js, never `slug || sid.slice(…)` inline). **Persistence is split:** IndexedDB stores the directory handle; localStorage stores `clauditor_date_from` and `clauditor_markup`.

**Timezones:** Log timestamps are UTC instants; every "which day" question is answered in the viewer's **local timezone** via `src/core/dates.js` (`dayKey`, `todayKey`, `getWeekKey`, `shiftDay`). Never derive a day by slicing a timestamp string — that yields the UTC day and misplaces evening entries for UTC+ users. Archived entries' `date` field is recomputed from `ts` on read, so archives are portable across timezones.

**Cache-write TTL:** Anthropic bills a 5-minute cache write at 1.25× input and a 1-hour write at 2×. A parsed entry stores `cacheWrite` (the **total**, from `usage.cache_creation_input_tokens`) plus `cacheWrite1h` (the **1-hour subset**, from `usage.cache_creation.ephemeral_1h_input_tokens`, clamped to the total in `usageTokens()`). The 5-minute portion is always derived, never stored — that is what makes an entry written before this split existed (`cacheWrite1h` undefined → 0) price exactly as it did before. Never add the two fields together: `cacheWrite` already includes `cacheWrite1h`. Read them only through `cacheWrite5m(e)` / `cacheWrite1h(e)` in config.js, which apply the clamp; a raw `e.cacheWrite1h` loses it. Three invariants keep archived history correct: entries parsed from live logs are pushed **after** archive entries in loader.js, dedupe keeps the last entry on an output tie (`>=`, not `>`), so a freshly-parsed entry carrying the split beats the archived one; and archive.js's `BACKFILL` list rewrites archived entries that predate a field — add a `{field, has}` entry there when a new entry field must reach already-archived records.

**Non-Anthropic models:** a model id that does not look like a Claude model (`isAnthropicModel()` in config.js) resolves to `PRICING_LOCAL` and costs zero — a locally-run `gpt-oss:20b` is not an Anthropic charge. Those are excluded from the unpriced-model banner, because $0 is exact, not an estimate. An id that *does* contain `claude` but matches no row still falls to `PRICING_DEFAULT` and warns.

**Deduplication:** Streaming writes multiple partial entries per message ID; the loader keeps the max-output one. The archive stays append-only by writing only unseen keys. All identity checks go through `entryKey()`/`durationKey()` in `parser.js` — never inline the key expression, or the loader and archive can drift apart (past bugs lived here).

**Number formatting:** every user-visible number goes through `fmtMoney()`/`fmtFixed()`/`fmtInt()`/`fmtNum()` in utils.js, which honor the user-configurable separators (`state.thousandsSep`/`decimalSep`, persisted). `fmtMoney(v)` takes NO decimals argument: every cost amount rounds to `state.moneyDecimals` (Settings → Decimal places, 0 to 8, default 2, persisted as `clauditor_money_decimals`); never pass a per-site precision, or that one number stops following the setting. Percentages, durations and compact token counts keep their own fixed precision; chart series data and the CSV export stay raw. Never concatenate `'$' + x.toFixed(n)` in display code; chart *series data* and the CSV export deliberately stay raw.

**Projects:** group by `projectKey()` in utils.js (Code: cwd; Cowork: `'cowork:'+taskId` — one project per task) and display via `projectName()` (folder basename / task title). Never group or label projects by raw cwd — Cowork cwds point into the app's store.

**Session taxonomy:** Type (Chat/Cowork/Code) comes from `sessionKind` on each entry — `parseEntries` tags `'code'`, `parseCoworkEntries` tags `'cowork'`; never infer type from cwd paths (a past bug). Source (Desktop app/CLI) comes from the `entrypoint` record field. Cowork tasks never write `~/.claude/projects`; each task in the Desktop app's `~/Library/Application Support/Claude/local-agent-mode-sessions` store keeps usage in TWO places that must both be read (dedupe by message id makes it safe): the signed `local_<taskId>/audit.jsonl` mirror AND a full private Claude Code tree at `local_<taskId>/.claude/projects/**` (subagent sidechains and turn durations exist only there); `local_<taskId>.json` holds the title. In the browser this is browsed on the start page via a classic `<input webkitdirectory>` picker, NOT `showDirectoryPicker`, because Chrome's File System Access blocklist refuses persistent handles under `~/Library`; persistence comes from the archive instead (cowork entries/titles are archived once loaded). In Electron both sources load natively and automatically.

**Data sources / presentation split:** loaders fill `state.srcCode` / `state.srcCowork` independently; `presentDashboard()` in loader.js assembles them into `allEntries` etc., dedupes, renders, and writes the archive. Never push directly into `state.allEntries` — assembly rebuilds it. One Cowork task = one session row (audit session ids are per-command, so entries are grouped under the task id). Chat conversations have no local data at all.

**Pricing:** rates come from `src/core/pricing.json` (the single source of truth); `config.js` turns it into version-anchored regex rows (`idPattern(id)`: optional `-YYYYMMDD` or Vertex `@YYYYMMDD` snapshot, then an optional Bedrock `-vN:N` revision, and never a longer version, so `opus-4-1` cannot match `opus-4-10`; provider prefixes like `us.anthropic.` work because the pattern is unanchored at the start). A model's optional `aliases` are exact, case-insensitive ids matched before any pattern (for opaque ids such as Bedrock application-inference-profile ARNs). The approximate `FAMILY_FALLBACKS` come last, carry `approx` so `getUnknownModels()` flags them, and are derived by `buildFamilyFallbacks()` from the newest model of each family in the list (`modelVersion()` orders 5.10 after 5.9), so estimates never go stale. `isAnthropicModel()` treats `arn:aws:bedrock:` ids as Anthropic, so they are estimated and flagged, never priced as free local models. Each model has a `history`: `history[0]` may carry a `from` (the first-seen date of a model the workflow added; informational, since the first version also prices any earlier timestamp), every later version has a strictly later `from` date (UTC, compared against the entry's ISO `ts`), and `priceAt()` picks the version in force; with no timestamp it returns the latest. A version may carry `tiers` (`above` = prompt-token threshold, strict "over"); `tierAt()` picks the tier from `promptTokens(e)` = input + cache read + cache write, per request. Always cost through `entryCostByType(e)`/`entryCost(e)`, which apply both; `costByType(price, e)` is the pure rate math. Rate fields are `input`, `output`, `cacheWrite5m`, `cacheWrite1h`, `cacheRead` (`RATE_KEYS`). **Never hand-edit rates that the workflow manages**: the `update-pricing` GitHub workflow (daily + manual) runs `scripts/update-pricing.mjs`, which parses Anthropic's official pricing page and refuses to guess (exact header names only, exactly one price per cell, every row must map to a model id unless listed in `IGNORED_ROWS`, footnote and link markup is stripped before ids are derived, a new id that extends a model missing from the page is treated as a misread), compares against the version in force today (a second change on the same day replaces that day's version instead of appending; a change before a hand-entered future price is inserted in date order), adds new models with their first-seen date, never deletes one (retired models still price old logs), and commits `pricing.json` to `main`. The updater writes `pricing.json` with the indentation the file already has (`detectIndent()`: tabs when Prettier with `useTabs` saved it, otherwise spaces), so automatic commits diff only the price change; `check:pricing` warns when the file is formatted differently from what the updater would write. The unpriced-model banner stores what it shows in `state.unpricedModels` (core never imports features); its **How to add** button calls `openPricingHelp()` in `features/pricing-help.js`, which builds paste-ready snippets with `suggestKey()`/`entrySnippet()`/`aliasSnippet()`. `check:pricing` pastes those snippets into the real `pricing.json` exactly as the guide instructs (entry right after `"models": {`, alias line under a model's `name`) and asserts the result parses and prices exactly, so keep the guide and the file format in step. Hand edits are fine for correcting a `from` date, adding a model the page does not list (enterprise-only or legacy), or adding `aliases`; the updater preserves every field it does not manage. `npm run check:pricing` must stay free of hard-coded live prices, because the workflow runs it after every update; price-dependent tests use synthetic lists through `buildPricing`/`resolvePrice`, and names that must stay unpriced use impossible versions (`claude-opus-999`), never a plausible next model. The commit step only runs on `main`. Fast mode (`usage.speed`) and US-only inference (`usage.inference_geo`) are not priced yet.

**Dismissable banners (convention):** Every dismissable warning/error banner suppresses for **one month per item**, never forever — after the month it warns again. The shared store lives in `utils.js` (`readDismissals()` / `dismissForAMonth()`, localStorage `clauditor_dismissals` mapping key → expiry timestamp; expired entries are pruned on read). Each banner type namespaces its keys (pricing uses `pricing:<model>`; the static cost-estimate note uses `note:cost-estimates`). Static always-rendered notes wire up with `initDismissableNote(elId, key)` — give the element a `.note-close` button. When adding a new warning or error banner, reuse this store with a new namespace prefix — do not invent a separate persistence mechanism or a permanent dismissal. **One deliberate exception:** the Cowork-missing warning (`#cowork-warning`, `updateCoworkWarning()`) has NO suppression at all — per explicit product decision it re-appears on every dashboard presentation while no Cowork data is loaded; ✕ hides it only until the next present.
