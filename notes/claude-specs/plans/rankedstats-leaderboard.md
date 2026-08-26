# Ranked Stats — "no player selected" leaderboard

## TL;DR

> **Summary**: Replace the static "Velg en spiller for å se statistikk." blank state (shown when
> `#player-select` has no value) with an all-tracked-players leaderboard: ranked by overall
> winrate (`wins/(wins+losses)`, draws excluded), paginated 10/page, re-scopable by the existing
> sidebar brawler/class tree, mode chips, and period chips. Achieved with **one new bulk query**
> (`v_player_set_rows` via `.in("player_tag", trackedTags)` — no new view, no migration) and
> near-total reuse of the existing client-side `aggregate()`/`applyFilters()` pipeline and row/cell
> DOM builders. `renderAll()` gains a mode branch keyed off `STATE.tag === null`; nothing about the
> existing per-player rendering path changes.
>
> **Deliverables**:
> - `docs/rankedstats/stats.html` — STATE extensions, one new bulk fetch, one new render function
>   (`renderLeaderboard`) + pagination, a `renderAll()` dispatch branch, tree/chip data-source
>   switch, `onPlayerSelected()` simplification
> - `docs/rankedstats/stats.css` — small additive pagination + disabled-button styling
> - **No new migration.** `v_player_set_rows` (`rankedstats/migrations/007_redesign_views.sql:39-71`)
>   already has no player filter and is grant-select to `anon`/`authenticated`; `001_init.sql:83-117`
>   confirms every underlying table's RLS policy is `using (true)`, so `.in("player_tag", [...])`
>   works today with the existing publishable key.
>
> **Parallel Execution**: YES — 2 waves + 1 sequential wiring task + 1 verification gate
> **Critical Path**: Task 1 -> Task 4 -> Task 6 -> Task 7

---

## Scope

**IN**
- `docs/rankedstats/stats.html` (STATE, data layer, render dispatch, new leaderboard render/paginate
  functions, tree/chip data-source switch, `onPlayerSelected`, init sequence, new LABELS keys, new
  static markup for `#leaderboard-section`)
- `docs/rankedstats/stats.css` (pagination + disabled-button styling only)

**OUT — explicitly untouched**
- `rankedstats/newdesign/**` — reference only, never imported.
- `rankedstats/migrations/001-007` — never edited. This plan's own research (below) concludes no
  new migration is needed; if that conclusion changes during implementation, stop and re-plan
  rather than silently adding one.
- Python ingestion (`ingest.py`, `sets.py`, `supa.py`, `roster.py`, `bs_api.py`, `gen_brawler_classes.py`).
- `docs/**` outside `docs/rankedstats/` (the Jekyll site, `docs/style.css`, `docs/script.js`).
- `docs/rankedstats/brawler_classes.js` — read-only data asset, already sufficient (`BRAWLER_CLASSES`,
  `BRAWLER_CLASS_ORDER` are both already loaded and already used by the tree; no change needed).
- `docs/rankedstats/images/**`.
- The existing per-player rendering path (`renderHero`, `renderKpiCards`, `renderFormChips`,
  `renderMapTable`, `renderBrawlerTable`, `renderTeammateTable`, `renderRecentTable`,
  `loadMatchDetail`/`renderMatchDetail`, the match-detail modal) — reused as data-source
  dependencies only, never modified.
- `sortTableByColumn`/`makeSortableHeader` — deliberately **not** wired to the leaderboard table
  (see Context: "Why no column sort on the leaderboard").
- The existing teammate "load more" pattern (`TEAMMATE_PAGE_SIZE`, `renderTeammateTable`'s
  `loadNextPage`/`updateLoadMoreVisibility`) — left byte-for-byte alone; the leaderboard gets its
  own separate, real prev/next pager (see Context).

---

## Context

### Current behaviour (verified against `docs/rankedstats/stats.html` at its current line numbers)

- `onPlayerSelected()` (`:1620-1635`): when `#player-select.value` is `""`, it manually calls
  `setStatus(container, "empty", LABELS.selectPlayerToViewStats)` on all 4 of `#map-content`
  (`:109-111` static), `#brawler-content` (`:117-119`), `#teammate-content` (`:125-127`),
  `#recent-content` (`:133-135`), then `return`s. **`renderAll()` is never called in this branch.**
- Because `renderAll()` (`:470-611`) is the *only* place that calls `renderBrawlerTree()` (`:1444`),
  `renderModeChips()` (`:1481`), and `renderPeriodChips()` (`:1507`), and it is only ever invoked
  from inside `loadPlayerData()` (`:332`, called only after a real player is fetched) — **the
  brawler-class tree and the mode/period chips are currently empty on initial page load**, not
  merely irrelevant. This is a pre-existing gap this plan closes as a side effect, and it is a hard
  requirement for the user's ask that these controls "work while in leaderboard mode."
- The hero (`#hero-player-name` etc., `:42-59`) starts as static markup ("Velg en spiller") and is
  never touched again once a player has been deselected — confirmed pre-existing bug, documented in
  `notes/claude-specs/notepads/rankedstats-redesign/learnings.md:532-534` ("deselecting the player
  does **not** reset `#hero-kpis`/`#hero-form` back to an empty/placeholder state"). This plan's
  `renderHeroEmptyState()` fixes it as a natural side effect of building the dispatch branch.
- `STATE` (`:315-330`) is single-player-scoped: `{ tag, setRows, mateRows, rankHistory, filter,
  mode, period, minSets, collapsed, expandedClasses }`. `loadPlayerData(tag)` does one
  `Promise.all` of 3 `.eq("player_tag", tag)` queries against `v_player_set_rows` /
  `v_player_teammate_rows` / `v_player_rank_history`, then calls `renderAll()`. Every subsequent
  filter/chip/tree click only mutates `STATE` and calls `renderAll()` again — **zero additional
  network requests after the initial 3**, a hard invariant carried over from the prior redesign
  plan's Success Criteria.
- `aggregate(rows, keyFn, labelFn)` (`:413-460`) groups by `keyFn`, sorts each group's rows
  chronologically, tallies wins/losses/draws, computes `winrate = wins/(wins+losses)` (draws
  excluded, `null` on divide-by-zero), and returns `{key, label, sets, wins, losses, draws,
  winrate, rows}` per group. **It has no knowledge of what it's grouping by** — brawler, map,
  teammate, or (new) player are all just different `keyFn`/`labelFn` pairs.
- `applyFilters(rows)` (`:382-411`) applies period cutoff, mode equality, and
  `STATE.filter.kind === "brawler"|"class"` against `row.brawler_id`/`BRAWLER_CLASSES[...]`. It
  never reads `row.player_tag` and has no player-scoping logic at all — it is exactly as valid
  against an all-players row set as against one player's rows.
- `filterByModeAndPeriod(rows)` (`:1255-1273`) is the deliberate small duplicate of the period+mode
  half of `applyFilters` that `buildBrawlerClassGroups()` (`:1275-1324`) uses to build the sidebar
  tree *without* collapsing it via the tree's own active filter. Same reasoning applies verbatim to
  a leaderboard-scoped tree.
- `renderModeChips()` (`:1481-1505`) derives its chip list from `STATE.setRows` (single player).
- The panel-wrapping pattern (`makeCollapsiblePanel`, `:1055-1124`) is applied **once, at init**
  (`:2534-2586`), wrapping the *existing* `#map-content`/`#brawler-content`/`#teammate-content`/
  `#recent-content` divs in place — `renderAll()`'s own `document.getElementById(...)` calls target
  the same divs one level deeper, unmodified. This plan adds a 5th panel the same way.
- Row-building helpers `buildRowIconCell(label, subLabel, isThin, extraBadgeEls, iconUrl)`
  (`:1744-1806`) and `buildWinrateCell(winrate)` (`:1808-1831`) are pure, reusable per-row cell
  builders with no player/brawler/map assumptions baked in — `buildWinrateCell` is exactly what a
  leaderboard row's winrate column needs, and `buildRowIconCell` already supports a `subLabel`
  (used today for a map row's mode) which the leaderboard reuses for a player's tag.
- `renderSparkline(rows)` (`:1843-1924`) takes any group's own chronological `rows` array (which
  `aggregate()` already attaches as `group.rows`) — reusable verbatim for a per-player trend column.
- A pagination precedent already exists: `TEAMMATE_PAGE_SIZE = 10` (`:2056`) +
  `renderTeammateTable`'s `loadNextPage`/`updateLoadMoreVisibility` (`:2125-2154`) + `.load-more-button`
  CSS (`stats.css:445-465`). It is **additive/cumulative** ("load more" grows the visible set), not
  real prev/next paging. The user explicitly asked for numbered "1-10" pagination, which implies
  going back to a fixed page — so this plan builds a real pager, reusing `.load-more-button`'s
  *visual* treatment for the buttons but not its cumulative-append logic. The teammate code path is
  left completely untouched.
- `v_player_set_rows` (`rankedstats/migrations/007_redesign_views.sql:39-71`) has no built-in player
  filter, `security_invoker = true`, and `grant select ... to anon, authenticated`. Its 3 base
  tables' RLS policies (`rankedstats/migrations/001_init.sql:83-117`, `ranked_sets_select` and
  `set_participants_select`) are both `using (true)` — fully open to `anon`. **This confirms
  `.in("player_tag", trackedTags)` needs no schema change and no elevated credential.**

### Key decisions (all 7 prompt open questions, resolved)

1. **Query strategy — reuse `v_player_set_rows` via `.in()`, no new view/migration.** Confirmed by
   the RLS read above. Volume is trivial (~126 sets total across 13 tracked players per the prior
   redesign's own research), so a single `.in()` fetch of every tracked player's rows is cheap and
   well within PostgREST's default row cap. A brand-new `v_leaderboard_rows` view would only be
   justified if the browser needed pre-aggregation or a player-count too large for one query — the
   redesign plan's own rationale for *avoiding* pre-aggregated views (no date column, can't
   mode/period/brawler filter) applies here just as strongly, so a pre-aggregated leaderboard view
   would actively work against the filtering requirement. **Decision: no migration.**

2. **STATE modeling — no new `STATE.view` flag; derive mode from `STATE.tag === null`.** `STATE.tag`
   is already the app's single source of truth for "is a player loaded" (it is set only inside
   `loadPlayerData`, cleared only inside `onPlayerSelected`'s empty branch). Introducing a parallel
   `STATE.view` flag would create two things that must always agree — the codebase has no precedent
   for redundant state and this plan should not add one. New STATE fields (additive, no existing
   fields renamed or removed):
   ```js
   allSetRows: [],               // bulk fetch across every tracked player, loaded once at init
   rosterByTag: new Map(),       // tag -> display name, for the leaderboard's aggregate() labelFn
   leaderboardPage: 1,           // 1-indexed current page
   leaderboardFilterSignature: null,  // internal bookkeeping, see Task 4
   leaderboardExcludedCount: 0,  // last-computed count of tracked players below STATE.minSets
   ```
   `renderAll()` (`:470`) keeps its existing unconditional top section (`renderBrawlerTree()`,
   `renderModeChips()`, `renderPeriodChips()`, `renderFilterBar()` — all 4 already work against
   either data source once Task 5 lands), then branches:
   ```js
   setMainSectionsVisible(STATE.tag === null);
   if (STATE.tag === null) {
     renderHeroEmptyState();
     renderLeaderboard();
     updateMinSetsHint();
     return;
   }
   // ...existing player-mode body, completely unchanged...
   ```
   This is the minimum-diff way to add a second render mode: wrap the existing body in an
   `else`-shaped early return, add one new `if` block above it. No existing player-mode line moves.

3. **Period chips — YES, apply to the leaderboard.** `applyFilters` already treats period
   uniformly and the sidebar's Period chips are always visible regardless of mode; special-casing
   the leaderboard to ignore them would require *more* code (a second predicate, or disabling the
   chips visually) than just reusing `applyFilters` unmodified. It also ships a real feature for
   free: "best winrate in the last 7 days" across the roster. Decision: reuse `applyFilters(STATE.allSetRows)`
   verbatim, no leaderboard-specific period logic.

4. **Min-sets slider reused as a leaderboard qualification gate.** The existing best/worst-map
   callouts (`renderCallouts`, `:1652`) already solve exactly this problem for maps: rows are
   filtered to `sets_played >= STATE.minSets` *before* max/min selection, so a 1-set 100% map can
   never win "Best map." The leaderboard reuses the identical instinct: player groups with
   `sets < STATE.minSets` (after mode/period/brawler-or-class filtering) are **excluded from the
   ranked list entirely** — not shown, not paginated, not just badge-flagged — mirroring the
   callout's "excluded from consideration entirely" behaviour rather than the tables' `THIN`-badge
   behaviour (a badge doesn't fix "who's #1", exclusion does). The excluded count is surfaced
   through the *existing* `#min-sample-hint` sidebar element (branched inside `updateMinSetsHint()`,
   `:1201`) and doubles as the empty-state message when every qualifying player has been filtered
   out by mode/brawler/class. No second slider, no new UI control.

5. **Pagination — fixed 10/page, prev/next, page resets on any filter change.**
   `LEADERBOARD_PAGE_SIZE = 10` (module constant, mirrors `TEAMMATE_PAGE_SIZE = 10` at `:2056`).
   `STATE.leaderboardPage` is 1-indexed. Prev/next buttons only (no numbered page list — robust to
   the tracked roster growing past a handful of pages, and the user only asked for "1-10 with
   pagination", not a page-jump UI). Buttons reuse the existing `.load-more-button` CSS class
   for visual consistency (same look as the teammate panel's own pagination control), with one new
   additive `:disabled` state (`stats.css`) since the teammate button never needed one. **Page reset
   is centralized, not scattered across every filter handler**: `renderLeaderboard()` computes a
   cheap filter signature (`STATE.mode + STATE.period + STATE.minSets + STATE.filter.kind + STATE.filter.value`)
   on every call; if it differs from `STATE.leaderboardFilterSignature`, `STATE.leaderboardPage` is
   reset to `1` and the signature is updated. This means **none** of the 5+ existing filter click
   handlers (mode chip, period chip, min-sets slider, brawler row, class row) need to be touched —
   they already just mutate `STATE` and call `renderAll()`, and the reset happens transparently
   inside the leaderboard's own render function. Prev/next clicks call `renderLeaderboard()`
   directly (not the full `renderAll()`) since nothing else needs to re-render on a page turn,
   keeping pagination itself a genuine 0-network, minimal-DOM-work interaction, and since they don't
   change the filter signature the page number is correctly preserved rather than being reset by
   its own click.

6. **Tie-break — winrate desc, then sets played desc.** Justification: more sample size is a
   reasonable, non-fabricated secondary signal, and the same "prefer decisive over thin" reasoning
   already underlies the `THIN` badge and the min-sets qualification gate itself. Groups with a
   `null` winrate (all draws, zero decisive sets) sort after every group with a real winrate,
   never fabricating a rank, and are still shown (with `formatWinrate(null)` -> `"—"` via the reused
   `buildWinrateCell`) rather than hidden — they already cleared the `sets >= minSets` qualification
   bar, so hiding them would be inconsistent with that gate's own purpose.

7. **Zero-sets / filtered-to-zero tracked players never crash or show `NaN%`.** `aggregate()`
   only emits a group for `player_tag` values actually present in the filtered row array
   (`:413-460`) — a tracked player with literally zero completed sets, or zero sets matching the
   active mode/brawler/class/period filter, simply never produces a group and is silently absent
   from the ranking, identical to how the existing map/brawler tables already handle a filter with
   zero matching rows for some brawler. The only place `formatWinrate(null)` -> `"—"` actually
   fires for the leaderboard is the all-draws case above (item 6), which is real, correct data, not
   an edge-case failure.

### Why no column sort on the leaderboard table

`sortTableByColumn` (`:1134-1161`) reorders the `<tr>` elements physically present in
`table.tBodies[0]`. Because the leaderboard's pagination only ever materializes the **current
page's 10 rows** in the DOM (true paging, not "load more" — see decision 5), wiring
`makeSortableHeader` to any column would silently re-sort only the 10 visible rows, producing a
wrong, page-local sort that looks correct but isn't (e.g. clicking "Sett" on page 2 would never
surface a page-1 player with more sets). The leaderboard is, by the user's own explicit spec,
**always** ranked winrate-desc/sets-desc — so this plan uses plain non-sortable `<th>` elements for
every leaderboard column (same idiom already used for the Trend column in the 3 existing tables),
and does not reuse `makeSortableHeader`/`sortTableByColumn` here at all.

### Panel tint reuse

The new leaderboard panel reuses `var(--tint-map)` rather than adding a 5th `--tint-*` token —
consistent with the "maximum reuse" instruction, and there is no strong visual-identity reason to
mint a new hue for a single additional panel that is never shown simultaneously with the other 4.

---

## Verification Strategy

- **Infrastructure exists**: NO — same as the original redesign. No test runner, no headless
  browser available in this environment.
- **Approach**: manual verification via a real `file://` open with DevTools (Network tab request
  count, console), plus `node --check` on the extracted `<script>` body and grep-based invariant
  checks — identical convention to every prior task in
  `notes/claude-specs/notepads/rankedstats-redesign/learnings.md` (e.g. `:90-95`, `:269-271`,
  `:1190-1194`).

Repo-wide invariants that must stay true after every task (unchanged from the original redesign,
still binding):
```bash
grep -c 'cdn.jsdelivr.net/npm/@supabase/supabase-js@2' docs/rankedstats/stats.html   # 1
grep -ci 'sb_secret\|service_role' docs/rankedstats/stats.html                       # 0
grep -c "from(\"ranked_sets\"\|from(\"set_participants\"\|from(\"battles\"" docs/rankedstats/stats.html  # 0
grep -c 'innerHTML' docs/rankedstats/stats.html                                      # 0
```

Feature-specific checks, run after every task that touches `stats.html`:
```bash
node --check <(sed -n '162,2591p' docs/rankedstats/stats.html)   # extracted <script> body, exit 0
# (line range will drift upward as tasks insert lines — recompute from the current <script>/</script>
# line numbers each time, same convention noted in every prior task's notepad entry)
```

---

## Execution Strategy

```
Wave 1 (Start Immediately) — workflow: YES (3 independent tasks, disjoint file regions):
|- Task 1: Data layer — STATE fields, loadLeaderboardData(), computeLeaderboardRows()
|- Task 2: HTML scaffolding + new LABELS keys
|- Task 3: CSS — pagination + disabled-button styling

Wave 2 (After 1, 2, 3) — workflow: YES (2 independent tasks):
|- Task 4: renderLeaderboard() + buildLeaderboardPagination() [depends: 1,2,3]
|- Task 5: Tree/chip data-source switch (currentTreeRows()) [depends: 1]

Wave 3 (After 4) — workflow: NO (single wiring task):
|- Task 6: renderAll() dispatch, onPlayerSelected() rewrite, renderHeroEmptyState(),
|          setMainSectionsVisible(), init-sequence rewiring [depends: 1,2,4]

Wave 4 (After everything) — workflow: NO (verification gate):
|- Task 7: Manual file:// + DevTools verification pass

Critical Path: 1 -> 4 -> 6 -> 7
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|---|---|---|---|
| 1 | None | 4,5,6 | 2,3 |
| 2 | None | 4,6 | 1,3 |
| 3 | None | 4 | 1,2 |
| 4 | 1,2,3 | 6 | 5 |
| 5 | 1 | None | 4 |
| 6 | 1,2,4 | 7 | None |
| 7 | 1,2,3,4,5,6 | None | None |

---

## TODOs

- [ ] 1. Data layer — STATE extensions, bulk fetch, leaderboard aggregation

  **What to do**:
  - Add 5 new fields to the `STATE` object literal (`docs/rankedstats/stats.html:315-330`):
    `allSetRows: []`, `rosterByTag: new Map()`, `leaderboardPage: 1`,
    `leaderboardFilterSignature: null`, `leaderboardExcludedCount: 0`. Add them as a clearly
    commented new block immediately after `expandedClasses`, matching that field's own comment
    style — do not touch or reorder any existing field.
  - Add `const LEADERBOARD_PAGE_SIZE = 10;` near `TEAMMATE_PAGE_SIZE` (`:2056`) or immediately
    above the new leaderboard section (Task 4 owns where the leaderboard section itself lives;
    this constant can be declared right there).
  - Modify `loadPlayers()` (`:1571-1618`) to `return` its resolved roster array in every code path
    that currently just `return`s bare: the error branch (`:1591` area) `return []`, the
    empty-roster branch (`:1602` area) `return []`, and the success path (after the `data.forEach`
    loop, `:1617`) `return data;`. This is a pure additive change — no existing line in the
    function's DOM-building logic is touched.
  - Add a new function `async function loadLeaderboardData(trackedPlayers)`:
    ```js
    async function loadLeaderboardData(trackedPlayers) {
      STATE.rosterByTag = new Map(
        trackedPlayers.map(function (p) { return [p.tag, p.name || p.tag]; })
      );

      const trackedTags = trackedPlayers.map(function (p) { return p.tag; });
      if (trackedTags.length === 0) {
        STATE.allSetRows = [];
        renderAll();
        return;
      }

      const { data, error } = await sb
        .from("v_player_set_rows")
        .select("*")
        .in("player_tag", trackedTags);

      if (error) {
        STATE.allSetRows = [];
        // renderLeaderboard() (Task 4) reads STATE.allSetRows; surface the error there via
        // setStatus on #leaderboard-content rather than here, to keep the error-rendering
        // convention in one place. Store the message on STATE for Task 4 to render... (see Task 4
        // for the exact contract — this task's job is only the fetch + guard, not the render.)
        STATE.leaderboardLoadError = error.message;
        renderAll();
        return;
      }

      STATE.allSetRows = data || [];
      STATE.leaderboardLoadError = null;
      renderAll();
    }
    ```
    Place it directly below `loadPlayers()`, before the `onPlayerSelected` section, so the two
    "load the roster" functions stay adjacent.
  - Add a new function `function computeLeaderboardRows()` returning
    `{ rankedRows, excludedCount }`, reusing `applyFilters` and `aggregate` **completely
    unmodified**:
    ```js
    function computeLeaderboardRows() {
      const filteredRows = applyFilters(STATE.allSetRows);
      const playerGroups = aggregate(
        filteredRows,
        function (row) { return row.player_tag; },
        function (row) { return STATE.rosterByTag.get(row.player_tag) || row.player_tag; }
      );

      const qualifyingRows = playerGroups.filter(function (group) {
        return group.sets >= STATE.minSets;
      });
      const excludedCount = playerGroups.length - qualifyingRows.length;

      qualifyingRows.sort(function (rowA, rowB) {
        const winrateA = rowA.winrate === null ? -1 : rowA.winrate;
        const winrateB = rowB.winrate === null ? -1 : rowB.winrate;
        if (winrateB !== winrateA) {
          return winrateB - winrateA;
        }
        return rowB.sets - rowA.sets;
      });

      return { rankedRows: qualifyingRows, excludedCount: excludedCount };
    }
    ```
    Place it directly below `computeLeaderboardRows`'s natural home — immediately after
    `applyFilters`/`aggregate` in the DATA LAYER section (before `renderAll()`, `:460`), since it is
    conceptually a data-layer function, not a render function (Task 4 owns the actual
    `renderLeaderboard()` render function that *calls* this one).

  **Must NOT do**:
  - Do not modify `applyFilters` or `aggregate` themselves — this task's entire point is that they
    need zero changes.
  - Do not issue the bulk fetch inside `loadPlayers()` — keep the two concerns (roster-for-`<select>`
    vs. bulk-rows-for-leaderboard) in separate functions; `loadPlayers()`'s only new responsibility
    is returning its already-fetched array.
  - Do not call `renderAll()` from inside `loadPlayers()` — only `loadLeaderboardData()` does, and
    only after both queries it depends on (implicitly, via being called *with* the roster) are done.
  - Do not add a `.limit()` or `.order()` to the new `.in()` query — match `v_player_set_rows`'s
    existing no-limit, no-order convention (`loadPlayerData`'s 3 queries, `:349-353`, do the same).

  **Parallelization**: Can Run In Parallel: YES | Wave 1 (with 2, 3) | Blocks: 4,5,6 | Blocked By: None

  **References**:
  - `STATE` object: `docs/rankedstats/stats.html:315-330`
  - `applyFilters`: `:382-411`; `aggregate`: `:413-460`
  - `loadPlayers`: `:1571-1618`
  - Existing 3-query `Promise.all` pattern to mirror for error/empty handling:
    `loadPlayerData`, `:332-380`
  - RLS confirmation for the new query: `rankedstats/migrations/001_init.sql:83-117`
    (`ranked_sets_select`/`set_participants_select`, both `using (true)`)
  - View definition: `rankedstats/migrations/007_redesign_views.sql:39-71`

  **Acceptance Criteria**:
  - [ ] `grep -c 'v_player_set_rows' docs/rankedstats/stats.html` -> `2` (existing `.eq()` call +
        new `.in()` call)
  - [ ] `grep -c 'allSetRows' docs/rankedstats/stats.html` >= `2`
  - [ ] `node --check` on the extracted `<script>` body -> exit 0
  - [ ] Standalone `node` trace of `computeLeaderboardRows`'s sort against a fixture of 4 players
        with winrates `[0.7, 0.7, 0.5, null]` and sets `[10, 15, 8, 3]` (`minSets=3`) yields order
        `[player2(0.7/15), player1(0.7/10), player3(0.5/8), player4(null/3)]`, `excludedCount` counts
        only groups actually filtered by `minSets`
  - [ ] `curl "$SUPABASE_URL/rest/v1/v_player_set_rows?select=player_tag&player_tag=in.(%23TAG1,%23TAG2)&limit=5"`
        with the publishable key returns rows (confirms `.in()` is reachable under RLS)

---

- [ ] 2. HTML scaffolding + new LABELS keys

  **What to do**:
  - Insert a new static section in `<main>` (`docs/rankedstats/stats.html`), immediately after
    `<div class="filter-bar" id="filter-bar"></div>` (`:101`) and before
    `<div class="callouts" id="map-callouts"></div>` (`:104`):
    ```html
    <!-- ===================== SECTION: LEADERBOARD (no player selected) ===================== -->
    <section class="stats-section" id="leaderboard-section" style="display: none;">
      <div id="leaderboard-content">
        <p class="status loading">Laster...</p>
      </div>
    </section>
    ```
    `style="display: none;"` mirrors the existing inline-style precedent at `#player-list-status`
    (`:94`) — this section starts hidden because a player is selected by default only after the
    user picks one; Task 6 flips visibility via `setMainSectionsVisible`.
  - Add a new commented block of LABELS keys (`docs/rankedstats/stats.html`, inside the `LABELS`
    object, `:195-304`) immediately after the existing "recent matches / modal" block (after
    `resultDraw`, `:303`):
    ```js
    // --- leaderboard (no player selected) ---
    leaderboardSectionTitle: "Ledertavle",
    leaderboardRankColumn: "#",
    leaderboardPrevPage: "‹ Forrige",
    leaderboardNextPage: "Neste ›",
    leaderboardPageLabel: "Side",
    leaderboardPageOfLabel: "av",
    leaderboardExcludedSuffix: "spillere ekskludert (under minimum sett)",
    ```
    Reuse existing keys for everything else the leaderboard needs: `LABELS.playerLabel` ("Spiller",
    for the player-name column header), `LABELS.tableSets`/`tableWins`/`tableLosses`/`tableDraws`/
    `tableTrend`/`tableWinrate`, `LABELS.loading`, `LABELS.errorPrefix`, `LABELS.noSetsRecorded`,
    `LABELS.selectPlayer`. Do not duplicate any of these under a new leaderboard-prefixed key.

  **Must NOT do**:
  - Do not add the leaderboard section anywhere other than directly after `#filter-bar` — it must
    sit before the 4 player-specific sections so `setMainSectionsVisible` (Task 6) can find a
    predictable DOM order, and Task 6's acceptance criteria checks this ordering.
  - Do not wrap `#leaderboard-content` in a panel here — panel-wrapping happens once, at init,
    exactly like the other 4 sections (Task 6 owns adding the `makeCollapsiblePanel` call).
  - Do not introduce a new label for anything already covered by an existing key (see reuse list
    above) — this file's own header comment (`:176-193`) explicitly asks future tasks to add *new*
    keys only for genuinely new strings.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 (with 1, 3) | Blocks: 4,6 | Blocked By: None

  **References**:
  - Insertion point: `docs/rankedstats/stats.html:101-104`
  - `style="display: none;"` precedent: `:94`
  - LABELS object + its own "add new keys here" convention: `:176-304`
  - The 4 sibling sections' exact markup shape to mirror: `:107-136`

  **Acceptance Criteria**:
  - [ ] `grep -c 'id="leaderboard-section"' docs/rankedstats/stats.html` -> `1`
  - [ ] `grep -c 'id="leaderboard-content"' docs/rankedstats/stats.html` -> `1`
  - [ ] `grep -c 'leaderboardSectionTitle\|leaderboardExcludedSuffix' docs/rankedstats/stats.html` -> `2`
  - [ ] `node --check` on the extracted `<script>` body -> exit 0 (LABELS object is still valid JS)
  - [ ] `file://` open: page renders identically to before (leaderboard section invisible, no
        layout shift), console clean

---

- [ ] 3. CSS — pagination + disabled-button styling

  **What to do**:
  - Add a `.leaderboard-pagination` block near `.load-more-button` (`docs/rankedstats/stats.css:445-465`):
    a flex row (`display:flex; align-items:center; justify-content:space-between; gap: var(--space-md);
    margin-top: var(--space-md);`) containing 2 buttons + a page-info span.
  - Add `.leaderboard-page-info` (muted, uppercase, small text matching the sidebar's own
    `.control-group-title`/`.min-sets-hint` scale — reuse `--text-muted-2`, ~11.5px, matching
    `.load-more-button`'s own font-size for visual consistency).
  - Add one new additive rule: `.load-more-button:disabled { opacity: 0.4; cursor: default;
    pointer-events: none; }` immediately after the existing `.load-more-button:hover` rule
    (`:461-465`). This never fires for the existing teammate button (it is never `disabled`) — pure
    addition, zero visual change to anything already shipped.
  - The 2 pagination buttons reuse the `class="load-more-button"` on each `<button>` element
    directly (no new button-specific CSS needed beyond making them fit inside the flex row —
    override `width: auto;` for buttons inside `.leaderboard-pagination` specifically, e.g.
    `.leaderboard-pagination .load-more-button { width: auto; flex: 0 0 auto; margin-top: 0; }`).

  **Must NOT do**:
  - Do not modify `.load-more-button`'s base rule (`:445-459`) beyond the new `:disabled` addition —
    the teammate panel's existing button must render pixel-identical to before.
  - Do not invent a 5th `--tint-*` token — the leaderboard panel (Task 6) reuses `var(--tint-map)`.
  - Do not add a media query — the leaderboard's pagination row is a simple flex row that already
    fits inside the existing `@media (max-width: 900px)` sidebar-stacking behaviour with no new rule.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 (with 1, 2) | Blocks: 4 | Blocked By: None

  **References**:
  - `.load-more-button` block to extend: `docs/rankedstats/stats.css:440-465`
  - Muted-text scale precedent: `.min-sets-hint`/`.control-group-title` (grep for these classes'
    declarations in `stats.css` for the exact font-size/color tokens already in use)
  - Spacing scale tokens: `:77-84` (`--space-*`)

  **Acceptance Criteria**:
  - [ ] `grep -c '.leaderboard-pagination' docs/rankedstats/stats.css` >= `1`
  - [ ] `grep -c 'load-more-button:disabled' docs/rankedstats/stats.css` -> `1`
  - [ ] CSS brace balance: count of `{` equals count of `}` in `stats.css`
  - [ ] `grep -c '--tint-' docs/rankedstats/stats.css` unchanged from before this task (still 4, not 5)
  - [ ] Visual check once Task 4/6 land: 2 buttons + page-info text sit in one row, disabled button
        state visibly dimmed and unclickable

---

- [ ] 4. `renderLeaderboard()` + `buildLeaderboardPagination()`

  **What to do**:
  - Add a new commented section "=== LEADERBOARD (no player selected) ===" in
    `docs/rankedstats/stats.html`, placed after the PLAYER PICKER section (after `onPlayerSelected`
    and its `addEventListener` call, roughly `:1637-1638`) and before BEST/WORST MAP CALLOUT CARDS
    (`:1640`) — this narrative position matches the file's existing top-to-bottom order
    (player picker -> [new] leaderboard fallback -> per-player sections).
  - Implement `function renderLeaderboard()`:
    - Compute the filter signature and reset `STATE.leaderboardPage` to `1` if it changed since the
      last call (see Context, decision 5, for the exact signature string).
    - Call `computeLeaderboardRows()` (Task 1); store `STATE.leaderboardExcludedCount = excludedCount`.
    - If `STATE.leaderboardLoadError` is set (Task 1's error path), `setStatus(container, "error",
      LABELS.errorPrefix + STATE.leaderboardLoadError)` and return.
    - If `rankedRows.length === 0`: `setStatus(container, "empty", excludedCount > 0 ?
      (excludedCount + " " + LABELS.leaderboardExcludedSuffix) : LABELS.noSetsRecorded)` and return.
    - Otherwise: clamp `STATE.leaderboardPage` to `[1, totalPages]`, build a `<table>` with a plain
      (non-sortable) `<thead>` — columns `LABELS.leaderboardRankColumn`, `LABELS.playerLabel`,
      `LABELS.tableSets`, `LABELS.tableWins`, `LABELS.tableLosses`, `LABELS.tableDraws`,
      `LABELS.tableTrend`, `LABELS.tableWinrate` — and one `<tr>` per row in the current page slice,
      built from: `makeCell(rank)`, `buildRowIconCell(group.label, group.rows[0].player_tag, false,
      null, null)`, `makeCell(sets)`, `makeCell(wins)`, `makeCell(losses)`, `makeCell(draws)`, a
      Trend `<td>` filled by `renderSparkline(group.rows)` when non-null, `buildWinrateCell(group.winrate)`.
    - Append `buildLeaderboardPagination(rankedRows.length, totalPages)` after the table.
  - Implement `function buildLeaderboardPagination(totalRows, totalPages)`: returns a
    `<div class="leaderboard-pagination">` containing a "prev" `<button class="load-more-button">`
    (`LABELS.leaderboardPrevPage`, `disabled` when `STATE.leaderboardPage === 1`), a
    `<span class="leaderboard-page-info">` (`LABELS.leaderboardPageLabel + " " + STATE.leaderboardPage +
    " " + LABELS.leaderboardPageOfLabel + " " + totalPages`), and a "next" `<button>`
    (`LABELS.leaderboardNextPage`, `disabled` when `STATE.leaderboardPage === totalPages`). Each
    button's click handler mutates `STATE.leaderboardPage` (`- 1` / `+ 1`, clamped) and calls
    `renderLeaderboard()` directly — **not** `renderAll()`.
  - Update `updateMinSetsHint()` (`:1201-1215`) to branch: if `STATE.tag === null`, set
    `hintEl.textContent = STATE.leaderboardExcludedCount + " " + LABELS.leaderboardExcludedSuffix`
    and `return` before the existing 3-table DOM-query logic; otherwise fall through unchanged.

  **Must NOT do**:
  - Do not reuse `makeSortableHeader`/`sortTableByColumn` for any leaderboard column (see Context:
    "Why no column sort on the leaderboard").
  - Do not call `renderAll()` from inside the pagination buttons' click handlers — only
    `renderLeaderboard()`, to keep page turns cheap and to avoid spuriously re-triggering the
    filter-signature reset logic on the leaderboard's own pagination clicks.
  - Do not touch `TEAMMATE_PAGE_SIZE`, `renderTeammateTable`, or any of its helper functions.
  - Do not fabricate a Trend sparkline for a group with fewer real sets than `renderSparkline`
    already requires — pass `group.rows` through unmodified and let `renderSparkline`'s own
    `< 3 sets -> null` guard (`:1843` area) do the work, exactly as the 3 existing tables do.

  **Parallelization**: Can Run In Parallel: YES | Wave 2 (with 5) | Blocks: 6 | Blocked By: 1,2,3

  **References**:
  - `computeLeaderboardRows`: Task 1
  - `buildRowIconCell`/`buildWinrateCell`: `docs/rankedstats/stats.html:1744-1831`
  - `renderSparkline`: `:1843-1924`
  - `makeCell`/`setStatus`/`clearElement`/`formatWinrate`: `:925-950`
  - `updateMinSetsHint` to branch: `:1201-1215`
  - Insertion point: after `:1637-1638`, before `:1640`
  - `.leaderboard-pagination`/`.load-more-button:disabled` CSS: Task 3

  **Acceptance Criteria**:
  - [ ] With a fixture of 25 qualifying players, page 1 shows exactly rows 1-10 ranked
        winrate-desc/sets-desc, "Side 1 av 3", prev disabled, next enabled
  - [ ] Clicking next twice reaches "Side 3 av 3" showing rows 21-25 (5 rows), next disabled
  - [ ] Changing the mode chip while on page 2 returns to page 1 (filter-signature reset fires);
        clicking next/prev itself never resets the page
  - [ ] A fixture where every player falls below `minSets` renders the empty state with the
        `leaderboardExcludedSuffix` count, not the generic `noSetsRecorded` message
  - [ ] `#min-sample-hint` shows "N spillere ekskludert (under minimum sett)" while `STATE.tag === null`
  - [ ] `node --check` on the extracted `<script>` body -> exit 0; `grep -c 'innerHTML'` -> `0`

---

- [ ] 5. Tree/chip data-source switch

  **What to do**:
  - Add a small helper near `buildBrawlerClassGroups()` (`docs/rankedstats/stats.html:1255-1274`,
    immediately after `filterByModeAndPeriod`):
    ```js
    function currentTreeRows() {
      return STATE.tag === null ? STATE.allSetRows : STATE.setRows;
    }
    ```
  - In `buildBrawlerClassGroups()` (`:1275-1324`), change the single line
    `filterByModeAndPeriod(STATE.setRows)` to `filterByModeAndPeriod(currentTreeRows())`. No other
    line in this function changes.
  - In `renderModeChips()` (`:1481-1505`), change `STATE.setRows.forEach(...)` to
    `currentTreeRows().forEach(...)`. No other line in this function changes.

  **Must NOT do**:
  - Do not touch `buildBrawlerRow`/`buildClassRow`/`renderPeriodChips`/`renderFilterBar` — none of
    them read `STATE.setRows` directly, so none of them need this switch (confirmed by re-reading
    each function's body before starting this task).
  - Do not change `filterByModeAndPeriod` itself — it is already data-source-agnostic; only its
    caller's argument changes.
  - Do not introduce a second copy of `buildBrawlerClassGroups`/`renderModeChips` for "leaderboard
    mode" — the whole point of `currentTreeRows()` is a single one-line branch point instead of
    parallel implementations.

  **Parallelization**: Can Run In Parallel: YES | Wave 2 (with 4) | Blocks: None | Blocked By: 1

  **References**:
  - `buildBrawlerClassGroups`: `docs/rankedstats/stats.html:1275-1324`
  - `renderModeChips`: `:1481-1505`
  - `filterByModeAndPeriod`: `:1255-1273`
  - `STATE.allSetRows`: Task 1

  **Acceptance Criteria**:
  - [ ] With `STATE.tag === null` and `STATE.allSetRows` populated across 3 players/5 brawlers, the
        sidebar tree shows all 5 brawlers grouped into their classes with sets summed across all 3
        players (not just one)
  - [ ] Selecting a class/brawler in this state sets `STATE.filter` exactly as it does in
        player-mode (unchanged handler code, confirmed by inspection — this task adds no new
        click handler)
  - [ ] Mode chip list reflects the union of modes across all tracked players' rows when
        `STATE.tag === null`
  - [ ] With a real player selected (`STATE.tag !== null`), tree/chip behaviour is byte-identical
        to before this task (confirmed via `git diff` showing only the 2 one-line changes plus the
        new helper function)
  - [ ] `node --check` on the extracted `<script>` body -> exit 0

---

- [ ] 6. `renderAll()` dispatch, `onPlayerSelected()` rewrite, init sequencing

  **What to do**:
  - Add `function renderHeroEmptyState()`: resets `#hero-player-name` to `LABELS.selectPlayer`,
    clears `#hero-subline` (`clearElement`), clears `#hero-rank-icon`'s `src`/`alt` and
    `#hero-rank-roman`'s text, `clearElement(document.getElementById("hero-rank-chart"))`,
    `clearElement(document.getElementById("hero-kpis"))`, `clearElement(document.getElementById("hero-form"))`.
    This is the fix for the pre-existing stale-hero bug (see Context).
  - Add `function setMainSectionsVisible(showLeaderboard)`:
    ```js
    function setMainSectionsVisible(showLeaderboard) {
      document.getElementById("leaderboard-section").style.display = showLeaderboard ? "" : "none";
      ["map-callouts", "map-section", "brawler-section", "teammate-section", "recent-section"].forEach(
        function (id) {
          document.getElementById(id).style.display = showLeaderboard ? "none" : "";
        }
      );
      if (showLeaderboard) {
        clearElement(document.getElementById("map-callouts"));
      }
    }
    ```
  - In `renderAll()` (`:470-611`), insert immediately after the existing unconditional
    `renderFilterBar();` call (`:475`) and before the existing `const filteredSetRows = applyFilters(STATE.setRows);`
    line (`:477`):
    ```js
    setMainSectionsVisible(STATE.tag === null);
    if (STATE.tag === null) {
      renderHeroEmptyState();
      renderLeaderboard();
      updateMinSetsHint();
      return;
    }
    ```
    Every existing line from `:477` onward stays exactly as-is, now implicitly the `else` branch.
  - Rewrite `onPlayerSelected()`'s empty-tag branch (`:1620-1635`):
    ```js
    function onPlayerSelected() {
      const select = document.getElementById("player-select");
      const tag = select.value;

      clearElement(document.getElementById("match-detail-content"));

      if (!tag) {
        STATE.tag = null;
        STATE.setRows = [];
        STATE.mateRows = [];
        STATE.rankHistory = [];
        renderAll();
        return;
      }

      loadPlayerData(tag);
    }
    ```
    `STATE.mode`/`STATE.period`/`STATE.filter`/`STATE.minSets` are deliberately **not** reset here —
    they carry over into the leaderboard, matching the user's "reuse most of the information"
    framing (a brawler/mode filter set while browsing a player stays active when you deselect back
    to the leaderboard).
  - At init (`:2530-2588`): add a 5th `makeCollapsiblePanel` call, wrapping `#leaderboard-content`
    the same way the other 4 are wrapped (`tint: "var(--tint-map)"`, `rightText: ""` — same
    `rightText: ""` precedent as `recent-panel`, `:2576-2582`, since exclusion is already
    communicated via the sidebar hint, not a per-panel count). Change the final
    `loadPlayers();` call to:
    ```js
    loadPlayers().then(function (trackedPlayers) {
      loadLeaderboardData(trackedPlayers);
    });
    ```

  **Must NOT do**:
  - Do not reorder or modify any line of `renderAll()`'s existing player-mode body — only insert
    the new branch above it.
  - Do not reset `STATE.mode`/`STATE.period`/`STATE.filter`/`STATE.minSets` in `onPlayerSelected`'s
    empty-tag branch.
  - Do not call `loadLeaderboardData` before `loadPlayers` resolves — it needs the roster
    (tags + names) as its argument.
  - Do not leave the old 4-line manual `setStatus(...)` block in `onPlayerSelected` — it is fully
    superseded by `renderAll()`'s new branch and must be removed, not left dead alongside the new code.

  **Parallelization**: Can Run In Parallel: NO | Wave 3 (sequential) | Blocks: 7 | Blocked By: 1,2,4

  **References**:
  - `renderAll`: `docs/rankedstats/stats.html:470-611`
  - `onPlayerSelected`: `:1620-1635`
  - Init panel-wrapping block: `:2530-2586`
  - Stale-hero bug being fixed: `notes/claude-specs/notepads/rankedstats-redesign/learnings.md:532-534`
  - `renderLeaderboard`: Task 4

  **Acceptance Criteria**:
  - [ ] `file://` open with no player selected: leaderboard renders immediately (no interaction
        required), hero shows "Velg en spiller" with empty KPIs/form/chart, sidebar tree + mode/period
        chips are populated (not empty) — this is the fix for the pre-existing empty-chips bug
  - [ ] Selecting a player: leaderboard section hides, all 4 original panels + callouts show, hero
        populates normally — byte-identical behaviour to before this task
  - [ ] Deselecting a player after having viewed one: hero resets fully (name, subline, icon, KPIs,
        form, chart all clear — confirms the stale-hero bug fix), leaderboard reappears, active
        mode/period/brawler filter from the player view is still applied to the leaderboard
  - [ ] DevTools Network on initial `file://` open: exactly **2** PostgREST requests (`players` +
        the new `v_player_set_rows .in()` bulk call); selecting a player still adds exactly 3 more
        (unchanged); every subsequent filter/chip/pagination interaction issues **0**
  - [ ] `grep -c 'selectPlayerToViewStats' docs/rankedstats/stats.html` — still present as a LABELS
        key (it's still legitimately used elsewhere, e.g. as dead-but-harmless or for another call
        site — confirm via inspection, don't blindly assert `0`)
  - [ ] `node --check` on the extracted `<script>` body -> exit 0; `grep -c 'innerHTML'` -> `0`

---

- [ ] 7. Manual verification pass

  **What to do**:
  - Open `docs/rankedstats/stats.html` directly as a `file://` URL (no server) with DevTools open.
  - Walk every acceptance criterion from Tasks 1-6 in sequence on the fully-merged file.
  - Additionally exercise the full open-question matrix end-to-end on real data:
    - Leaderboard ranked winrate-desc with correct sets-desc tie-break on real tracked-player data.
    - Selecting a brawler in the tree while no player is selected re-scopes the leaderboard to that
      brawler's winrate across all tracked players; selecting a class does the same; clicking the
      active brawler/class clears back to the full roster leaderboard.
    - Selecting a mode chip re-scopes the leaderboard; selecting a period chip re-scopes it; all
      three (mode + period + brawler) combine correctly (AND semantics, matching `applyFilters`).
    - Dragging the min-sets slider changes which players qualify and updates the sidebar hint's
      exclusion count live, with 0 network requests.
    - Pagination: page count matches `Math.ceil(qualifyingCount / 10)`; changing any filter while on
      page 2+ returns to page 1; clicking next/prev never issues a network request.
    - A tracked player with zero sets under the active filter simply doesn't appear (no crash, no
      `NaN%`, no empty row).
    - Zero tracked players (if testable against a scratch/staging project) renders the empty state
      without an `.in([])` PostgREST error.

  **Must NOT do**:
  - Do not skip the DevTools Network-tab request-count check — it is the single most important
    invariant this whole feature must preserve.
  - Do not mark this task complete based on code review alone — it exists specifically to catch
    runtime-only issues (`file://` opens, uncaught exceptions from stale roster edge cases) that
    static analysis can't.

  **Parallelization**: Can Run In Parallel: NO | Wave 4 (final gate) | Blocks: None | Blocked By: 1,2,3,4,5,6

  **References**: every task above; `notes/claude-specs/notepads/rankedstats-redesign/learnings.md`
  for the established verification-note style to follow when recording results.

  **Acceptance Criteria**:
  - [ ] All acceptance criteria from Tasks 1-6 re-confirmed on the merged file
  - [ ] Zero console errors across every interaction in the walkthrough above
  - [ ] `git status --porcelain | grep -v '^ M docs/rankedstats/\|^?? docs/rankedstats/'` -> empty
        (nothing outside scope touched)

---

## Success Criteria

### Verification Commands
```bash
# Structure
grep -c 'id="leaderboard-section"' docs/rankedstats/stats.html   # 1
grep -c 'id="leaderboard-content"' docs/rankedstats/stats.html   # 1
grep -c 'v_player_set_rows' docs/rankedstats/stats.html          # 2

# Security / architecture invariants (directory-wide, pre-existing, must not regress)
grep -ci 'sb_secret\|service_role' docs/rankedstats/stats.html   # 0
grep -c 'innerHTML' docs/rankedstats/stats.html                  # 0
grep -c "from(\"ranked_sets\"\|from(\"set_participants\"\|from(\"battles\"" docs/rankedstats/stats.html  # 0
grep -c 'cdn.jsdelivr.net/npm/@supabase/supabase-js@2' docs/rankedstats/stats.html  # 1

# No migration added
git status --porcelain rankedstats/migrations/   # empty

# Syntax
node --check <extracted script body>   # exit 0
```

### Final Checklist
- [ ] `file://` open with no player selected shows a ranked, paginated (10/page) leaderboard of all
      tracked players instead of the 4 blank-state paragraphs
- [ ] Brawler tree, brawler-class rows, and mode/period chips all correctly re-scope the leaderboard
      when no player is selected, using the exact same click handlers already wired for player mode
- [ ] Winrate is `wins/(wins+losses)` everywhere, draws excluded — consistent with every existing
      view and with `aggregate()`'s existing convention
- [ ] Selecting a player issues exactly 3 PostgREST requests (unchanged); the very first page load
      issues exactly 2 (`players` + the new bulk `v_player_set_rows` call); every subsequent
      filter/chip/pagination interaction in either mode issues 0
- [ ] No new Supabase migration was added — `v_player_set_rows` is reused as-is
- [ ] The pre-existing stale-hero-on-deselect bug is fixed as a side effect
- [ ] A tracked player with zero qualifying sets never renders `NaN%` or crashes — it's silently
      absent from the ranking
- [ ] Nothing outside `docs/rankedstats/` (and this plan's own `notes/` files) was modified

---

## Open Questions

None remaining — all 7 questions posed in the task brief are resolved under "Key decisions" above.
Two minor implementation-time judgment calls are intentionally left unpinned since they don't affect
architecture:
- Exact wording/length of `LABELS.leaderboardExcludedSuffix` and the prev/next glyphs (`‹`/`›`) —
  cosmetic, easy to adjust in the single `LABELS` object without touching any render logic.
- Whether to visually highlight rank #1 on page 1 (e.g. gold text) — not requested by the user, not
  included in this plan's TODOs; flagged here as a cheap, non-blocking follow-up if wanted later.
