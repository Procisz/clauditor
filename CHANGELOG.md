# Changelog

All notable changes to Clauditor are documented here.

## [Unreleased]

### 💰 Pricing
- **Prices update themselves.** A daily GitHub workflow reads Anthropic's official pricing page and commits `src/core/pricing.json` when a price changes or a model appears; no third-party data source. Pull and rebuild to pick up new prices; Settings shows the price list date
- **Prices are tracked over time.** Each model keeps a dated rate history and every request is priced at the rate in force when it ran, so a later price change never rewrites past costs
- **Prompt-length tiers** (Claude Haiku 5.5 charges more above 100,000 prompt tokens): each request picks its tier from input + cache read + cache write, as Anthropic bills it
- New models from the official page: Claude Opus 5.5 ($4/$20, cache read 0.05 x input), Claude Sonnet 5.5 ($2/$10, cache read 0.05 x), Claude Haiku 5.5 (tiered). Opus 5.5 was priced by the generic Opus estimate ($5/$25, 0.1 x cache read); on the owner's logs the correction is $7,695.55 to $3,964.93 across 51,784 requests
- **Cache writes are billed by TTL.** Anthropic charges a 1-hour cache write at 2 × input and a 5-minute write at 1.25 ×; Clauditor charged everything at the 5-minute rate. Claude Code writes both, and on a real agentic corpus ~80% of written tokens are 1-hour writes — measured on 20k sessions the correction is **+12.7% of total spend**. The split comes from `usage.cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}` and is surfaced in the session modal (token distribution bar and a "% written for 1 hour" line), the Model Breakdown cache column, the session explorer's cache tooltip, the Today cache card, the Token Breakdown chart, the Today token donut, and two new CSV columns
- Non-Anthropic models cost nothing: a locally-run model such as `gpt-oss:20b` was estimated at default Claude rates; it now reports $0.00 and is left out of the unpriced-model banner, since zero is exact rather than an estimate
- Entries archived before the TTL split keep pricing exactly as before (whole total at the 5-minute rate) and are rewritten with the split once seen alongside their raw log again
- Pricing table re-verified against Anthropic's published rates (2026-09-04) and extended to every officially listed model, each as its own entry: Fable 5.1 / 5, Mythos 5.1 / 5, Opus 5 / 4.8 / 4.7 / 4.6 / 4.5 / 4.1 / 4 / 3, Sonnet 5 / 4.6 / 4.5 / 4 / 3.7 / 3.5, Haiku 4.5 / 3.5 / 3
- **Claude Fable 5.1 and Mythos 5.1 cache hits are billed at 0.025 × input ($0.25/MTok), not the standard 0.1 ×** — the table charged $1.00, overstating Fable 5.1 cost by ~31% on a real agentic workload (cache reads dominate the token mix)
- Sonnet 5 stays at $2/$10: the increase to $3/$15 scheduled for 2026-09-01 was cancelled and the introductory rate became standard
- `claude-opus-4` (the dateless Opus 4 id) was priced at the current $5/$25 Opus rate instead of the retired $15/$75 — the `opus-4` pattern carried the newer rate while the legacy rate was reachable only through longer date-shaped patterns

### 🐛 Bug Fixes
- A Claude model newer than the pricing table was priced silently and never reached the warning banner: bare family patterns (`opus`, `sonnet`, `haiku`, `fable`) match any version, so `getUnknownModels()` — which only flagged `PRICING_DEFAULT` — stayed quiet. Family rows are now `approx` and flag, restoring the guarantee documented in the README (this is the failure mode of 1.12.1, where `sonnet-5`/`opus-5` were mispriced by 30-50% undetected)
- Version patterns are anchored, so a two-digit minor version can no longer be captured by its one-digit prefix (`claude-opus-4-10` resolved to the retired Opus 4.1 row at $15/$75, a silent 3× overcharge)
- Fable and Mythos were missing from the model badge and label helpers: Fable rendered in Sonnet's colour, and `claude-fable-5` / `claude-fable-5-1` collapsed to the same truncated `claude-fable` chip in the session modal

### ✨ New Features
- The loading state (spinner + "Scanning files…") is centred in the viewport instead of sitting under the header
- Settings → **Decimal places**: how many decimals every cost amount is rounded to (0 to 8, default 2, persisted). Applies to all cost displays: cards, tables, session panels and modal, chart axes and tooltips, heatmap. Costs previously showed a fixed mix of 2, 4 and 6 decimals depending on the surface
- No modal is taller than 80% of the viewport: the session detail and settings dialogs cap at 80vh and scroll inside the box (a long session's Models/Agents tables used to push the dialog to nearly the full window height)
- Every table now opens sorted by final cost, most expensive first, and returns to that order in the neutral sort state: the per-model and per-project session panels (previously newest first) and the Token Usage type table join the Model Breakdown, Top Projects, drill-down, Today, and modal tables that already did
- Model Breakdown now leads the Overview, directly below the summary cards, followed by the new Token Usage section (Top Projects no longer sits immediately under Model Breakdown)
- Token Usage section on the Overview, right after Model Breakdown: the all-time total of every token type with a proportion bar and a per-type table (tokens, share of volume, final cost, share of cost); the volume/cost contrast shows where the money actually goes; large counts now format as `2.19B` instead of `2186.0M`
- The folder paths on the data-source page are click-to-copy: clicking one puts it on the clipboard and confirms with a small toast that clears itself after ~2 seconds. Handy for the Cowork path, which has to be pasted into the macOS ⌘⇧G dialog. They are real buttons, so they are keyboard-reachable; copying falls back to a hidden textarea when the Clipboard API is unavailable (opening the single file over `file://`), and says so in the toast if the browser refuses outright
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
- Model Breakdown rows expand into a per-model session explorer: sortable session list (three-state headers, default: final cost, most expensive first), pagination (5/10/25/50/100 per page, default 5), and a click-through session detail modal (stat cards, token distribution bar, per-model/per-agent breakdown, timeline)
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
