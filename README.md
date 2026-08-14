# Clauditor

A single-file HTML dashboard that visualises your Claude Code token usage and costs — entirely in the browser. No server, no data leaves your machine.

### Overview

![Overview tab showing cost cards, heatmap, and charts](assets/overview.png)

### Today

![Today tab showing daily cost breakdown, model and token distribution](assets/daily.png)

## Features

- **Cost tracking** — Anthropic base cost with an optional markup multiplier (default ×1 — no markup)
- **Cost over time chart** — single bar per period showing final cost; click any bar to drill into session breakdown
- **Token breakdown chart** — stacked bar showing input, output, cache write, cache read
- **Model breakdown** — calls, tokens, and cost per model; entries from models missing a pricing entry trigger a visible warning banner instead of silently using wrong rates
- **Project breakdown** — top 20 projects grouped by working directory
- **Daily / weekly / monthly** view toggle with custom date range filter — the "from" date is persisted across sessions; "to" always resets to today; the current (in-progress) period is highlighted in gold across all three charts
- **Local-timezone bucketing** — all days, weeks, and months are computed in your local timezone, so a late-evening session lands on the day you actually worked, regardless of where the logs were recorded
- **Day navigator** — browse any past day in the Today tab using prev/next arrows or a date picker; Next/Today controls disable when already on today's date
- **Expandable subagent breakdown** — sessions that used subagents show a clickable **▶ N agents** badge; expanding it reveals a per-agent table (type, model, calls, output tokens, cost) and a donut chart splitting cost by agent
- **Archive folder** — optionally set a folder where Clauditor writes per-month append-only snapshots (`clauditor-archive-YYYY-MM.jsonl`); historical data survives even if Claude Code prunes old session files; only months within your date filter are read, so performance stays fast as the archive grows
- **Re-authorize** — remembers your folder; prompts re-authorization if browser permission expires
- **Zero setup after build** — the built `Clauditor.html` is one self-contained file: open it in Chrome, pick a folder, done

## Getting Started

1. **Build `Clauditor.html`** — run `npm install && npm run build`; the single file appears at `dist/Clauditor.html`
2. Open `Clauditor.html` in Chrome, Arc, Edge, or Safari
3. Click **Select Folder** and navigate to your `.claude/projects` directory:
   - macOS / Linux: `~/.claude/projects`
   - Windows: `%USERPROFILE%\.claude\projects`
   > **macOS tip:** The `.claude` folder is hidden by default in Finder. Press `Cmd+Shift+.` to toggle hidden folders visible before selecting it.
4. The dashboard loads instantly — your folder choice is remembered for next time (Chrome/Edge/Arc only)
5. On subsequent opens the folder is re-authorized automatically; if the browser forgets permission, a **Re-authorize Folder** button appears

## Development

```bash
npm install
npm run dev              # Vite dev server with hot reload
npm run build            # → dist/Clauditor.html (single self-contained file)
npm run check:pricing    # sanity-check the pricing table after editing it
npm run electron:dev     # build + launch the desktop app
npm run electron:build   # build + package a desktop installer (dist-electron/)
```

Source lives in `src/` (ES modules, no framework); `index.html` is an EJS template assembled at build time, so open the app through the dev server or the built file — not the raw source file.

## Browser Compatibility

| Browser | Supported | Notes |
|---------|-----------|-------|
| Chrome  | Yes       | Recommended |
| Arc     | Yes       | Chromium-based |
| Edge    | Yes       | Chromium-based |
| Firefox | No        | File System Access API not supported |
| Safari  | Partial   | Works via file picker; folder not remembered between sessions |

## Cost Calculation

Costs are calculated from token counts using Anthropic's published pricing. No `costUSD` field in the JSONL is used or trusted.

```
base_cost = (input_tokens × input_price)
          + (output_tokens × output_price)
          + (cache_creation_tokens × cache_write_price)
          + (cache_read_tokens × cache_read_price)
          ÷ 1,000,000

final_cost = base_cost × markup_multiplier
```

### Model Pricing (per 1M tokens)

The pricing table lives in [`src/core/config.js`](src/core/config.js) — that file is the single source of truth. Current rates (verified 2026-08):

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| claude-fable-5 / mythos | $10.00 | $50.00 | $12.50 | $1.00 |
| claude-opus-5 / opus-4.5→4.8 | $5.00 | $25.00 | $6.25 | $0.50 |
| claude-opus 4.1 and older | $15.00 | $75.00 | $18.75 | $1.50 |
| claude-sonnet-5 (intro until 2026-08-31) | $2.00 | $10.00 | $2.50 | $0.20 |
| claude-sonnet 4.x / 3.x | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-haiku-4-5 | $1.00 | $5.00 | $1.25 | $0.10 |
| claude-haiku 3.x | $0.80 | $4.00 | $1.00 | $0.08 |

Matching is longest-pattern-first, so adding a new specific model can't be shadowed by a generic entry. If your logs contain a model with no entry, the dashboard shows a warning banner rather than silently pricing it wrong. After editing the table, run `npm run check:pricing`.

The markup multiplier (default `1`, i.e. no markup — set it higher if someone bills you a surcharge on top of Anthropic rates) is editable live in the UI; to change the default, edit `CONFIG_DEFAULT_MARKUP` in the same file.

## Archive (optional)

Claude Code periodically prunes old session logs from `~/.claude/projects`. The **Set Archive** button in the header lets you designate any local folder as a persistent archive. Once set:

- After every load, new entries are appended to per-month files (`clauditor-archive-2026-01.jsonl`, etc.) — files only grow, never rewritten
- On the next load, only months within your **date-from** filter are read, so startup stays fast even after years of data
- Archived entries are merged with whatever live files still exist on disk — nothing is ever duplicated or lost
- Files are plain JSON-lines on disk — portable across browsers, machines, and timezones (days are recomputed from timestamps in the viewer's local timezone); point a different browser at the same folder by clicking **Set Archive** once

The folder preference is stored in IndexedDB (Chrome/Edge/Arc). Safari users can set an archive folder too, but the preference is not remembered between sessions (re-select after each page open).

## Data Source

Claude Code writes session logs to:

```
~/.claude/projects/{project-slug}/{session-uuid}.jsonl
~/.claude/projects/{project-slug}/{session-uuid}/subagents/*.jsonl
~/.claude/projects/{project-slug}/{session-uuid}/subagents/*.meta.json
```

Only `type: "assistant"` entries with a `message.usage` field are parsed. All other entries are ignored. `.meta.json` sidecar files are read to resolve agent type names (e.g. `"product-owner"`, `"frontend-dev"`) for the subagent breakdown.

## Privacy

All processing happens locally in your browser, and the built `Clauditor.html` makes **zero network requests** — every dependency (charts, styles) is bundled into the file. Your JSONL files are never uploaded anywhere.

## Tech Stack

- Vanilla JS (ES modules, no framework), bundled with [Vite](https://vitejs.dev/)
- [ApexCharts](https://apexcharts.com/) — all charts, bundled into the single file
- [Tailwind CSS 4](https://tailwindcss.com/) + [DaisyUI 5](https://daisyui.com/) — styling and components
- `vite-plugin-singlefile` — inlines all JS/CSS into one self-contained HTML file
- File System Access API — `window.showDirectoryPicker()` (Chrome/Edge/Arc); `<input webkitdirectory>` fallback for Safari
- IndexedDB — persists the directory handle and archive folder handle between sessions (Chrome/Edge/Arc only)
- File System Access API writable streams — used for append-only archive writes
- Optional Electron wrapper for a desktop app

## License

MIT
