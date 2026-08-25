# Ranked Stats redesign — reskin `stats.html` to "3a — Ranked gold"

## TL;DR

> **Summary**: Reskin `rankedstats/stats.html` to the dark navy + gold mockup. Extract the inline
> `<style>` (lines 28-209) to `rankedstats/stats.css`. Replace 6 aggregate queries with **one**
> set-level query plus a client-side aggregation layer, unlocking mode/period/brawler-class
> filtering, sparklines and best/worst callouts without per-filter round trips.
>
> **Deliverables**:
> - `rankedstats/stats.css` — extracted + redesigned stylesheet
> - `rankedstats/brawler_classes.js` — static `brawler_id -> class` map (new data asset)
> - `rankedstats/gen_brawler_classes.py` — regenerator for the above
> - `rankedstats/migrations/007_redesign_views.sql` — 3 new views
> - `rankedstats/stats.html` — rebuilt chrome, filters, panels, modal, charts
>
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Task 1 -> 2 -> 5 -> 6 -> 8 -> 13

---

## Scope

**IN**
- `rankedstats/stats.html` (structure, CSS extraction, all new UI + JS)
- New files under `rankedstats/`: `stats.css`, `brawler_classes.js`, `gen_brawler_classes.py`,
  `migrations/007_redesign_views.sql`

**OUT — explicitly untouched**
- `rankedstats/newdesign/**` — reference only. **Never** import `support.js` or port its React
  runtime. Treat `.dc.html` as a picture.
- `rankedstats/migrations/001-006` — never edit an applied migration; 007 is additive only.
- Python ingestion (`ingest.py`, `sets.py`, `supa.py`, `roster.py`, `bs_api.py`) — no schema
  change requires an ingest change (see Task 3 note).
- `docs/**` (Jekyll site, `style.css`, `script.js`), `winratefetching/`, `tournamentfetching/`,
  `klubbleaderboardfetching/`, `.github/workflows/`, `.env`.
- No build step, no npm, no bundler, no framework, no charting library.

---

## Context

### Constraints that drive every decision
1. **`file://` must keep working.** No server, no build, no injected config. Stylesheet link must
   be relative (`href="stats.css"`, sibling file). Supabase URL + publishable key stay hardcoded.
2. **Read-only, views-only.** Only `sb.from('<view>')` + the `players` roster select. Never touch
   `ranked_sets` / `set_participants` / `battles` directly from the browser.
3. **Vanilla, plain globals.** Matches `docs/script.js` and current `stats.html`. No IIFE, no
   modules (`type="module"` breaks under `file://` due to CORS on module fetches).
4. **`createElement` + `textContent` only.** Never `innerHTML` with data. This is a deliberate
   XSS decision recorded in the notepad; the redesign must not regress it. SVG needs
   `createElementNS("http://www.w3.org/2000/svg", ...)`.

### Key decisions
- **CSS location**: `rankedstats/stats.css`, linked `<link rel="stylesheet" href="stats.css">`.
  Sibling of `stats.html`, so the relative path resolves identically under `file://` and any
  future server. Keep the `:root` custom-property approach already in `stats.html` (do **not**
  copy `docs/style.css`'s no-variables convention — that file is a separate, unrelated
  stylesheet and the dark palette has ~25 tokens).
- **One query, not six.** New `v_player_set_rows` returns one row per (player, set) with every
  dimension attached. All of: map / brawler / class / teammate aggregation, mode + period
  filtering, sparklines, best-worst callouts, form chips and KPIs are then computed in JS from a
  single fetch. Volume is trivial (fixtures: 126 sets total across 13 players).
- **Charts hand-rolled as inline SVG.** No library — the repo has zero charting deps and the
  mockup's own charts are hand-built SVG. Copy its geometry directly.
- **Brawler class = static local file** keyed by numeric `brawler_id`, not by name. Name keying
  breaks on the API's uppercase (`LARRY & LAWRIE`); `brawler_id` is already stored in
  `set_participants`. Falls back to an `Unclassified` bucket — required, not hypothetical:
  BrawlAPI itself reports `"Unknown"` for 19 released brawlers.
- **No elo.** The design's "rank score 9420 +320" has no backing data. Substitute the 1-22 rank
  tier: badge shows tier colour + 3-letter abbreviation + roman level, chart plots `rank_value`
  as a step line, delta is an integer tier change (`+2`), never a fabricated points number.
- **No seasons.** Ship `All time` / `Last 30 days` / `Last 7 days` from `ended_at`. Do not invent
  "Season 53".
- **Icons**: keep the mockup's grey `#233054` placeholder blocks in v1. Brawler portraits are a
  cheap follow-up (`cdn.brawlify.com/brawlers/borderless/{brawler_id}.png`) but add a network
  dependency and are deliberately deferred.
- **Language**: **Norwegian** (user decision, 2026-08-25) — matches the mockup's own labels and
  the public `docs/` wiki. Every user-facing string still routes through a single `LABELS` object
  at the top of the script (not hardcoded inline) so the decision remains a one-object edit if it
  ever needs to change.
- **Responsive**: mockup is a fixed 1320px canvas with no breakpoints. Add a single
  `@media (max-width: 900px)` block collapsing the sidebar above the main column, mirroring
  `docs/style.css`'s trailing-mobile-block convention.
- **Normalise the mockup's colour bug**: callouts use the light-mode pair `#2f9e6b`/`#cf4b52`
  while everything else uses `#5fd39a`/`#ff7d84`. Use the dark pair everywhere.

### Section-by-section mapping (current -> new)

| Current | New | Change |
|---|---|---|
| `h1` + `.subtitle` (213-214) | Hero | Replaced by rank badge + name + subline + form chips + rank chart behind, `overflow:hidden`, gold 3px bottom border |
| `.controls` (216-227) | `<aside>` sidebar | Player `<select>` restyled + kept; min-sets `<input type=number>` -> `<input type=range min=1 max=15>` + live value + "N rows hidden"; **new**: class tree, mode chips, period chips, clear-filter |
| `#overall-section` (232-237) | KPI card row in hero | 5 cards (Sets/Winrate/Wins/Losses/Draws), `repeat(3,132px)` wrapping 3+2. Rank badge moves out of the Winrate KPI into the hero badge |
| `#map-section` (240-245) | Collapsible panel + 2 callouts | Callout cards above; header click toggles; adds Trend sparkline col + winrate bar + `TYNT` badge; map name gets mode as sub-label |
| `#brawler-section` (248-253) | Collapsible panel | Same treatment; driven by the class-tree filter |
| `#teammate-section` (256-261) | Collapsible panel | Same; existing `Roster` badge (716-721) restyled gold, keeps `teammate_is_tracked` |
| `#recent-section` (264-270) | Collapsible panel, list not table | Grid rows with result-coloured left border + result badge + score |
| `#match-detail-content` (269) inline | Modal overlay | `loadMatchDetail` unchanged; `renderMatchDetail` retargets into a modal, gains ESC + backdrop-click + focus trap (mockup has none — we add them) |

### What survives untouched
`sortTableByColumn` (325), `makeSortableHeader` (354), `clearElement` (290), `setStatus` (296),
`formatWinrate` (304), `makeCell` (311), `formatDateTime` (739), the `data-sets` + `.filtered-out`
filter mechanism (370-390), and all 3-state loading/error/empty handling. The `sb` client name and
the hardcoded credential pair stay exactly as-is.

---

## Verification Strategy

- **Infrastructure exists**: NO. No test runner, no headless browser (notepad, Task 9: no
  `chromium`, no `puppeteer`; `npx` install is out of scope).
- **Approach**: **Manual verification via a real `file://` open with DevTools**, plus
  `node --check` on the extracted script body and grep-based invariant checks. This mirrors what
  the original build did.

Repo-wide invariants that must stay true after every task:
```bash
grep -c 'cdn.jsdelivr.net/npm/@supabase/supabase-js@2' rankedstats/stats.html   # 1
grep -ci 'sb_secret\|service_role' rankedstats/stats.html                       # 0
grep -c "from('ranked_sets'\|from('set_participants'\|from('battles'" rankedstats/stats.html  # 0
grep -rc 'dotenv' rankedstats/*.py                                              # 0 (every file)
grep -c 'innerHTML' rankedstats/stats.html                                      # 0
```
Note the `dotenv` / `service_role` greps are **directory-wide invariants** from the original
build — avoid those literals even inside comments. Same trap for any grep-counted substring.

---

## Execution Strategy

```
Wave 1 (Start Immediately) — workflow: NO (2 tasks, task 1 is a gate):
|- Task 1: CSS extraction, byte-identical render   [gate for everything visual]
|- Task 3: migration 007_redesign_views.sql        [independent, pure SQL]

Wave 2 (After 1 & 3) — workflow: YES (4 independent, fully-specified tasks):
|- Task 2: dark palette tokens in stats.css        [depends: 1]
|- Task 4: gen_brawler_classes.py + brawler_classes.js  [depends: none, but sequence after 3]
|- Task 5: data layer — single-query fetch + aggregation  [depends: 3]
|- Task 12: mode-name prettifier + tier helpers    [depends: none]

Wave 3 (After Wave 2) — workflow: YES (4 independent, fully-specified tasks):
|- Task 6: layout shell (hero + aside + main grid) [depends: 2, 5]
|- Task 7: KPI cards + form chips                  [depends: 2, 5]
|- Task 9: collapsible panel component             [depends: 2]
|- Task 11: best/worst callout cards               [depends: 2, 5]

Wave 4 (After Wave 3) — workflow: YES (4 tasks, isolation: worktree on 8 & 10):
|- Task 8: sidebar filters (chips, slider, filter bar)  [depends: 6, 5, 12]
|- Task 10: table rows — winrate bar, badges, sub-labels [depends: 9, 5]
|- Task 13: brawler class tree                     [depends: 8, 4]
|- Task 14: recent-matches list + modal            [depends: 9]

Wave 5 (After Wave 4) — workflow: NO (single task, needs everything settled):
|- Task 15: rank chart + row sparklines            [depends: 3, 5, 10]

Critical Path: 1 -> 2 -> 5 -> 6 -> 8 -> 13
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|---|---|---|---|
| 1 | None | 2 | 3 |
| 2 | 1 | 6,7,9,11 | 4,5,12 |
| 3 | None | 5,15 | 1 |
| 4 | None | 13 | 2,5,12 |
| 5 | 3 | 6,7,10,11 | 2,4,12 |
| 6 | 2,5 | 8 | 7,9,11 |
| 7 | 2,5 | None | 6,9,11 |
| 8 | 5,6,12 | 13 | 10,14 |
| 9 | 2 | 10,14 | 6,7,11 |
| 10 | 5,9 | 15 | 8,13,14 |
| 11 | 2,5 | None | 6,7,9 |
| 12 | None | 8 | 2,4,5 |
| 13 | 4,8 | None | 10,14 |
| 14 | 9 | None | 8,10,13 |
| 15 | 3,5,10 | None | None |

---

## TODOs

- [ ] 1. Extract inline `<style>` to `rankedstats/stats.css` (pure refactor, zero visual change)

  **What to do**:
  - Cut `stats.html:28-209` (everything strictly between `<style>` and `</style>`) into a new
    `rankedstats/stats.css`. Delete the now-empty `<style>`/`</style>` tags.
  - Insert `<link rel="stylesheet" href="stats.css">` in `<head>`, immediately **before** the
    Supabase `<script src>` at line 27.
  - Move nothing else. Do not rename a class, reorder a rule, or change a hex value.
  - Add a short header comment to `stats.css` noting it is loaded relatively so `file://` works,
    and that this file is not part of the Jekyll build.

  **Must NOT do**:
  - Do not add the dark palette here — that is Task 2. This task must be visually a no-op.
  - Do not use an absolute path, a leading `/`, or a `file://` URL in `href`.
  - Do not add a `<link>` to `docs/style.css`.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 (with Task 3) | Blocks: 2 | Blocked By: None

  **References**:
  - Source block: `rankedstats/stats.html:28-209`; `:root` vars at `:29-37`
  - Insert point: `rankedstats/stats.html:27` (the only existing `<head>` resource)
  - Header-comment tone precedent: `rankedstats/stats.html:6-26`
  - Naming convention (flat kebab-case): `docs/style.css:98,127,136,197`

  **Acceptance Criteria**:
  - [ ] `test -f rankedstats/stats.css` -> exit 0
  - [ ] `grep -c '<style>' rankedstats/stats.html` -> `0`
  - [ ] `grep -c 'rel="stylesheet" href="stats.css"' rankedstats/stats.html` -> `1`
  - [ ] `grep -c 'href="/\|href="file://\|docs/style.css' rankedstats/stats.html` -> `0`
  - [ ] Rule-count parity: `grep -c '{' rankedstats/stats.css` equals the count from the original
        block (capture before editing)
  - [ ] Open `file://.../rankedstats/stats.html` in a browser: renders **identically** to before
        (screenshot compare), Network tab shows `stats.css` loaded `200`/`(from disk)`, zero
        console errors

---

- [ ] 2. Dark "Ranked gold" palette + base typography in `stats.css`

  **What to do**:
  - Replace the 7 light-theme `:root` vars with the full dark token set (all values in the
    research context under "Design Spec"): bg/panel/border/text tiers, gold accent, win/loss/draw,
    result-chip bgs, thin + roster badge pairs, 8 tier colours, 4 header-strip tints, radius and
    spacing scale.
  - Add the Google Fonts `<link>` for `Barlow Condensed` (600,700) + `Inter Tight` (400-700) to
    `stats.html`, with a full system fallback stack so an offline `file://` open degrades cleanly
    rather than rendering in Times.
  - Restyle base elements to dark: `body`, `h1`/`h2`, `table`, `th`, `td`, `.status.*`,
    `.badge-tracked` (-> gold on `#070b14`), `.rank-badge`.
  - Add `@media (max-width: 900px)` as the **last** block: sidebar becomes full-width and stacks
    above main.

  **Must NOT do**:
  - Do not delete `.filtered-out` (`display:none`) — the min-sample filter depends on it.
  - Do not delete the `th[data-order]::after` ▴/▾ rules — `sortTableByColumn` sets that attribute.
  - Do not reuse the mockup's light-mode callout pair `#2f9e6b`/`#cf4b52`; use `#5fd39a`/`#ff7d84`.
  - Do not self-host font files.

  **Parallelization**: Can Run In Parallel: YES | Wave 2 (with 4, 5, 12) | Blocks: 6,7,9,11 | Blocked By: 1

  **References**:
  - Full token list + tier colours: `./notes/claude-specs/research/rankedstats-redesign-context.md`
    ("Design Spec" section)
  - Mockup source of truth: `rankedstats/newdesign/Ranked Stats.dc.html:18-51` (root/header/aside),
    `:230` (`TIERS`), `:243` (win/mid/loss), `:504-507` (header-strip tints)
  - Rules that must survive: `rankedstats/stats.html:135-141` (sort arrows), `:143-145`
    (`.filtered-out`)
  - Trailing-mobile-block convention: `docs/style.css` (final `@media (max-width:767px)` block)

  **Acceptance Criteria**:
  - [ ] `grep -c '\--' rankedstats/stats.css` >= `25`
  - [ ] `grep -c 'filtered-out' rankedstats/stats.css` -> `1`
  - [ ] `grep -c 'data-order' rankedstats/stats.css` -> `2`
  - [ ] `grep -c '2f9e6b\|cf4b52' rankedstats/stats.css` -> `0`
  - [ ] `grep -c 'fonts.googleapis.com' rankedstats/stats.html` -> `1`
  - [ ] `file://` open: page is dark navy, gold accents, existing tables still sort and still
        filter by min-sets; console clean

---

- [ ] 3. `rankedstats/migrations/007_redesign_views.sql` — 3 new views

  **What to do**:
  - `v_player_set_rows` — the workhorse. One row per (player, completed set):
    `player_tag, set_id, ended_at, started_at, mode, map, brawler_id, brawler_name, brawler_power,
    rank_value, rank_label, tier_name, tier_level, team_index, winning_team_index, games_played,
    team0_wins, team1_wins, result`. Join `set_participants` -> `ranked_sets` -> `rank_tiers`,
    `where rs.is_complete = true`. Reuse `v_player_recent`'s exact `result` CASE expression.
  - `v_player_teammate_rows` — one row per (player, set, teammate):
    `player_tag, set_id, ended_at, mode, map, brawler_id, teammate_tag, teammate_name,
    teammate_is_tracked, result`. Reuse `v_player_teammate`'s self-join (`sp2.set_id = sp1.set_id
    and sp2.team_index = sp1.team_index and sp2.player_tag <> sp1.player_tag`) but **without** the
    final `group by`, and keep the `left join players` for the display name.
  - `v_player_rank_history` — `player_tag, ended_at, rank_value, rank_label, tier_name,
    tier_level`, one row per completed set, no `distinct on`. This is what
    `v_player_current_rank` collapses away.
  - Every view: `create or replace view public.<name> with (security_invoker = true) as ...;`
    immediately followed by its own `grant select on public.<name> to anon, authenticated;`

  **Must NOT do**:
  - Do not edit `001`-`006`. Do not drop or redefine any existing view.
  - Do not add a `limit`, a `player_tag` filter, or an `order by` inside the views — callers
    filter via PostgREST.
  - Do not reference `battles` (raw-record-only rule).
  - Do not write the literal strings `security_invoker = true` or `is_complete = true` in prose
    comments — it inflates the grep counts below (this exact trap bit `003_views.sql`).

  **Parallelization**: Can Run In Parallel: YES | Wave 1 (with Task 1) | Blocks: 5,15 | Blocked By: None

  **References**:
  - `result` CASE to copy verbatim: `rankedstats/migrations/006_set_detail.sql:35-40`
  - Teammate self-join to copy: `rankedstats/migrations/003_views.sql:157-166`
  - View header/grant pattern: `rankedstats/migrations/003_views.sql:34-40`
  - Column ground truth: `rankedstats/migrations/001_init.sql:65-79` (`ranked_sets`), `:97-106`
    (`set_participants`), `:42-47` (`rank_tiers`)
  - Why `v_player_current_rank` is insufficient: `rankedstats/migrations/004_current_rank.sql:20-29`

  **Acceptance Criteria**:
  - [ ] `grep -c 'create or replace view' rankedstats/migrations/007_redesign_views.sql` -> `3`
  - [ ] `grep -c 'security_invoker' rankedstats/migrations/007_redesign_views.sql` -> `3`
  - [ ] `grep -c 'grant select' rankedstats/migrations/007_redesign_views.sql` -> `3`
  - [ ] `grep -ci 'from battles\|join battles' rankedstats/migrations/007_redesign_views.sql` -> `0`
  - [ ] Paste into the Supabase SQL Editor: runs clean, Advisors reports no
        `0010_security_definer_view` error
  - [ ] `curl "$SUPABASE_URL/rest/v1/v_player_set_rows?player_tag=eq.%23YQ29980&select=*&limit=3"`
        with the publishable key returns rows containing `result` and `ended_at`

---

- [ ] 4. `brawler_classes.js` + `gen_brawler_classes.py`

  **What to do**:
  - `gen_brawler_classes.py`: fetch `https://api.brawlapi.com/v1/brawlers`, emit
    `rankedstats/brawler_classes.js` as
    `const BRAWLER_CLASSES = { 16000000: "Damage Dealer", ... };` keyed by numeric id. Map upstream
    `"Unknown"` / missing to `"Unclassified"`. Stdlib + `requests` only, mirroring
    `bs_api.py`'s retry set `{429,502,503,504,520}` with `2 ** (attempt-1)` backoff.
  - Also emit `const BRAWLER_CLASS_ORDER = [...]` — the 7 classes in mockup order (Damage Dealer,
    Marksman, Assassin, Support, Controller, Artillery, Tank) with `"Unclassified"` last.
  - Add `<script src="brawler_classes.js"></script>` to `stats.html` before the inline script.
  - Header comment: generated file, regenerate with the script, do not hand-edit.

  **Must NOT do**:
  - Do not fetch classes at page load — it adds a CORS/offline failure mode to a `file://` page
    and does not fix completeness anyway (upstream lags releases by 19 brawlers today).
  - Do not key by brawler **name** — the battlelog API returns uppercase (`LARRY & LAWRIE`).
  - Do not use the literal string `dotenv` anywhere, including comments (directory-wide invariant).
  - Do not require an API key — BrawlAPI is keyless.

  **Parallelization**: Can Run In Parallel: YES | Wave 2 (with 2, 5, 12) | Blocks: 13 | Blocked By: None

  **References**:
  - Verified endpoint + JSON shape + `Access-Control-Allow-Origin: *`, and the 19 `"Unknown"`
    brawlers: `./notes/claude-specs/research/brawl-stars-brawler-class-mapping.md`
  - Retry/backoff pattern to mirror: `rankedstats/bs_api.py` (`fetch_battlelog`)
  - `brawler_id` is already stored: `rankedstats/migrations/001_init.sql:101`

  **Acceptance Criteria**:
  - [ ] `python3 rankedstats/gen_brawler_classes.py` exits 0 and writes the file
  - [ ] `grep -c 'BRAWLER_CLASSES' rankedstats/brawler_classes.js` >= `1`
  - [ ] `node --check rankedstats/brawler_classes.js` -> exit 0
  - [ ] `node -e 'eval(require("fs").readFileSync("rankedstats/brawler_classes.js","utf8"));
        console.log(Object.keys(BRAWLER_CLASSES).length)'` -> `>= 100`
  - [ ] `grep -rc 'dotenv' rankedstats/gen_brawler_classes.py` -> `0`
  - [ ] Every value is one of the 8 allowed strings (7 classes + `Unclassified`)

---

- [ ] 5. Data layer: single-query fetch + client-side aggregation

  **What to do**:
  - Introduce module-level state (the page currently has none):
    `let STATE = { tag:null, setRows:[], mateRows:[], rankHistory:[], filter:{ kind:null,
    value:null }, mode:"All modes", period:"All time", minSets:3, collapsed:{} };`
  - `loadPlayerData(tag)`: one `Promise.all` over `v_player_set_rows`, `v_player_teammate_rows`,
    `v_player_rank_history`, each `.eq("player_tag", tag)`. Replaces the 4 separate aggregate
    queries in `loadOverall`/`loadMapStats`/`loadBrawlerStats`/`loadTeammates`.
  - `applyFilters(rows)`: filter by `period` (`ended_at >= cutoff`), `mode`, and
    `filter.kind` (`"brawler"` -> `brawler_id` match; `"class"` -> `BRAWLER_CLASSES[brawler_id]`
    match). Teammate rows carry `brawler_id` and `mode` so the same predicate applies.
  - `aggregate(rows, keyFn, labelFn)`: returns `[{key,label,sub,sets,wins,losses,draws,winrate,
    rows}]`. Winrate **must** be `wins / (wins + losses)`, draws excluded — matching the SQL
    convention exactly. Guard divide-by-zero -> `null`, which `formatWinrate` already renders `—`.
  - `renderAll()`: single re-render entry point called by every filter change. No re-query.

  **Must NOT do**:
  - Do not keep `v_player_overall` / `v_player_map` / `v_player_brawler` / `v_player_teammate`
    queries — they cannot honour mode/period/brawler filters (no date column, pre-aggregated).
  - Do not compute winrate as `wins / sets` — that silently disagrees with every existing view.
  - Do not re-query on filter change; the whole point is one fetch per player.
  - Keep `v_player_current_rank` **only** if the hero needs a cheap current label; otherwise drop
    it in favour of the last element of `rankHistory`.

  **Parallelization**: Can Run In Parallel: YES | Wave 2 (with 2, 4, 12) | Blocks: 6,7,10,11 | Blocked By: 3

  **References**:
  - Queries being replaced: `rankedstats/stats.html:479-482, 553-557, 614-618, 674-678`
  - Winrate convention (`wins / nullif(wins+losses,0)`, `round(...,4)`):
    `rankedstats/migrations/003_views.sql:57-62`
  - Existing 3-state handling to preserve: `rankedstats/stats.html:296-302` (`setStatus`)
  - `formatWinrate` null-handling: `rankedstats/stats.html:304-309`

  **Acceptance Criteria**:
  - [ ] `grep -c "from(\"v_player_map\"\|from(\"v_player_brawler\"\|from(\"v_player_teammate\""
        rankedstats/stats.html` -> `0`
  - [ ] `grep -c 'v_player_set_rows' rankedstats/stats.html` -> `1`
  - [ ] DevTools Network on player change: exactly **3** PostgREST requests (plus the one-time
        `players` roster call); changing mode/period/min-sets/brawler triggers **0**
  - [ ] Aggregated Overall KPIs for a known player match the old `v_player_overall` numbers
        exactly with filters at `All modes` / `All time`

---

- [ ] 6. Layout shell — hero + `<aside>` + `<main>`

  **What to do**:
  - Restructure `<body>`: `<header class="hero">`, then `<div class="layout">` containing
    `<aside class="sidebar">` and `<main class="main">`. Move the 5 existing sections inside
    `<main>` unchanged for now.
  - CSS: hero gradient + `3px solid var(--gold)` bottom border + `overflow:hidden` +
    `position:relative`; `.layout{display:flex}`; `.sidebar{width:262px;flex:none;...}`;
    `.main{flex:1;padding:20px 26px;display:flex;flex-direction:column;gap:15px;min-width:0}`.
  - Set `position:relative` on the page root — the modal (Task 14) anchors to it.
  - Hero content row: rank badge (104x120, radius 16, bg = tier colour from `tier_name`), player
    name (44px Barlow uppercase), subline `{rank_label} · {tag}`.

  **Must NOT do**:
  - Do not drop `min-width:0` on `.main` — without it the flex child refuses to shrink and the
    tables overflow horizontally.
  - Do not fabricate an elo number or a `+320` delta in the subline. Tier delta only (Task 15),
    or omit until then.
  - Do not hardcode 1320px page width; the mockup canvas size is not a product constraint.

  **Parallelization**: Can Run In Parallel: YES | Wave 3 (with 7, 9, 11) | Blocks: 8 | Blocked By: 2,5

  **References**:
  - Hero/aside/main box model: `rankedstats/newdesign/Ranked Stats.dc.html:21-23,46-47,106`
  - Rank badge composition: `:24-28`
  - Tier colour map: `:230`; `tier_name` source column:
    `rankedstats/migrations/001_init.sql:45`
  - Elements being replaced: `rankedstats/stats.html:213-214`

  **Acceptance Criteria**:
  - [ ] `file://` open at 1440px: sidebar 262px fixed, main fills remainder, no horizontal scrollbar
  - [ ] At 800px wide the `@media (max-width:900px)` block stacks sidebar above main, still no
        horizontal scroll
  - [ ] Rank badge background changes colour across players of different tiers (verify with two
        players from different tiers)
  - [ ] Console clean

---

- [ ] 7. KPI cards + form chips

  **What to do**:
  - Replace `renderOverall` (`:504-543`) output with 5 KPI cards in a
    `grid-template-columns:repeat(3,132px);gap:10px` container, right-aligned in the hero
    (`margin-left:auto`): Sets played, Winrate, Wins, Losses, Draws. Card = label (9.5px uppercase
    muted) + value (30px Barlow, colour per card: default/tone/green/red/muted).
  - Form row: last 10 sets from `STATE.setRows` sorted `ended_at` desc then reversed, rendered as
    22x22 radius-6 chips with `W`/`L`/`D` and bg green/red/`#4d5876`.
  - Remove the rank badge from inside the Winrate KPI (`:526-531`) — it now lives in the hero.

  **Must NOT do**:
  - Do not leave the old `.overall-summary` markup in place.
  - Do not recompute winrate independently — call the shared `aggregate()` helper from Task 5.
  - Do not assume 10 sets exist; render however many are available (many roster players have few).

  **Parallelization**: Can Run In Parallel: YES | Wave 3 (with 6, 9, 11) | Blocks: None | Blocked By: 2,5

  **References**:
  - KPI card box + typography: `rankedstats/newdesign/Ranked Stats.dc.html:37-42`
  - Card colour assignment: `:483-487`
  - Form chips: `:32-35`, chip colours `:522`
  - Code being replaced: `rankedstats/stats.html:504-543`

  **Acceptance Criteria**:
  - [ ] 5 cards render, wrapping 3-then-2
  - [ ] `grep -c 'overall-summary' rankedstats/stats.html` -> `0`
  - [ ] KPI values equal the pre-redesign `v_player_overall` values for the same player
  - [ ] A player with <10 completed sets renders exactly that many form chips, no blanks, no error

---

- [ ] 8. Sidebar filters — mode chips, period chips, min-sets slider, filter bar

  **What to do**:
  - Mode chips: `["All modes", ...distinct modes present in STATE.setRows]` — derive from data,
    do **not** hardcode the mockup's 6. Prettify via Task 12's helper.
  - Period chips: `["All time","Last 30 days","Last 7 days"]` -> `ended_at` cutoff.
  - Replace `#min-sample-input` (`:224`) with `<input type="range" min="1" max="15">` +
    live 20px gold value + `"{n} rows hidden"` hint. Keep the element id or update
    `applyMinSampleFilter` (`:372`) to match — do not leave a dangling `getElementById`.
  - Active-filter bar in `<main>`: `border-left:4px solid var(--gold)`, gold filter label, muted
    `· {mode} · {period} · min {n} sets`, right-pinned clear button.
  - All chip clicks mutate `STATE` then call `renderAll()`.

  **Must NOT do**:
  - Do not hardcode the mockup's `MODE_MAPS`/`MODES`/`RANGES` — those are fabricated demo data.
  - Do not add a "Season 53" chip; no season data exists.
  - Do not re-query Supabase on any filter change.
  - Do not break `applyMinSampleFilter`'s `data-sets` contract.

  **Parallelization**: Can Run In Parallel: YES | Wave 4 (with 10, 13, 14) | isolation: worktree
  (shares `stats.html` with 10/13/14) | Blocks: 13 | Blocked By: 5,6,12

  **References**:
  - Chip styling + active/inactive states: `rankedstats/newdesign/Ranked Stats.dc.html:84-95,459-461`
  - Slider + hint: `:96-103`
  - Filter bar: `:106-112`
  - Control being replaced: `rankedstats/stats.html:222-226`; consumer to keep working: `:370-390`

  **Acceptance Criteria**:
  - [ ] Mode chip list matches `SELECT DISTINCT mode` for that player (verify against a
        `v_player_set_rows` curl)
  - [ ] Dragging the slider updates the value, the hidden-row count, and the visible rows with
        **0** network requests in DevTools
  - [ ] `grep -c 'input type="number"' rankedstats/stats.html` -> `0`
  - [ ] "Last 7 days" on a player with older sets reduces the row count; "All time" restores it
  - [ ] Clear button resets brawler/class filter and re-renders

---

- [ ] 9. Collapsible panel component

  **What to do**:
  - `makeCollapsiblePanel({id, title, tint, rightText, bodyEl})` returning a panel with a
    clickable header (gradient `linear-gradient(100deg,{tint},var(--panel) 70%)`, gold chevron,
    20px Barlow uppercase title, right-aligned muted count text).
  - Persist open/closed in `STATE.collapsed` keyed by panel id so re-renders don't reset it.
  - Chevron is a **glyph swap** `▾`/`▸`, matching the mockup. Optionally add a CSS transition —
    the mockup has none.
  - Header must be keyboard-accessible: `role="button"`, `tabindex="0"`, Enter/Space handler,
    `aria-expanded`.

  **Must NOT do**:
  - Do not destroy and rebuild table DOM on toggle if avoidable — sort state lives in the DOM
    (`data-order` on `<th>`), so prefer toggling body visibility.
  - Do not hardcode the tint; pass it per panel (map `#1d2b52`, brawler `#3c2f10`, mates
    `#16342c`, recent `#2a2140`).

  **Parallelization**: Can Run In Parallel: YES | Wave 3 (with 6, 7, 11) | Blocks: 10,14 | Blocked By: 2

  **References**:
  - Panel + header strip: `rankedstats/newdesign/Ranked Stats.dc.html:122-127`
  - Tints: `:504-507`; recent panel: `:156-157`
  - Sections being wrapped: `rankedstats/stats.html:240-270`
  - Sort state that must survive a toggle: `rankedstats/stats.html:346-351`

  **Acceptance Criteria**:
  - [ ] All 4 panels collapse/expand on header click
  - [ ] Sort a column, collapse, expand -> sort order and the `▴`/`▾` indicator are preserved
  - [ ] Tab to a header and press Enter -> toggles; `aria-expanded` flips
  - [ ] Changing a filter does not reset collapsed state

---

- [ ] 10. Table rows — winrate bar, sub-labels, ROSTER + THIN badges

  **What to do**:
  - Rewrite `renderMapTable`/`renderBrawlerTable`/`renderTeammateTable` to consume Task 5's
    aggregate output and emit: 32x32 placeholder block + label (17px Barlow uppercase) +
    optional sub-label (map rows show `mode`), `Sets` (18px), `W` (green), `L` (red), `Trend`
    (empty cell, filled by Task 15), `Winrate` (12px bar + 21px %, both in tone colour).
  - Tone helper: `>=0.60` green, `>=0.45` gold, else red. Shared across bars, %, sparklines and
    the class tree.
  - `ROSTER` badge: keep `teammate_is_tracked` logic (`:716-721`), restyle gold-on-dark.
  - `THIN` badge when `sets < minSets + 2`, with `title` tooltip.
  - Keep `data-sets` on every `<tr>` and keep calling `applyMinSampleFilter()` after render.
  - Keep `makeSortableHeader` for all columns **except** Trend.

  **Must NOT do**:
  - Do not let the winrate bar break `sortTableByColumn` — the sorter reads `cell.textContent`
    and strips `%`, so the percentage text must remain the cell's text content (bar as a sibling
    element, not a replacement).
  - Do not attach a sort handler to the Trend column.
  - Do not drop the `brawler_name || String(brawler_id)` fallback.

  **Parallelization**: Can Run In Parallel: YES | Wave 4 (with 8, 13, 14) | isolation: worktree |
  Blocks: 15 | Blocked By: 5,9

  **References**:
  - Row anatomy, badges, bar cell: `rankedstats/newdesign/Ranked Stats.dc.html:128-153`
  - Tone thresholds: `:247`; thin rule `:322`; ROSTER `:142`; TYNT `:144`
  - Functions being rewritten: `rankedstats/stats.html:573-604, 634-664, 694-733`
  - Sorter's text-parsing contract: `rankedstats/stats.html:334-339`
  - Fallback to preserve: `rankedstats/stats.html:653`

  **Acceptance Criteria**:
  - [ ] Click the Winrate header -> rows sort numerically by percentage (not lexically)
  - [ ] Rows with `sets < minSets+2` show the THIN badge; moving the slider updates which rows
        carry it
  - [ ] Tracked teammates still show ROSTER
  - [ ] `grep -c 'data-sets' rankedstats/stats.html` >= `3`
  - [ ] Bar fill width visually matches the printed percentage at 0%, ~50%, 100%

---

- [ ] 11. Best/worst map callout cards

  **What to do**:
  - From the filtered map aggregate, pick max and min by winrate among rows with
    `sets >= STATE.minSets` (never surface a 1-set 100% map as "best").
  - Two cards in a `1fr 1fr` grid above the map panel: 74x54 placeholder, tag label
    (`Best map`/`Worst map`, tone-coloured), map name (23px Barlow uppercase), `{mode} · {n} sets`
    subline, right-pinned 38px winrate.
  - Empty state: render the card with `—` and 0 rather than hiding it (mockup behaviour).

  **Must NOT do**:
  - Do not use the mockup's light-mode tones — use `#5fd39a` / `#ff7d84`.
  - Do not include rows below the min-sets threshold in the max/min selection.
  - Do not query anything — this is pure client-side derivation from existing data.

  **Parallelization**: Can Run In Parallel: YES | Wave 3 (with 6, 7, 9) | Blocks: None | Blocked By: 2,5

  **References**:
  - Callout card markup: `rankedstats/newdesign/Ranked Stats.dc.html:114-120`
  - Empty-state fallback: `:496-497`
  - Source data: `v_player_map` equivalent, now aggregated client-side (Task 5)

  **Acceptance Criteria**:
  - [ ] Best/worst match a manual scan of the map table at the same min-sets threshold
  - [ ] Raising min-sets can change which maps are shown
  - [ ] A player with zero qualifying maps renders `—` cards, no console error

---

- [ ] 12. Mode-name prettifier + rank-tier helpers

  **What to do**:
  - `prettyMode(mode)`: DB stores camelCase (`gemGrab`, `brawlBall`, `hotZone`). Convert to
    `Gem Grab` via a regex split on capitals + title-case, with an explicit override map for
    known oddities. Must degrade gracefully for an unknown future mode.
  - `tierColor(tier_name)`: the 8-entry map. `tierAbbrev(tier_name)`: first 3 letters uppercased
    (`Legendary` -> `LEG`). `tierRoman(tier_level)`: 1/2/3 -> I/II/III, `null` -> `""` (Pro).

  **Must NOT do**:
  - Do not hardcode a closed list of modes — new modes ship regularly; unknown input must pass
    through readably.
  - Do not derive the tier by string-parsing `rank_label`; use `tier_name` / `tier_level`, which
    Task 3's views expose as real columns.

  **Parallelization**: Can Run In Parallel: YES | Wave 2 (with 2, 4, 5) | Blocks: 8 | Blocked By: None

  **References**:
  - Raw mode values: `rankedstats/fetchresult/battlelog_9cjp2vyyp.json` (`"mode": "gemGrab"`)
  - Tier colours: `rankedstats/newdesign/Ranked Stats.dc.html:230`
  - Abbrev/roman logic: `:480`, badge render `:24-26`
  - Tier columns: `rankedstats/migrations/002_seed_rank_tiers.sql:49-70`

  **Acceptance Criteria**:
  - [ ] `prettyMode("gemGrab")` -> `"Gem Grab"`; `prettyMode("brawlBall")` -> `"Brawl Ball"`;
        `prettyMode("hotZone")` -> `"Hot Zone"`; `prettyMode("someNewMode2026")` returns something
        readable, never `undefined`
  - [ ] `tierAbbrev("Legendary")` -> `"LEG"`; `tierRoman(null)` -> `""`
  - [ ] All 8 tier names return a colour; unknown returns a safe default

---

- [ ] 13. Brawler class filter tree

  **What to do**:
  - Group the filtered brawler aggregate by `BRAWLER_CLASSES[brawler_id]`, ordered by
    `BRAWLER_CLASS_ORDER`. Render only classes that have data.
  - Each class row: chevron button (toggles expand, `STATE.expanded[class]`), class name,
    5px winrate mini-bar, tone-coloured %, `{n}s` count. Clicking the **name/bar area** (not the
    chevron) toggles a class filter; clicking the active class clears it.
  - Expanded children: brawler rows indented `padding-left:33px`, grid `1fr 34px 34px`, sorted by
    sets desc; click selects/deselects that single brawler.
  - Class and brawler selection are mutually exclusive (`STATE.filter.kind` is one of
    `null|"class"|"brawler"`).
  - Conditional `Clear ✕` link in the section header when a filter is active.

  **Must NOT do**:
  - Do not let the chevron click bubble into the filter click — `stopPropagation`.
  - Do not hide the `Unclassified` bucket; a newly released brawler will land there and the user
    needs to see it.
  - Do not filter the brawler tree by its own selection (that would leave one row); the tree is
    built from mode+period-filtered rows only.

  **Parallelization**: Can Run In Parallel: YES | Wave 4 (with 8, 10, 14) | isolation: worktree |
  Blocks: None | Blocked By: 4,8

  **References**:
  - Tree markup, indent, grids, active states:
    `rankedstats/newdesign/Ranked Stats.dc.html:55-81`
  - Active/inactive colour computation: `:428-430,443`; child sort `:451`; chevron `:435-436`
  - Clear link: `:56-59`
  - Class data: `rankedstats/brawler_classes.js` (Task 4)

  **Acceptance Criteria**:
  - [ ] 7 classes (+ Unclassified when present) render with correct per-class sets totals
        summing to the unfiltered brawler total
  - [ ] Chevron expands without changing the filter; name click changes the filter without
        collapsing
  - [ ] Selecting a class rescopes the map, teammate and recent panels (row counts drop) with 0
        network requests
  - [ ] Clicking the active class clears the filter and restores full row counts

---

- [ ] 14. Recent matches list + match-detail modal

  **What to do**:
  - Convert `renderRecentTable` (`:771-804`) from a table to a grid list:
    `96px 1fr 148px 148px 24px`, each row `border-left:4px solid {result colour}`, containing
    date, thumb + map + mode, brawler icon + name, result badge + `{t0}–{t1}` score, `›`.
  - Keep `loadMatchDetail` (`:806-826`) **as-is** — same `v_set_detail` query.
  - Retarget `renderMatchDetail` (`:828-926`) into a modal: backdrop
    `rgba(4,7,13,.78)`, box 860px, `border-top:3px solid var(--gold)`. Header (thumb, 25px map
    name, meta line, `✕`), score bar (`Team 0` / 44px gold `{t0}–{t1}` / `Team 1`), two roster
    panels (`1fr 1fr`; per player `1fr 100px`, right column `P{power}` / `{rank_label}`), rounds
    table (`52px 1fr 80px 1fr`).
  - **Add what the mockup lacks**: ESC to close, backdrop click to close, focus moved to the
    close button on open and restored to the originating row on close, `role="dialog"` +
    `aria-modal="true"`.
  - Delete the inline `#match-detail-content` container (`:269`).

  **Must NOT do**:
  - Do not change the `v_set_detail` query or the `data[0]` (no `.single()`) handling.
  - Do not assume `participants` has 6 entries or `games` has 3 — sets can be 1-3 games and the
    JSON arrays can be null.
  - Do not position the overlay `fixed` if the root is the positioning context; mockup uses
    `absolute; inset:0` against a `position:relative` root. `fixed` is acceptable and simpler —
    pick one and make the backdrop cover the full viewport either way.

  **Parallelization**: Can Run In Parallel: YES | Wave 4 (with 8, 10, 13) | isolation: worktree |
  Blocks: None | Blocked By: 9

  **References**:
  - Recent row grid: `rankedstats/newdesign/Ranked Stats.dc.html:163-169`; result colours `:535`
  - Modal: `:175-205`
  - Code being adapted: `rankedstats/stats.html:771-804` (list), `:828-926` (detail render)
  - Query to leave alone: `rankedstats/stats.html:810-813`
  - `v_set_detail` JSON shape: `rankedstats/migrations/006_set_detail.sql:59-109`

  **Acceptance Criteria**:
  - [ ] Clicking a match row opens the modal with correct rosters and per-round rows
  - [ ] ESC closes; backdrop click closes; `✕` closes; focus returns to the clicked row
  - [ ] A 1-game set renders one round row without error
  - [ ] `grep -c 'match-detail-content' rankedstats/stats.html` -> `0`
  - [ ] `grep -c 'v_set_detail' rankedstats/stats.html` -> `1`

---

- [ ] 15. Rank-tier chart + per-row trend sparklines

  **What to do**:
  - `renderRankChart(history)`: inline SVG `viewBox="0 0 640 170"`, 4 gridlines `#1d2740` with
    numeric y-labels at `x=0`, gold `polyline` `stroke-width:2.4`, filled area
    `rgba(255,210,61,.13)`, terminal `circle r=4`. Absolutely positioned in the hero,
    `height:190px; opacity:.45`. Y-axis is **rank tier 1-22**, labelled with tier labels, not
    invented elo points.
  - Rank delta in the hero subline: `rank_value` now minus `rank_value` at the start of the
    current period, rendered `+2` / `-1` / `±0` in gold. Integer tiers only.
  - `renderSparkline(rows)`: SVG `92x26`, flat reference line + polyline of a **rolling winrate
    over the row's own chronological sets** (bucket into up to 8 points; if fewer than 3 sets,
    render an empty cell rather than a misleading line), terminal `circle r=2.4`, colour = tone.
    Fill the Trend column left empty by Task 10.
  - Use `createElementNS("http://www.w3.org/2000/svg", ...)` throughout.

  **Must NOT do**:
  - Do not fabricate sparkline data with a seeded RNG as the mockup does (`:269`, `spark:` arrays
    are random). Real data or an empty cell.
  - Do not label the chart "Elo" or "rank score" — it is a rank tier.
  - Do not use `innerHTML` to inject SVG markup.
  - Do not add a charting library.

  **Parallelization**: Can Run In Parallel: NO | Wave 5 (sequential) | Blocks: None | Blocked By: 3,5,10

  **References**:
  - Chart SVG geometry: `rankedstats/newdesign/Ranked Stats.dc.html:352-367`
  - Sparkline SVG: `:344-350`
  - Hero chart placement: `:22`
  - Data source: `v_player_rank_history` (Task 3); per-row `rows` arrays from `aggregate()` (Task 5)
  - Tier range 1-22: `rankedstats/migrations/002_seed_rank_tiers.sql:49-70`

  **Acceptance Criteria**:
  - [ ] Chart renders for a player with >=2 completed sets; y-labels are tier labels within 1-22
  - [ ] A player with 1 set renders no chart (or a flat single point) and no console error
  - [ ] Sparklines appear only on rows with >=3 sets; others show an empty Trend cell
  - [ ] `grep -c 'createElementNS' rankedstats/stats.html` >= `1`
  - [ ] `grep -c 'innerHTML' rankedstats/stats.html` -> `0`

---

## New functions / data needed

> Everything the design requires that **does not exist today**. Scan this list before starting.

### A. Requires a new Supabase view (migration `007_redesign_views.sql`, Task 3)

- [ ] **`v_player_set_rows`** — set-level rows with mode/map/brawler/rank/result/`ended_at`.
      *Why*: `v_player_map`, `v_player_brawler`, `v_player_teammate` and `v_player_overall` are
      **pure aggregates with no date column** (`003_views.sql:34-187`), so mode filtering, period
      filtering, brawler/class filtering, sparklines and best/worst callouts are all impossible
      against them. This one view replaces four queries.
- [ ] **`v_player_teammate_rows`** — un-aggregated teammate pairs with `ended_at`, `mode`,
      `brawler_id`. *Why*: same reason; the teammate panel must respond to the brawler/class and
      period filters.
- [ ] **`v_player_rank_history`** — `(player_tag, ended_at, rank_value, rank_label, tier_name,
      tier_level)` per set. *Why*: `v_player_current_rank` uses `distinct on` and returns exactly
      one row (`004_current_rank.sql:20-29`). No time series exists today.

### B. Requires a new local data asset (Task 4)

- [ ] **Brawler -> class mapping.** **Does not exist anywhere in the repo or the schema.**
      `set_participants` has `brawler_id`/`brawler_name`/`brawler_power` only
      (`001_init.sql:101-103`); `sets.py canonical_teams` never fetches a class. The only class
      data in the repo is a **fabricated 14-brawler mock** in the design file
      (`Ranked Stats.dc.html:232-240`). Must be authored new from
      `https://api.brawlapi.com/v1/brawlers` (`class.name`, keyless, `ACAO: *`, verified live),
      keyed by numeric id, with an **`Unclassified` fallback** — 19 released brawlers currently
      return `"Unknown"` upstream. The official Supercell API never exposed class at all.

### C. New client-side computation (no new backend)

- [ ] **Client-side aggregation layer** (`aggregate`, `applyFilters`) — replaces four server-side
      aggregate views so filters cost zero round trips.
- [ ] **Best / worst map callouts** — **confirmed derivable client-side** from the map aggregate.
      Must exclude rows below the min-sets threshold.
- [ ] **"Thin data" badge** — **confirmed derivable client-side**, `sets < minSets + 2`
      (`Ranked Stats.dc.html:322`).
- [ ] **Per-row trend sparklines** — derivable **only** from `v_player_set_rows` (Section A), not
      from any existing view. Rolling winrate over the row's own chronological sets.
- [ ] **Form chips (last N W/L/D)** — derivable from `v_player_set_rows`; `v_player_recent` would
      also work but is capped at the caller's `limit`.
- [ ] **Rank delta** — computed as an integer tier difference over the selected period. There is
      **no** stored delta column anywhere.
- [ ] **`prettyMode()`** — DB stores camelCase (`gemGrab`); design shows `Gem Grab`. No mapping
      exists in the repo.
- [ ] **Tier colour / abbreviation / roman-numeral helpers** — `rank_tiers` has **no colour and no
      abbreviation column** (`001_init.sql:42-47`); colours come from the design file
      (`:230`) and must be hardcoded in CSS/JS.

### D. Design elements with NO backing data — substituted or dropped

- [ ] **Elo / "rank score" (`9420`) and its `+320` delta — DROPPED.** No elo, points or MMR value
      exists anywhere in the schema. `set_participants.rank_value` is a **1-22 tier ordinal**
      (FK to `rank_tiers`), explicitly documented as *not* a trophy count (`sets.py:61-63`).
      Substitute: tier badge + tier-ordinal chart + integer tier delta.
- [ ] **"Season 53" chip — DROPPED.** No season identifier exists; `ranked_sets.event_id` is a raw
      Brawl Stars event id, not a season. Substitute: `All time` / `Last 30 days` / `Last 7 days`
      from `ended_at`. *Optional follow-up*: a hand-seeded `seasons(season_number, starts_at,
      ends_at)` table in a future migration would restore real season chips.
- [ ] **Brawler portraits, map thumbnails, mode icons — DEFERRED.** No image assets and no icon
      CDN exist in the repo. Mockup itself uses grey `#233054` placeholder blocks; keep those.
      *Optional follow-up*: `cdn.brawlify.com/brawlers/borderless/{brawler_id}.png` — `brawler_id`
      is already stored, so this is a one-line change whenever the network dependency is acceptable.
- [ ] **Star player in the rounds table** — `battles.star_player_tag` exists and `v_set_detail`
      already returns it, but it is a **tag, not a name**. The mockup shows a name. Either display
      the tag or resolve it client-side against the already-fetched `participants` array (the star
      player is not guaranteed to be in it — handle the miss).

---

## Success Criteria

### Verification Commands
```bash
# Structure
test -f rankedstats/stats.css && test -f rankedstats/brawler_classes.js
grep -c '<style>' rankedstats/stats.html                    # 0
grep -c 'rel="stylesheet" href="stats.css"' rankedstats/stats.html   # 1

# Security / architecture invariants (directory-wide, pre-existing)
grep -ci 'sb_secret\|service_role' rankedstats/stats.html   # 0
grep -c 'innerHTML' rankedstats/stats.html                  # 0
grep -c "from('ranked_sets'\|from('set_participants'\|from('battles'" rankedstats/stats.html  # 0
grep -c 'cdn.jsdelivr.net/npm/@supabase/supabase-js@2' rankedstats/stats.html  # 1
grep -rc 'dotenv' rankedstats/*.py                          # 0 for every file

# Syntax
node --check rankedstats/brawler_classes.js                 # exit 0
# plus node --check on the extracted <script> body

# New views live
curl -s "$SUPABASE_URL/rest/v1/v_player_set_rows?player_tag=eq.%23YQ29980&select=*&limit=1" \
  -H "apikey: $PUBLISHABLE" | jq '.[0] | keys'              # includes result, ended_at, brawler_id
```

### Final Checklist
- [ ] `file://` open works with **no local server** — `stats.css` and `brawler_classes.js` both
      resolve, console clean
- [ ] Selecting a player issues exactly 3 PostgREST requests; every subsequent filter/sort/
      collapse/modal interaction issues **0** (except the one `v_set_detail` call per match click)
- [ ] Overall KPIs match the pre-redesign `v_player_overall` numbers exactly at `All modes` /
      `All time`
- [ ] Winrate everywhere uses `wins/(wins+losses)` — consistent with all existing views
- [ ] Sorting, min-sets filtering, and the ROSTER badge all still work
- [ ] Modal closes via ESC, backdrop and `✕`; focus is restored
- [ ] A player with very few sets (most of the roster) renders every panel without errors or
      misleading charts
- [ ] Nothing outside `rankedstats/` was modified:
      `git status --porcelain | grep -v '^?? rankedstats/\|^ M rankedstats/\|^?? notes/'` -> empty

---

## Open Questions

- **RESOLVED: UI language.** User confirmed 2026-08-25: **Norwegian**, matching the mockup's own
  labels (`Spiller`, `Brawler`, `Mode`, `Periode`, `Minimum sett`, `Lagkamerater`, `Siste sett`,
  `Nullstill`, `Vis alle brawlere`, `rader skjult`, `rader over grensen`, `TYNT`, `Runder`,
  `Lag 0`/`Lag 1`, `Klikk for settdetaljer`) and the public `docs/` wiki's language. All
  user-facing strings still route through a single `LABELS` object at the top of the script.
- **Season support.** Dropped for lack of data. Worth a follow-up migration adding a hand-seeded
  `seasons` table if season-scoped stats matter.
- **Brawler portraits.** Deferred to placeholders. `brawler_id` is stored, so enabling
  `cdn.brawlify.com` portraits later is trivial — but it adds a network dependency to a page whose
  whole point is `file://` simplicity.
- **`v_player_current_rank` retirement.** Once `v_player_rank_history` exists, the current-rank
  view is redundant (`history[history.length-1]`). Left in place; drop only if the user wants the
  cleanup.
- **Star player name vs tag** in the rounds table — see the last item of Section D.
