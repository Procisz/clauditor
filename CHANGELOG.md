# Changelog

All notable changes to Clauditor are documented here.

## [Unreleased]

### ✨ New Features
- Reasoning-effort visibility: sortable Effort column in the session panels (dominant level badge + compact mix like `xhigh · max ×3`), per-effort breakdown chips in the session modal, and an aggregate effort mix in the Model Breakdown header — the field only exists on newer log records, older calls show as "no data"
- Session modal shows peak context-window use (largest prompt of the session, with an estimated % of the 200K/1M window)

### ♻️ Refactoring
- Comment-free codebase (owner preference — invariants documented in CLAUDE.md); dead code removed
- Deduplicated shared logic: `entryCost()` (10 files inlined the same cost expression), `parseJsonlLines()` (loader/native), effort ranking, keyed directory-handle persistence in db.js (archive reuses it)

### 🐛 Bug Fixes
- Today tab session rows now backfill slug/cwd from later entries (first-record-wins gap)
- Setting the same character for both number separators no longer produces ambiguous numbers (thousands separator auto-clears)

---

## [2.0.0] — 2026-08-17

### ✨ New Features
- Settings popup (gear icon in the header) hosting the markup multiplier, the number-format separators, and the last-updated timestamp — removed from the Overview toolbar
- Configurable number formatting: thousands and decimal separator settings (defaults `,` / `.`, persisted in localStorage); every displayed number — cards, tables, panels, modal, chart axes/tooltips, statuses — formats accordingly (chart series data and CSV export stay machine-formatted)
- Model Breakdown rows expand into a per-model session explorer: sortable session list (three-state headers, default: start date, newest first), pagination (5/10/25/50/100 per page, default 5), and a click-through session detail modal (stat cards, token distribution bar, per-model/per-agent breakdown, timeline)
- Sessions display their real names everywhere (explorer, modal, Today tab, drill-down panel): the title Claude Desktop shows in its sidebar (from `custom-title` records; renames follow), falling back to the auto-generated slug, then the id prefix; titles are persisted in the archive (`kind:'t'` lines) so they survive log pruning
- Type and Source columns in the session explorer and modal: Type is Chat / Cowork / Code (from each entry's data source), Source is Desktop app vs CLI (from the log `entrypoint` field); archives written before this release are backfilled with the entrypoint on the next archive write, while the live logs still carry it
- Cowork data source: loads the Desktop app's `local-agent-mode-sessions` store — both the `local_<taskId>/audit.jsonl` signed transcript and the task's full private Claude Code tree (`local_<taskId>/.claude/projects/**`, which also holds subagent sidechains and turn durations the audit lacks; entries dedupe by message id) plus `local_<taskId>.json` titles. Cowork tasks never write `~/.claude/projects`, which is why they were invisible; one task = one session row, typed Cowork, titled like the app's Home tab
- Redesigned start page: the two data sources (Claude Code, Cowork) are browsed independently with green/red status feedback, and the dashboard opens only via an explicit **Open Dashboard** button (enabled once either source is loaded); the header's Select Folder / Add Cowork buttons are replaced by a single **Data Sources** button returning to this page
- Electron desktop app now auto-loads both data sources natively (read-only preload bridge restricted to the two data roots): no pickers, no permission prompts, no welcome screen — and Refresh re-reads everything; recommended over the browser for Cowork users, since Chrome cannot remember folders under `~/Library`
- Warning banner when logs contain models missing from the pricing table (previously priced silently at default rates); dismissable per model, suppressing for one month — after that (or for a newly appearing unknown model) it warns again
- Cost-estimate disclaimer note is dismissable too (same one-month suppression)
- Warning banner whenever the dashboard is shown without Cowork data (numbers cover Code sessions only), with a shortcut to Data Sources; dismissable but never suppressed — it returns on every load until Cowork data is added
- Pricing table updated from current Anthropic rates; adds fable-5/mythos ($10/$50) and corrects opus-4.0/4.1 ($15/$75)
- Longest-pattern-first pricing match — insertion order can no longer shadow a specific model entry
- Model Breakdown table sortable by every column (three-state headers: ascending → descending → neutral; neutral = the default highest-final-cost-first order)
- Top Projects table: 20-row cap removed — all projects listed with the shared paginator (default 10 per page) and every column sortable, same three-state pattern, default highest final cost first (treemap keeps top 20); the whole section now ignores the date filter (always all time) and sits directly below Model Breakdown
- Project rows expand into the same session explorer as Model Breakdown (sortable, paginated, session modal on click); projects display names instead of paths — folder basename for Code, task title for Cowork (each Cowork task is one project, unifying its audit- and tree-sourced entries that previously split between an `(unknown)` row and an unreadable store path)
- `npm run check:pricing` sanity check for the pricing table

### 🐛 Bug Fixes
- In browsers without the folder-picker API (Safari, some file:// contexts) browsing the Code source jumped straight to the dashboard instead of staying on the sources page — the fallback input now stages the source (status + explicit Open Dashboard) exactly like the picker path
- No default date range: the dashboard now shows all history out of the box (previous builds silently applied a 30-day "from" filter and persisted it as if user-chosen; a one-time reset clears that stored value); the Model Breakdown hint shows "all time" alongside the filtered count whenever a range hides sessions
- All day/week/month bucketing now uses the viewer's local timezone (was a mix of UTC and local; evening entries landed on the wrong day in UTC+ zones)
- Archived entries recompute their day from the timestamp on read, making archives portable across timezones
- Today-card hourly sparkline used the UTC hour while the hourly chart used local

### ♻️ Refactoring
- Extract shared `entryKey()`/`durationKey()` — loader dedupe and archive writes can no longer drift apart
- New `core/dates.js` as the single source of truth for date bucketing
- Remove release tooling, auto-updater, and stray root files (repo is no longer published)
- Remove AzTech branding from the markup label; default markup multiplier is now ×1 (no markup)

---

## [1.12.1] — 2026-08-12

### 🐛 Bug Fixes
- Add missing `sonnet-5` and `opus-5` pricing entries; both models were silently falling back to stale generic rates and overcounting cost by ~30-50%

---

## [1.12.0] — 2026-06-15

### ✨ New Features
- Add estimated cost disclaimer banner near markup control
- Add info icons with tooltip on base/final cost cards

---

## [1.11.0] — 2026-06-10

### ✨ New Features
- Add optional per-month archive folder to survive log pruning

---

## [1.10.1] — 2026-06-02

### 🐛 Bug Fixes
- Use local timezone dates in heatmap to prevent row displacement in UTC+ zones

---

## [1.10.0] — 2026-05-07

### ✨ New Features
- Add session time metric to overview and today cards

---

## [1.9.1] — 2026-04-15

### 🐛 Bug Fixes
- Skip heatmap re-render on view toggle
- Add zoom controls to time-series charts

---

## [1.9.0] — 2026-03-31

### ✨ New Features
- Redesign onboarding page with card layout and styled path blocks
- Add Less/More color legend below heatmap
- Add sparklines, budget gauge, treemap, burn-up, timeline, cumulative & scatter charts
- Apply Slate+Indigo design system
- Rewrite activity heatmap with ApexCharts
- Replace Chart.js with ApexCharts across all views
- Migrate all templates to DaisyUI v5 components
- Add light/dark theme switcher with persistent preference (winter/dracula)

### 🐛 Bug Fixes
- Cancel pending resize timer on tab switch
- Resolve post-redesign chart lifecycle and badge issues
- Fix card highlight and burn-rate colors for winter theme
- Fix overview view toggle active state

### ⚡ Performance
- Eliminate resize jank with debounced per-container resize

### ♻️ Refactoring
- Split monolithic main.js into core and feature modules
- Migrate to Tailwind v4, DaisyUI v5, ApexCharts

---

## [1.8.0] — 2026-03-26

### ✨ New Features
- Add webkitdirectory fallback for browsers without File System Access API (Safari support)

---

## [1.7.1] — 2026-03-26

### 🐛 Bug Fixes
- Show current partial period and fix timezone bug in week/month bucketing

---

## [1.7.0] — 2026-03-25

### ✨ New Features
- Add Started time column to sessions table
- Add Final Cost sort toggle without chart re-render
- Add avg response time column to sessions table
- Add CSV export for filtered date range

### 🔧 Maintenance
- Add version to released HTML filename

---

## [1.6.0] — 2026-03-23

### ✨ New Features
- Add day navigator to browse any past date
- Unify agent colors across badges and chart with 10-color palette

### 🐛 Bug Fixes
- Correct day navigation timezone bug
- Fit all 8 summary cards in a single row
- Eliminate agent color collisions in session breakdown

---

## [1.5.0] — 2026-03-20

### ✨ New Features
- Expandable subagent breakdown per session

### 🐛 Bug Fixes
- Deduplicate entries by message ID to fix inflated subagent costs
- Exclude sub-agent sidechain entries from session cost totals

---

## [1.4.0] — 2026-03-19

### 🐛 Bug Fixes
- Correct claude-opus-4-6 and haiku-4-5 token rates

---

## [1.3.2] — 2026-03-19

### 🐛 Bug Fixes
- Use entries.length for avg cost per turn; persist date-from

---

## [1.3.1] — 2026-03-17

### ✨ New Features
- Add avg response time and avg cost per turn to Today tab

---

## [1.3.0] — 2026-03-16

### 🐛 Bug Fixes
- Suppress XML parse error from release notes in auto-updater

---

## [1.2.1] — 2026-03-13

### 🐛 Bug Fixes
- Fix today: use entries.length for avg cost per turn; persist date-from

---

## [1.2.0] — 2026-03-13

### ✨ New Features
- Persist monthly budget and markup across sessions via localStorage

---

## [1.1.0] — 2026-03-13

### ✨ New Features
- Integrate Electron support with auto-updater and version display
- Add native app menu with Check for Updates, About dialog, and updated icons
- Add manual release script with auto version detection
- Inline favicon and minify HTML build output
- Add Today nav tab with pie charts and hourly breakdown

### 🔧 Maintenance
- Add automated release workflow with conventional commit versioning

---

## [1.0.0] — 2026-03-13

### ✨ New Features
- Initial Claude usage dashboard (single-file HTML app)
- Vite build producing self-contained Clauditor.html
- Safe DOM manipulation (no innerHTML)
