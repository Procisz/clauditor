# Clauditor: Architecture & Flow Diagrams

> Companion to [CLAUDE.md](CLAUDE.md) and [README.md](README.md). All diagrams are Mermaid, GitHub renders them natively.

## 1. Big picture: what the app does

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
        ui["ApexCharts + plain CSS UI<br/>six pages: Overview · Today · Models ·<br/>Projects · Sessions · Costs"]
    end

    logs --> fsapi --> parse --> state
    arch -- "read old months" --> state
    state -- "append new entries" --> arch
    state --> cost --> ui

    subgraph persist["Browser persistence"]
        idb["IndexedDB:<br/>folder handle, archive handle"]
        ls["localStorage:<br/>markup, budget, date_from, theme, lang, ..."]
    end

    fsapi -.-> idb
    ui -.-> ls
```

Key facts:

- Only JSONL lines with `type: "assistant"` and a `message.usage` field are counted ([parser.js](src/core/parser.js)).
- Cost is always recomputed from token counts × the pricing table in [config.js](src/core/config.js): the `costUSD` field in the logs is never trusted. Matching is first-hit-wins over version-anchored patterns; models with no exact entry are priced approximately from their family and trigger a visible warning banner (they'd otherwise be silently mispriced).
- An optional markup multiplier (default **×1**, no markup) can be applied on top of the Anthropic base cost.
- All day/week/month bucketing happens in the **viewer's local timezone** via [dates.js](src/core/dates.js): timestamps are UTC instants, and `date` is recomputed from `ts` at parse and archive-read time, so data recorded in any timezone displays consistently.
- Subagent JSONL files get an `agentType` label resolved from `.meta.json` sidecars, powering the per-session agent breakdown.

## 2. Startup & folder authorization flow

```mermaid
flowchart TD
    prepaint["Inline pre-paint script in index.html<br/>applies saved theme and language"] --> start
    start(["Page load: main.js IIFE"]) --> theme["initLang → initAppearance → initTooltips →<br/>restore markup, budget, separators, decimals<br/>from localStorage → setRenderCallback(shell)"]
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
    c --> d["readLogFiles: per-file cache in IndexedDB<br/>unchanged = skip, grown = read tail only,<br/>else parseLogLines + parseEntries + parseDurations"]
    d --> e["Merge archive + live entries<br/>into state.allEntries"]
    e --> f["Dedupe by message ID<br/>(keep entry with highest output tokens)"]
    f --> g["Sort by timestamp"]
    g --> h["Shell renders the active page via render callback<br/>(set by main.js, avoids circular import);<br/>other pages are marked dirty"]
    h --> i["writeArchive:<br/>append only unseen entries to<br/>per-month JSONL files"]
```

Why the dedupe matters: streaming responses write multiple partial `assistant` entries with the same message ID; keeping the max-output one prevents double counting. The identity key lives in exactly one place, `entryKey()` / `durationKey()` in [parser.js](src/core/parser.js), and is shared by the loader dedupe, the archive's append-only writes, and the archive merge, so the three can never drift apart.

## 4. Module dependency graph

```mermaid
flowchart TD
    main["main.js<br/>entry: wires window.* handlers,<br/>resize, init"]

    subgraph core["src/core: infrastructure (no DOM rendering)"]
        config["config.js<br/>PRICING, entryCost,<br/>getUnknownModels"]
        datesjs["dates.js<br/>dayKey, todayKey,<br/>week/month keys"]
        statejs["state.js<br/>shared mutable state"]
        db["db.js<br/>IndexedDB handles"]
        fsjs["fs.js<br/>JSONL walker"]
        parser["parser.js<br/>parse, filter, bucket"]
        loader["loader.js<br/>load orchestration"]
        folder["folder.js<br/>select / reauthorize"]
        archive["archive.js<br/>monthly snapshots"]
        metrics["metrics.js<br/>pure aggregation: totals, buckets,<br/>previous period, forecast"]
        periods["periods.js<br/>pure quick periods for the<br/>period row"]
        utils["utils.js<br/>fmt, DOM helpers"]
    end

    subgraph i18n["src/i18n"]
        i18nIndex["index.js<br/>t, tn, setLang, applyStaticTexts"]
        messages["messages/&lt;area&gt;.js<br/>en + hu dictionaries"]
    end

    subgraph appdir["src/app: shell"]
        shell["shell.js<br/>period row, renderActive, dirty pages"]
        router["router.js<br/>hash routes, page tabs"]
        appearance["appearance.js + themes.js<br/>mode, light/dark theme"]
        settings["settings.js<br/>tabbed settings dialog"]
        events["events.js<br/>themechange, langchange, rerender"]
        exportjs["export.js<br/>CSV export"]
    end

    subgraph ui["src/ui: UI kit"]
        uikit["charts, legend, table, modal,<br/>tooltip, dom, icons, ramp, fit, listen"]
    end

    subgraph components["src/components"]
        comps["sessions, session-modal,<br/>bucket-modal"]
    end

    subgraph pages["src/pages"]
        pagesIdx["index.js + overview, today, models,<br/>projects, sessions, costs"]
    end

    main --> core
    main --> appdir
    main --> pages
    main --> i18n

    shell --> router & metrics & events & i18nIndex
    router --> pagesIdx
    pagesIdx --> uikit & comps & metrics
    comps --> uikit & metrics
    uikit --> i18nIndex & events
    appearance --> events
    settings --> appearance & i18nIndex
    i18nIndex --> messages

    folder --> db & loader
    loader --> fsjs & parser & archive & statejs & config & datesjs
    archive --> db & statejs & parser & datesjs
    parser --> config & statejs & datesjs
    statejs --> datesjs

    metrics --> config & datesjs

    loader -. "setRenderCallback(shell)<br/>set at startup by main.js" .-> shell
```

Intentional patterns to preserve:

1. **`core/` never imports from `app/`, `ui/`, `components/` or `pages/`.** The one place it needs to trigger rendering, [loader.js](src/core/loader.js) uses a callback injected by [main.js](src/main.js) (`setRenderCallback`).
2. **`window.*` exposure only for the start page.** The start page markup uses `onclick="..."` attributes, so exactly those handlers (`browseCodeFolder`, `browseCoworkFolder`, `onCodeFilesPicked`, `onCoworkPicked`, `openDashboard`, `showSources`, `reauthorize`, `showFreshSelect`, `loadFromFileInput`, `openPricingHelp`, `refreshData`, `selectArchiveFolder`) live in the `Object.assign(window, {...})` block at the bottom of [main.js](src/main.js). Everything else binds with `addEventListener`.
3. **`metrics.js` is pure.** It takes entries and the markup and returns numbers; no state, no DOM. Cost math goes only through `entryCost`, `entryCostByType`, `cacheWrite5m` and `cacheWrite1h`.
4. **No module touches `localStorage` or `document` at import time**, so the Node checks (`check:pricing`, `check:loader`) can import `src/core` (including the pure `pricing-snippets.js`, which `pricing-help.js` also imports).

### Routing and the page contract

Pages are addressed by hash only (the Electron build loads over `file://`): `#overview`, `#today`, `#models`, `#projects`, `#sessions`, `#costs`. The slugs are English in both languages. An unknown or empty hash opens Overview. [router.js](src/app/router.js) registers the pages, builds the tab strip and activates a page; [shell.js](src/app/shell.js) builds the context and renders only the active page. Other pages are marked dirty and render when activated.

A page module `src/pages/<id>/index.js` default-exports `{ id, titleKey, icon, usesRange, render(mount, ctx) }`. `ctx` holds `entries` (the period), `allEntries`, `durations`, `range` (`from`, `to`, `view`), `previous` (the same number of days right before the range: `from`, `to`, `entries`), `markup`, `budget`, `today`, `rerender()` and `openSession(sessionId)`. The shell destroys the charts inside `mount` before each render.

The shell re-renders the active page on three events from [events.js](src/app/events.js): `clauditor:themechange`, `clauditor:langchange` and `clauditor:rerender`.

### Internationalisation

[src/i18n/index.js](src/i18n/index.js) offers `t(key, params)` (current language, then English, then the key), `tn(key, count, params)` for plurals, `setLang`, `getLang`, `getLocale` and `applyStaticTexts` (`data-i18n` and `data-i18n-attr` attributes in the static HTML). Dictionaries are one file per area in `src/i18n/messages/<area>.js` with `en` and `hu` blocks and keys prefixed with the area name. English is the default.

## 5. Build & distribution pipeline

```mermaid
flowchart TD
    subgraph sources["Sources"]
        idx["index.html<br/>(EJS includes)"]
        partials["src/html/partials/*.html"]
        js["src/main.js + modules"]
        css["src/styles/*.css<br/>(plain CSS: tokens, themes, components)"]
    end

    sources --> vite["vite build<br/>plugins: vite-plugin-html (EJS),<br/>vite-plugin-singlefile"]
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
| Period row shown or hidden (`open` or `closed`, default `open`) | localStorage | `clauditor_filters` |
| Dismissed banners (1-month expiry per item) | localStorage | `clauditor_dismissals` |
| Theme mode (`light`, `dark` or `auto`; legacy `winter` reads as `light`, `dracula` as `dark`) | localStorage | `clauditor_theme` |
| Light theme (winter, sand, mint, lavender, sea) | localStorage | `clauditor_theme_light` |
| Dark theme (dracula, midnight, forest, graphite, plum) | localStorage | `clauditor_theme_dark` |
| Language (`en` or `hu`, default `en`) | localStorage | `clauditor_lang` |
| Table page sizes (JSON map) | localStorage | `clauditor_table_rows` |
| Page width (`narrow`, `normal`, `wide`, `full`, default `normal`) | localStorage | `clauditor_width` |
| Thousands separator, decimal separator, decimal places | localStorage | `clauditor_thousands_sep`, `clauditor_decimal_sep`, `clauditor_money_decimals` |
| Date-from reset step | localStorage | `clauditor_datefrom_reset` |
| Open settings tab | sessionStorage | `clauditor_settings_tab` |
| Historical usage data | Archive folder on disk | `clauditor-archive-YYYY-MM.jsonl` |
