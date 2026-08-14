# Clauditor — Architecture & Flow Diagrams

> Companion to [CLAUDE.md](CLAUDE.md) and [README.md](README.md). All diagrams are Mermaid — GitHub renders them natively.

## 1. Big picture — what the app does

Clauditor is a **single-file HTML dashboard** that reads Claude Code's local session logs, computes token costs from Anthropic pricing, and renders charts. Everything runs in the browser; no server, no uploads.

```mermaid
flowchart LR
    subgraph disk["Local disk"]
        logs["~/.claude/projects/<br/>{project}/{session}.jsonl<br/>{session}/subagents/*.jsonl<br/>+ *.meta.json sidecars"]
        arch["Archive folder (optional)<br/>clauditor-archive-YYYY-MM.jsonl"]
    end

    subgraph app["Clauditor.html (browser / Electron)"]
        fsapi["File System Access API<br/>(showDirectoryPicker)"]
        parse["Parser<br/>type:'assistant' + message.usage"]
        cost["Cost engine<br/>tokens × pricing ÷ 1M × markup"]
        state["state.js<br/>allEntries / allDurations"]
        ui["ApexCharts + DaisyUI UI<br/>Overview tab · Today tab"]
    end

    logs --> fsapi --> parse --> state
    arch -- "read old months" --> state
    state -- "append new entries" --> arch
    state --> cost --> ui

    subgraph persist["Browser persistence"]
        idb["IndexedDB:<br/>folder handle, archive handle"]
        ls["localStorage:<br/>markup, budget, date_from, theme"]
    end

    fsapi -.-> idb
    ui -.-> ls
```

Key facts:

- Only JSONL lines with `type: "assistant"` and a `message.usage` field are counted ([parser.js](src/core/parser.js)).
- Cost is always recomputed from token counts × the pricing table in [config.js](src/core/config.js) — the `costUSD` field in the logs is never trusted. Matching is longest-pattern-first; models with no entry trigger a visible warning banner (they'd otherwise be silently priced at default rates).
- An optional markup multiplier (default **×1** — no markup) can be applied on top of the Anthropic base cost.
- All day/week/month bucketing happens in the **viewer's local timezone** via [dates.js](src/core/dates.js) — timestamps are UTC instants, and `date` is recomputed from `ts` at parse and archive-read time, so data recorded in any timezone displays consistently.
- Subagent JSONL files get an `agentType` label resolved from `.meta.json` sidecars, powering the per-session agent breakdown.

## 2. Startup & folder authorization flow

```mermaid
flowchart TD
    start(["Page load — main.js IIFE"]) --> theme["initTheme + table sorting +<br/>restore markup/budget from localStorage"]
    theme --> supported{"showDirectoryPicker<br/>supported?"}

    supported -- "No (Safari/Firefox)" --> welcome["Show welcome screen<br/>(webkitdirectory file-input fallback)"]
    supported -- Yes --> handle{"Saved folder handle<br/>in IndexedDB?"}

    handle -- No --> welcome
    handle -- Yes --> perm{"queryPermission<br/>('read')"}

    perm -- granted --> load["loadAndRender(handle)"]
    perm -- prompt --> reauth["Show 'Re-authorize Folder' box<br/>(one click → requestPermission)"]
    perm -- denied --> welcome

    reauth -- "user clicks" --> load
    welcome -- "user picks folder" --> save["saveHandle → IndexedDB"] --> load
    load --> dash(["Dashboard rendered"])
```

## 3. Data-loading pipeline (`loadAndRender`)

```mermaid
flowchart TD
    a(["loadAndRender(dirHandle)"]) --> b["readArchive(archiveHandle, fromMonth)<br/>only months ≥ date-from filter"]
    b --> c["collectJsonlFiles(dirHandle)<br/>recursive walk; subagents/ dirs read<br/>.meta.json first for agentType"]
    c --> d["Per file: readJsonlFile →<br/>parseEntries + parseDurations"]
    d --> e["Merge archive + live entries<br/>into state.allEntries"]
    e --> f["Dedupe by message ID<br/>(keep entry with highest output tokens)"]
    f --> g["Sort by timestamp"]
    g --> h["renderAll() via render callback<br/>(set by main.js — avoids circular import)"]
    h --> i["writeArchive:<br/>append only unseen entries to<br/>per-month JSONL files"]
```

Why the dedupe matters: streaming responses write multiple partial `assistant` entries with the same message ID; keeping the max-output one prevents double counting. The identity key lives in exactly one place — `entryKey()` / `durationKey()` in [parser.js](src/core/parser.js) — and is shared by the loader dedupe, the archive's append-only writes, and the archive merge, so the three can never drift apart.

## 4. Module dependency graph

```mermaid
flowchart TD
    main["main.js<br/>entry: wires window.* handlers,<br/>resize, init"]

    subgraph core["src/core — infrastructure (no DOM rendering)"]
        config["config.js<br/>PRICING, calcCost,<br/>getUnknownModels"]
        datesjs["dates.js<br/>dayKey, todayKey,<br/>week/month keys"]
        statejs["state.js<br/>shared mutable state"]
        db["db.js<br/>IndexedDB handles"]
        fsjs["fs.js<br/>JSONL walker"]
        parser["parser.js<br/>parse, filter, bucket"]
        loader["loader.js<br/>load orchestration"]
        folder["folder.js<br/>select / reauthorize"]
        archive["archive.js<br/>monthly snapshots"]
        chartsCore["charts.js<br/>shared chart helpers"]
        themejs["theme.js"]
        utils["utils.js<br/>fmt, DOM helpers"]
    end

    subgraph overview["src/features/overview"]
        oIndex["index.js<br/>renderAll, setView, exportCsv"]
        oCards["cards.js"] 
        oCharts["charts.js"]
        oHeat["heatmap.js"]
        oTables["tables.js"]
        oDetail["detail.js"]
    end

    subgraph today["src/features/today"]
        tIndex["index.js<br/>renderTodayView, switchTab"]
        tCards["cards.js"]
        tCharts["charts.js"]
        tSessions["sessions.js"]
        tTables["tables.js"]
    end

    main --> core
    main --> overview
    main --> today

    folder --> db & loader
    loader --> fsjs & parser & archive & statejs & config & datesjs
    archive --> db & statejs & parser & datesjs
    parser --> config & statejs & datesjs
    statejs --> datesjs

    oIndex --> oCards & oCharts & oHeat & oTables
    oIndex --> parser & config
    oIndex --> tIndex
    tIndex --> tCards & tCharts & tSessions & tTables

    loader -. "setRenderCallback(renderAll)<br/>set at startup by main.js" .-> oIndex
```

Two intentional patterns to preserve:

1. **`core/` never imports from `features/`.** The one place it needs to trigger rendering, [loader.js](src/core/loader.js) uses a callback injected by [main.js](src/main.js) (`setRenderCallback`).
2. **`window.*` exposure.** The bundle is an ES module, so any function referenced by an HTML `onclick="..."` attribute must be added to the `Object.assign(window, {...})` block at the bottom of [main.js](src/main.js). Forgetting this is the most common way to break a new button.

## 5. Build & distribution pipeline

```mermaid
flowchart TD
    subgraph sources["Sources"]
        idx["index.html<br/>(EJS includes)"]
        partials["src/html/partials/*.html"]
        js["src/main.js + modules"]
        css["src/styles.css<br/>(Tailwind 4 + DaisyUI 5)"]
    end

    sources --> vite["vite build<br/>plugins: @tailwindcss/vite,<br/>vite-plugin-html (EJS),<br/>vite-plugin-singlefile"]
    vite --> one["dist/index.html<br/>(everything inlined: JS, CSS, ApexCharts)"]
    one --> mv["mv → dist/Clauditor.html"]
    mv --> post["scripts/postbuild.mjs<br/>html-minifier-terser (CSS+HTML only;<br/>JS already minified by esbuild)"]
    post --> artifact(["dist/Clauditor.html<br/>single self-contained file"])

    artifact --> browser["Distribution 1: open directly<br/>in Chrome / Edge / Arc"]
    artifact --> electron["Distribution 2: Electron<br/>electron/main.js loads it in a BrowserWindow"]
    electron --> builder["electron-builder →<br/>dmg / nsis / AppImage<br/>(output: dist-electron/)"]
```

## 6. Where things persist

| What | Where | Key |
|---|---|---|
| Selected `.claude/projects` folder | IndexedDB `clauditor/handles` | `root` |
| Archive folder | IndexedDB `clauditor/handles` | `archiveHandle` |
| Markup multiplier | localStorage | `clauditor_markup` |
| Monthly budget | localStorage | `clauditor_budget` |
| Date-from filter | localStorage | `clauditor_date_from` |
| Dismissed banners (1-month expiry per item) | localStorage | `clauditor_dismissals` |
| Theme (winter/dracula) | localStorage | `clauditor_theme` |
| Historical usage data | Archive folder on disk | `clauditor-archive-YYYY-MM.jsonl` |
