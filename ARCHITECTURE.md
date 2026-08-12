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
- Cost is always recomputed from token counts × the pricing table in [config.js](src/core/config.js) — the `costUSD` field in the logs is never trusted.
- A configurable markup multiplier (default **×1.35**) is applied on top of the Anthropic base cost.
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

Why the dedupe matters: streaming responses write multiple partial `assistant` entries with the same message ID; keeping the max-output one prevents double counting. The archive merge relies on the same key (`msgId`, falling back to `ts|sessionId`).

## 4. Module dependency graph

```mermaid
flowchart TD
    main["main.js<br/>entry: wires window.* handlers,<br/>resize, init"]

    subgraph core["src/core — infrastructure (no DOM rendering)"]
        config["config.js<br/>PRICING, calcCost"]
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
    loader --> fsjs & parser & archive & statejs
    archive --> db & statejs
    parser --> config & statejs

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
    builder --> updater["electron-updater:<br/>checks GitHub release latest.yml<br/>on launch + every 4h"]
```

## 6. Release flow (`scripts/release.sh`)

```mermaid
flowchart TD
    r(["npm run release<br/>(or :minor / :major / :electron)"]) --> clean{"git working<br/>tree clean?"}
    clean -- No --> abort(["Abort"])
    clean -- Yes --> bump["Detect semver bump from<br/>conventional commits since last tag:<br/>BREAKING→major, feat→minor, else→patch"]
    bump --> ver["npm version (no tag) →<br/>bump package.json"]
    ver --> build["npm run build →<br/>dist/Clauditor-v{V}.html"]
    build --> el{"--electron flag?"}
    el -- Yes --> pub["electron-builder --publish always<br/>(uploads installer + latest.yml,<br/>needs GH_TOKEN or gh auth)"]
    el -- No --> notes
    pub --> notes["Generate release notes from<br/>git log (feat/fix/perf/refactor buckets)"]
    notes --> tag["commit 'chore: release vV [skip ci]'<br/>+ git tag + push --follow-tags"]
    tag --> gh["gh release create/edit vV<br/>attach Clauditor-v{V}.html"]
    gh --> done(["Release published"])
```

Requirements: clean committed tree, at least one commit since the last tag, `gh` CLI authenticated (and `GH_TOKEN` for `--electron`).

## 7. Where things persist

| What | Where | Key |
|---|---|---|
| Selected `.claude/projects` folder | IndexedDB `clauditor/handles` | `root` |
| Archive folder | IndexedDB `clauditor/handles` | `archiveHandle` |
| Markup multiplier | localStorage | `clauditor_markup` |
| Monthly budget | localStorage | `clauditor_budget` |
| Date-from filter | localStorage | `clauditor_date_from` |
| Theme (winter/dracula) | localStorage | `clauditor_theme` |
| Historical usage data | Archive folder on disk | `clauditor-archive-YYYY-MM.jsonl` |
