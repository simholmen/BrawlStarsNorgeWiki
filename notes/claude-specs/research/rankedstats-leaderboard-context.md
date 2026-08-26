# Research Context: Ranked Stats leaderboard (no-player-selected state)

> **Plan**: ./notes/claude-specs/plans/rankedstats-leaderboard.md
> **Prior redesign plan/context** (architecture this feature builds on):
>   ./notes/claude-specs/plans/rankedstats-redesign.md,
>   ./notes/claude-specs/research/rankedstats-redesign-context.md

All line references verified 2026-08-26 against the **current, post-move** location
`docs/rankedstats/stats.html` (2591 lines) / `docs/rankedstats/stats.css` (1282 lines). The prior
redesign plan/context documents describe `rankedstats/stats.html` (no `docs/` prefix) — that was the
pre-move location, before the "feat: bunch of changes" / "feat:2026 profiles" commits relocated the
page. Every line number the task brief supplied was independently re-verified here and found exact
against the current file — no drift to correct.

## Codebase Findings

### Current "blank state" mechanism

`onPlayerSelected()` (`docs/rankedstats/stats.html:1620-1635`): when `#player-select.value === ""`,
manually calls `setStatus(container, "empty", LABELS.selectPlayerToViewStats)` on all 4 of
`#map-content` (empty-state static markup at `:109-111`), `#brawler-content` (`:117-119`),
`#teammate-content` (`:125-127`), `#recent-content` (`:133-135`), then returns — **`renderAll()` is
never invoked in this branch.**

### Consequence: the sidebar is currently non-functional pre-selection

`renderAll()` (`:470-611`) is the only caller of `renderBrawlerTree()` (`:1444`),
`renderModeChips()` (`:1481`), `renderPeriodChips()` (`:1507`). It is only ever invoked from
`loadPlayerData()` (`:332`), which only runs after a player is actually fetched. Init
(`:2530-2588`) calls `loadPlayers()` (populates the `<select>` only) and never calls `renderAll()`.
**Result: today, before any player is picked, the brawler-class tree and both chip rows are
literally empty divs**, not just "irrelevant". This is a pre-existing gap, not something introduced
by the leaderboard — but it directly blocks the user's explicit ask that these controls "work while
in leaderboard mode," so the leaderboard plan's init-sequence change (calling `renderAll()` once the
new bulk fetch resolves) fixes it as a required side effect.

### Documented pre-existing bug this feature also fixes

`notes/claude-specs/notepads/rankedstats-redesign/learnings.md:532-534`: "deselecting the player
(`tag === ""`) does **not** reset `#hero-kpis`/`#hero-form` back to an empty/placeholder state —
same 'flagged, not fixed, out of this task's literal scope' call Task 6 made for
`#hero-player-name`/`#hero-subline`." Confirmed still true by reading the current
`onPlayerSelected`/`renderHero` — the hero markup (`:42-59`) is only ever written by `renderHero`
(`:622-681`), itself only called from inside `renderAll()`'s existing player-mode body. The
leaderboard plan's `renderHeroEmptyState()` (called from the new `STATE.tag === null` branch of
`renderAll()`) closes this gap.

### `v_player_set_rows` — confirmed sufficient, no migration needed

`rankedstats/migrations/007_redesign_views.sql:39-71`:
```sql
create or replace view public.v_player_set_rows
with (security_invoker = true)
as
select sp.player_tag, sp.set_id, rs.ended_at, rs.started_at, rs.mode, rs.map, sp.brawler_id,
  sp.brawler_name, sp.brawler_power, sp.rank_value, rt.label as rank_label, rt.tier_name,
  rt.tier_level, sp.team_index, rs.winning_team_index, rs.games_played, rs.team0_wins,
  rs.team1_wins, case when ... end as result
from public.set_participants sp
join public.ranked_sets rs on rs.id = sp.set_id
left join public.rank_tiers rt on rt.value = sp.rank_value
where rs.is_complete = true;

grant select on public.v_player_set_rows to anon, authenticated;
```
No `player_tag` filter, no `limit`, no `order by` — exactly as the migration's own header comment
promises ("callers apply those themselves via query params"). `security_invoker = true` means it
runs as the querying role (the publishable `anon` key this page already uses), so its access is
governed entirely by the 2 base tables' own RLS policies.

`rankedstats/migrations/001_init.sql:83-117`:
```sql
create policy "ranked_sets_select" on public.ranked_sets for select to anon, authenticated using (true);
grant select on public.ranked_sets to anon, authenticated;
...
create policy "set_participants_select" on public.set_participants for select to anon, authenticated using (true);
grant select on public.set_participants to anon, authenticated;
```
Both `using (true)` — fully open to `anon`, no per-player restriction. **Conclusion: a bulk
`sb.from("v_player_set_rows").select("*").in("player_tag", trackedTags)` query, using the exact
same publishable key already hardcoded in `stats.html:169-170`, will return every tracked player's
complete set-row history with no RLS denial and no new grant/policy/view needed.** Volume is
trivial — the prior redesign's own research recorded ~126 total sets across 13 tracked players
(`notes/claude-specs/research/rankedstats-redesign-context.md:63`), well inside PostgREST's default
row cap and negligible payload size for a single extra request.

A brand-new pre-aggregated leaderboard view was considered and rejected: the entire reason
`v_player_overall`/`v_player_map`/`v_player_brawler`/`v_player_teammate` (`003_views.sql`) were
*replaced* by `v_player_set_rows` in the original redesign was that pre-aggregated views have no
date column and can't honour mode/period/brawler filtering (`rankedstats-redesign.md:371-373`
Task 5's own "Must NOT do"). That exact reasoning applies with equal force to a hypothetical
pre-aggregated leaderboard view — it would need to be re-invented per filter combination, which is
precisely the round-trip cost the row-level-view architecture exists to avoid.

### Reusable data-layer functions (verified data-source-agnostic by reading their full bodies)

- `aggregate(rows, keyFn, labelFn)` (`:413-460`): groups by `keyFn(row)`, sorts each group
  chronologically by `ended_at`, tallies `result === "win"/"loss"/"draw"`, computes
  `winrate = wins/(wins+losses)` (null on divide-by-zero — draws excluded from both terms, matching
  the SQL convention in `003_views.sql:57-62`), returns `{key, label, sets, wins, losses, draws,
  winrate, rows}`. **Contains no reference to brawler/map/teammate-specific fields** — it is a
  fully generic row-grouping function. Confirmed reusable verbatim with `keyFn = row => row.player_tag`.
- `applyFilters(rows)` (`:382-411`): period cutoff (`ended_at >= cutoff`), `row.mode === STATE.mode`,
  `STATE.filter.kind === "brawler"|"class"` against `row.brawler_id`/`BRAWLER_CLASSES[row.brawler_id]`.
  **Never reads `row.player_tag`.** Confirmed reusable verbatim against `STATE.allSetRows`.
- `filterByModeAndPeriod(rows)` (`:1255-1273`): deliberate small duplicate of the period+mode half
  of `applyFilters`, used by `buildBrawlerClassGroups()` so the tree doesn't collapse via its own
  active filter. Same reasoning applies identically when sourcing from `STATE.allSetRows`.
- `buildRowIconCell(label, subLabel, isThin, extraBadgeEls, iconUrl)` (`:1744-1806`) and
  `buildWinrateCell(winrate)` (`:1808-1831`): pure per-row `<td>` builders with no
  domain-specific assumptions — `buildRowIconCell` already supports an optional `subLabel` (used
  today for a map row's mode sub-label), directly reusable for a leaderboard row's player-tag
  sub-label; `iconUrl` already supports `null` (falls back to the placeholder swatch, exactly the
  existing teammate-row behaviour since no player-portrait asset exists in the repo).
- `renderSparkline(rows)` (`:1843-1924`): takes any group's own chronological `rows` array — which
  `aggregate()` already attaches as `group.rows` — and returns `null` for fewer than 3 sets or an
  inline SVG trend line otherwise. Directly reusable for a per-player Trend column with zero changes.
- `makeCollapsiblePanel(options)` (`:1055-1124`): reusable, generic, already parameterized by
  `id`/`title`/`tint`/`rightText`/`bodyEl` — the leaderboard panel is a 5th call with the same shape
  as the other 4 (`:2542-2584`), no function change needed.

### Non-reusable-as-is: `sortTableByColumn`/`makeSortableHeader`

`sortTableByColumn` (`:1134-1161`) physically reorders `<tr>` elements present in
`table.tBodies[0].rows` via `appendChild`. This is safe for the 3 existing tables because they
render **every** filtered row into the DOM at once (min-sets filtering only toggles `.filtered-out`/
`display:none`, it never removes rows from the DOM — confirmed via `applyMinSampleFilter`,
`:1179-1199`). A leaderboard with true prev/next pagination (as opposed to the teammate panel's
cumulative "load more") only ever has the *current page's* 10 rows in the DOM at a time, so
attaching `sortTableByColumn` to any leaderboard column would silently sort only the visible page,
producing an incorrect result across page boundaries. The plan therefore does not wire sortable
headers on the leaderboard table.

### Existing pagination precedent — additive "load more", not true paging

`TEAMMATE_PAGE_SIZE = 10` (`:2056`); `renderTeammateTable` (`:2090-2155`) renders an empty `<tbody>`
up front, then a "load more" `<button class="load-more-button">` whose click handler
(`loadNextPage`, `:2138-2149`) appends the *next* `TEAMMATE_PAGE_SIZE` rows to the same tbody
(cumulative growth, never removes earlier rows, never goes "back"). `.load-more-button` CSS
(`stats.css:440-465`) is styled full-width, block-level, reusing the sidebar `.chip`
gold-accent-on-hover treatment. **This is not real pagination** — there is no way to view "page 1"
again after loading more without a full re-render. The leaderboard's explicit "1-10 with
pagination" requirement (rank #1-10, then advance/return) needs a different mechanism: real
prev/next paging that only ever materializes the current page's 10 rows, discarding the previous
page's DOM on each turn. The plan reuses `.load-more-button`'s *visual* class for the prev/next
buttons (consistent look) without reusing any of `renderTeammateTable`'s cumulative-append logic,
and leaves that function completely untouched.

### `players` roster query (existing, reused as the tag list for the bulk fetch)

`loadPlayers()` (`:1571-1618`): `sb.from("players").select("tag,name").eq("is_tracked", true).order("name")`.
Already fetches exactly the tag+name pairs the leaderboard needs for both (a) the `.in()` filter's
tag list and (b) the `aggregate()` `labelFn`'s display-name lookup. Currently the function's return
value is discarded by its only caller (bare `loadPlayers();` at init, `:2586`) — the plan's Task 1
makes it return its resolved array so the new init sequence can pass it to `loadLeaderboardData`.

## Design Spec continuity

No new visual language is introduced. The leaderboard panel reuses `var(--tint-map)` (no 5th
`--tint-*` token minted), the existing dark "Ranked gold" token set (`stats.css:17-85`), the
existing `winrateTone()` thresholds (`>=0.60` green / `>=0.45` gold / else red, `:833-844`), and the
existing `Barlow Condensed`/`Inter Tight` font stack already loaded via `<link>` (`stats.html:28-29`).
Only 2 new CSS rules are added (`.leaderboard-pagination`, `.load-more-button:disabled`), both purely
additive.

## Decisions Made

All decisions were resolved during this research pass and are recorded in the plan's "Key
decisions" section (query strategy, STATE modeling, period-chip applicability, min-sets-as-
qualification-gate, pagination mechanics, tie-break rule, zero-sets handling). No decision was
deferred to the user — the task brief explicitly asked for all 7 open questions to be resolved, not
left open.

## Open Questions

None architecturally significant remain. Two purely cosmetic implementation-time calls (exact
Norwegian wording of the exclusion-count label, whether to gold-highlight rank #1) are flagged as
non-blocking in the plan's own Open Questions section.
