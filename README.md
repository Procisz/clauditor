# Clauditor

A single-file HTML dashboard that visualises your Claude Code token usage and costs — entirely in the browser. No server, no install, no data leaves your machine.

### Overview

![Overview tab showing cost cards, heatmap, and charts](assets/overview.png)

### Today

![Today tab showing daily cost breakdown, model and token distribution](assets/daily.png)

## Features

- **Cost tracking** — Anthropic base cost with a configurable markup multiplier (default ×1.35)
- **Cost over time chart** — single bar per period showing final cost; click any bar to drill into session breakdown
- **Token breakdown chart** — stacked bar showing input, output, cache write, cache read
- **Model breakdown** — calls, tokens, and cost per model
- **Project breakdown** — top 20 projects grouped by working directory
- **Daily / weekly / monthly** view toggle with custom date range filter — the "from" date is persisted across sessions; "to" always resets to today; the current (in-progress) period is highlighted in gold across all three charts
- **Day navigator** — browse any past day in the Today tab using prev/next arrows or a date picker; Next/Today controls disable when already on today's date
- **Expandable subagent breakdown** — sessions that used subagents show a clickable **▶ N agents** badge; expanding it reveals a per-agent table (type, model, calls, output tokens, cost) and a donut chart splitting cost by agent
- **Archive folder** — optionally set a folder where Clauditor writes per-month append-only snapshots (`clauditor-archive-YYYY-MM.jsonl`); historical data survives even if Claude Code prunes old session files; only months within your date filter are read, so performance stays fast as the archive grows
- **Re-authorize** — remembers your folder; prompts re-authorization if browser permission expires
- **Zero setup** — open `index.html` in Chrome, pick a folder, done

## Getting Started

1. **Download `Clauditor.html`** from the [latest release](../../releases/latest) — no clone or install needed
2. Open `Clauditor.html` in Chrome, Arc, Edge, or Safari
3. Click **Select Folder** and navigate to your `.claude/projects` directory:
   - macOS / Linux: `~/.claude/projects`
   - Windows: `%USERPROFILE%\.claude\projects`
   > **macOS tip:** The `.claude` folder is hidden by default in Finder. Press `Cmd+Shift+.` to toggle hidden folders visible before selecting it.
4. The dashboard loads instantly — your folder choice is remembered for next time (Chrome/Edge/Arc only)
5. On subsequent opens the folder is re-authorized automatically; if the browser forgets permission, a **Re-authorize Folder** button appears

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

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| claude-opus-4 | $5.00 | $25.00 | $6.25 | $0.50 |
| claude-opus (older) | $15.00 | $75.00 | $18.75 | $1.50 |
| claude-sonnet-4 / 4-6 | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-sonnet-3-5 | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-haiku-4-5 | $1.00 | $5.00 | $1.25 | $0.10 |
| claude-haiku-3-5 | $0.80 | $4.00 | $1.00 | $0.08 |

The markup multiplier (default `1.35`) is editable live in the UI. To permanently update pricing or the default multiplier, edit the `CONFIG` section at the top of the `<script>` block in `index.html`.

## Archive (optional)

Claude Code periodically prunes old session logs from `~/.claude/projects`. The **Set Archive** button in the header lets you designate any local folder as a persistent archive. Once set:

- After every load, new entries are appended to per-month files (`clauditor-archive-2026-01.jsonl`, etc.) — files only grow, never rewritten
- On the next load, only months within your **date-from** filter are read, so startup stays fast even after years of data
- Archived entries are merged with whatever live files still exist on disk — nothing is ever duplicated or lost
- Files are plain JSON-lines on disk — portable across browsers and machines; point a different browser at the same folder by clicking **Set Archive** once

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

All processing happens locally in your browser. The app makes no network requests except loading Chart.js from jsDelivr CDN on startup. Your JSONL files are never uploaded anywhere.

## Tech Stack

- Vanilla HTML / CSS / JS — no framework, no bundler
- [Chart.js 4.4.7](https://www.chartjs.org/) via CDN (SRI pinned)
- File System Access API — `window.showDirectoryPicker()` (Chrome/Edge/Arc); `<input webkitdirectory>` fallback for Safari
- IndexedDB — persists the directory handle and archive folder handle between sessions (Chrome/Edge/Arc only)
- File System Access API writable streams — used for append-only archive writes

## License

MIT
