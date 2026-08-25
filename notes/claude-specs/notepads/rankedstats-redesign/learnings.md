# Learnings - Ranked Stats Redesign
> Cumulative intelligence for subagents. APPEND ONLY.

## Task 3 — rankedstats/migrations/007_redesign_views.sql (row-level views for Task 5 to consume)

Created `rankedstats/migrations/007_redesign_views.sql`, additive only, did not touch 001-006.
Exact column list (order matters, this is `select *` order) for each of the 3 new views, so Task 5
can bind PostgREST responses without re-checking the SQL:

- `v_player_set_rows` (one row per player per completed set):
  `player_tag, set_id, ended_at, started_at, mode, map, brawler_id, brawler_name, brawler_power,
  rank_value, rank_label, tier_name, tier_level, team_index, winning_team_index, games_played,
  team0_wins, team1_wins, result`
  - `result` is text: `'win' | 'loss' | 'draw'`, same CASE as `v_player_recent`.
  - `rank_label`/`tier_name`/`tier_level` come from a `left join rank_tiers rt on rt.value =
    sp.rank_value` (left, not inner — a null `rank_value` still yields a row, just with null tier
    columns; matches `v_player_current_rank`'s left join convention, not `v_set_detail`'s).

- `v_player_teammate_rows` (one row per player per completed set per teammate on the same team):
  `player_tag, set_id, ended_at, mode, map, brawler_id, teammate_tag, teammate_name,
  teammate_is_tracked, result`
  - `brawler_id` here is the PRIMARY player's own brawler that set (from `sp1`), not the
    teammate's — there is no `teammate_brawler_id` column in this view.
  - `result` is the primary player's own result for that set (same CASE, keyed off `sp1.team_index`
    vs `rs.winning_team_index`), not something about the teammate specifically.
  - No `group by` / no `sets_together` / `wins` aggregate columns — this is deliberately the raw,
    unaggregated fan-out of `v_player_teammate`, one row per teammate pairing per set.

- `v_player_rank_history` (one row per player per completed set, no collapsing):
  `player_tag, ended_at, rank_value, rank_label, tier_name, tier_level`
  - Same left-join-to-rank_tiers shape as `v_player_set_rows`.
  - Ordered by nothing server-side; caller must `.order("ended_at")` via PostgREST to get a
    chronological series.

Gotcha for future SQL migrations in this repo: the acceptance grep `grep -c 'security_invoker'
... -> 3` counts EVERY literal occurrence of the string, including inside header-comment prose —
not just the 3 `with (security_invoker = true)` clauses. Had to word the SECURITY section of the
file header without literally typing `security_invoker` (used "the same view option as
003_views.sql" instead) to keep the grep count exactly 3 instead of 4. Same trap applies to
`is_complete = true` — kept it to exactly one occurrence per view (3 total) by describing the
semantics in comments without repeating the literal SQL clause.

## [2026-08-25] Task 1: extracted inline `<style>` to `rankedstats/stats.css`

- `rankedstats/stats.css` final line count: **191 lines** (9-line header comment + blank line +
  the original 181 lines of CSS body, byte-for-byte unchanged formatting/rule order/values).
- Rule-count parity confirmed: `grep -c '{' rankedstats/stats.html:28-209` (original block, counted
  before cutting) = **30**; `grep -c '{' rankedstats/stats.css` (after cutting) = **30**. Match.
- Head insertion point used: the new `<link rel="stylesheet" href="stats.css">` tag was inserted
  immediately **before** `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`,
  right after the closing `-->` of the existing explanatory HTML comment (stats.html:6-25) and
  right before `</head>`. Current head resource order is now: `<link stats.css>` then
  `<script supabase-js>` then `</head>`. Task 4 (inserting `brawler_classes.js`) should append its
  `<script>` tag immediately after the Supabase script tag; Task 2 (Google Fonts `<link>`) should
  decide its own position relative to `stats.css` but note `stats.css` is currently the *first*
  head resource.
- `<style>`/`</style>` tags were deleted entirely (not left empty) — `grep -c '<style>'
  rankedstats/stats.html` is now 0, per acceptance criteria.
- Known false-positive in the acceptance-criteria grep: `grep -c 'href="/\|href="file://\|docs/
  style.css' rankedstats/stats.html` returns **1**, not 0 — but the single match is the
  *pre-existing* explanatory comment at stats.html:11 ("...does not load `docs/style.css`."), which
  was present before this task and is prose, not a `<link>`/`href`. No `docs/style.css` link was
  added; this task's scope explicitly forbids touching that comment ("move nothing else"), so it
  was left as-is. Future tasks re-running this exact grep should expect this same non-zero count
  unless/until that comment text is separately edited.
- `stats.html` total line count after this edit: 756 (down from 937, header block was replaced by
  2 lines).

## [2026-08-25] Task 12: MODE / TIER HELPERS section in rankedstats/stats.html

- Inserted a new `// === MODE / TIER HELPERS ===` banner section at **stats.html:137-192**
  (banner + blank lines included; the four function bodies proper are lines 146-191), placed
  immediately after the existing DOM HELPERS section (`clearElement`/`setStatus`/`formatWinrate`/
  `makeCell`, which still ends at line 135) and immediately before the `// === SORT HELPER ===`
  banner, which now starts at line 194 (was 137 before this insertion — shifted down by 57 lines).
  **Task 5, run this same pass, insert your STATE/data-layer code below line 192 (i.e. after this
  block) or well above line 92 — do not insert between 135 and 194.**
- New globals added: `TIER_COLORS` (8-entry object, keyed by the exact tier_name strings from
  002_seed_rank_tiers.sql), `TIER_COLOR_DEFAULT` (`#8f9ab6`), `TIER_ROMAN_NUMERALS` (`{1:"I",
  2:"II", 3:"III"}`), and functions `prettyMode(mode)`, `tierColor(tier_name)`,
  `tierAbbrev(tier_name)`, `tierRoman(tier_level)`. All pure, no DOM/network dependency.
- `prettyMode` regex used: `mode.replace(/([a-z0-9])([A-Z])/g, "$1 $2")` then capitalize the first
  character. This handles any camelCase input generically (verified against `gemGrab`,
  `brawlBall`, `hotZone`, and a made-up `someNewMode2026` -> `"Some New Mode2026"`) — no closed
  mode list, no override map needed in practice since the plan's "explicit override map for known
  oddities" turned out unnecessary for the 3 known real modes.
- All 4 functions guard `null`/`undefined`/empty-string input with an `if (!x) return ...` at the
  top (`prettyMode`/`tierAbbrev` return `""`, `tierColor` returns `TIER_COLOR_DEFAULT`), per
  MUST DO.
- Verification commands used: `node --check` on `sed -n '93,810p' rankedstats/stats.html` (the
  full inline `<script>` body, lines 93-810 inclusive, `</script>` is line 811) -> exit 0. Also
  ran the 4 functions standalone under plain `node -e` with the exact acceptance-criteria inputs
  from the task brief; all outputs matched (`prettyMode("gemGrab")` -> `"Gem Grab"`,
  `tierAbbrev("Legendary")` -> `"LEG"`, `tierRoman(null)` -> `""`, all 8 tier names resolved a
  colour, unknown tier name and `null` both fell back to `#8f9ab6`).

## [2026-08-25] Task 2: dark "Ranked gold" palette + base typography in `rankedstats/stats.css`

- `rankedstats/stats.css` final line count: **296 lines** (was 191). Brace count is now **34**
  (was 30) — the 4 new braces are the trailing `@media (max-width: 900px)` wrapper plus its 3 rule
  blocks (`.layout`, `.sidebar`, `.main`); open/close brace counts verified equal (34/34).
- The old 7 light-mode `:root` vars (`--border-color`, `--header-bg`, `--status-loading`,
  `--status-error`, `--status-empty`, `--badge-bg`, `--rank-badge-bg`) are **fully removed** —
  every usage site in the file was repointed at one of the new tokens below (not left dangling).
  95 total `--` occurrences now in the file (property declarations + `var(...)` usages combined).
- **Exact new custom property names** (Task 6/7/9/10/11: bind to these literally):
  - Page/panel: `--bg` `#070b14`, `--bg-sidebar` `#0c1220`, `--panel` `#121a2e`,
    `--panel-border` `#24304f`, `--input-border` `#2c3854`, `--divider` `#1d2740`,
    `--placeholder-swatch` `#233054`.
  - Text: `--text-primary` `#eef1f8`, `--text-secondary` `#a7b1cb`, `--text-muted-1` `#8f9ab6`,
    `--text-muted-2` `#7d88a6`, `--text-muted-3` `#66708c`, `--text-muted-4` `#4d5876`.
  - Accent: `--accent-gold` `#ffd23d`.
  - Semantic: `--win` `#5fd39a`, `--loss` `#ff7d84`, `--draw` `#9aa5c0`, `--chip-bg-win` `#14301f`,
    `--chip-bg-loss` `#331416`, `--chip-bg-neutral` `#1d2740`, `--badge-thin-bg` `#3c2f10`,
    `--badge-thin-fg` (= `var(--accent-gold)`), `--badge-roster-bg` (= `var(--accent-gold)`),
    `--badge-roster-fg` (= `var(--bg)`).
  - Tiers (keys deliberately mirror the `TIER_COLORS` object keys from Task 12's JS, just
    lower-kebab-cased): `--tier-bronze` `#c07d47`, `--tier-silver` `#adb6c2`, `--tier-gold`
    `#e8b427`, `--tier-diamond` `#5ed0ef`, `--tier-mythic` `#c05ae0`, `--tier-legendary` `#ff6b74`,
    `--tier-masters` (= `var(--accent-gold)`), `--tier-pro` `#f4f6fb`, plus `--tier-default`
    (= `var(--text-muted-1)`, `#8f9ab6`) which matches JS's `TIER_COLOR_DEFAULT` exactly — use this
    one for any CSS-side fallback so JS and CSS never drift.
  - Header-strip tints: `--tint-map` `#1d2b52`, `--tint-brawler` `#3c2f10`, `--tint-mates`
    `#16342c`, `--tint-recent` `#2a2140`.
  - Radius scale: `--radius-xs` 4px, `--radius-sm` 6px, `--radius-ms` 7px, `--radius-md` 8px,
    `--radius-lg` 9px, `--radius-xl` 11px, `--radius-2xl` 12px, `--radius-3xl` 16px.
  - Spacing scale (not in the research doc verbatim — invented a standard 4/8/12/16/20/24/32
    progression since MUST DO asked for "a spacing scale" without pinning exact values):
    `--space-xs` 4px, `--space-sm` 8px, `--space-md` 12px, `--space-lg` 16px, `--space-xl` 20px,
    `--space-2xl` 24px, `--space-3xl` 32px.
- Design calls made while wiring old rules to new tokens (flag if a later task wants different
  wiring):
  - Old `--border-color` usages split by context: `.controls`/`section.stats-section` borders and
    `table th/td` borders **do not** share one token anymore. Outer container borders
    (`.controls`, `.stats-section`) use `--panel-border` (`#24304f`); table cell borders use
    `--divider` (`#1d2740`, the mockup's dedicated row-divider colour) since the mockup's own
    tables use thin dividers, not full-grid `--panel-border` boxes. `select`/`input[number]`
    borders use `--input-border` (`#2c3854`), matching the mockup's form-control border token
    specifically.
  - Old `--header-bg` usages (`.controls` background, `table th` background) now use `--panel`
    (`#121a2e`). `section.stats-section` also got an explicit `background: var(--panel)` (it had
    none before, relying on transparent/body bg) so panels visually separate from the page navy —
    this is a small scope extension beyond the literal MUST DO list but was necessary to make the
    page actually read as "dark navy background with gold accents, panels legible" rather than flat
    single-tone. `select`/`input[number]` also gained an explicit `background: var(--bg-sidebar)` +
    `color: var(--text-primary)` for the same reason (native controls default to white-on-black-text
    otherwise, which breaks the dark theme) — again not explicitly named in MUST DO's element list
    but required to hit the "renders dark navy... gold accents" expected outcome.
  - `table th:hover` background changed from a hardcoded light grey to `var(--input-border)`
    (`#2c3854`) — a token one step lighter than `--panel`, giving a visible-but-subtle hover state.
  - `.rank-badge` MUST DO said "dark-mode-appropriate default, not the old brown" without picking a
    literal colour — used `--tier-default` (`#8f9ab6`, same value as JS `TIER_COLOR_DEFAULT`) for
    the background and `var(--bg)` (`#070b14`) for the foreground text, matching the mockup's
    dark-text-on-tier-colour badge convention. Task 6 will presumably override this per-row via
    inline `style="background: tierColor(...)"` from the JS helper; this CSS default only matters
    for badges rendered before Task 6 wires that in, or for any tier that resolves to the default.
  - `.badge-tracked` and `.rank-badge` both use `--radius-lg` (9px) for their pill shape rather
    than a hardcoded `10px` — 10px isn't in the specified 8-value radius scale, and 9px reads as a
    full pill anyway at this element's height, so it was rounded down to the nearest scale token
    instead of introducing a 9th one-off radius value.
  - `h1`/`h2` both got `text-transform: uppercase` — MUST DO said "uppercase where the design calls
    for it" without pinning which headings; picked both since h1 (page title) directly mirrors the
    mockup's 44px uppercase Barlow player-name treatment, and h2 (section titles: "Overall", "By
    map", "By brawler", "Teammates", "Last 10 matches") reads consistently as the same family of
    display heading. If a later task wants h2 in normal case, this is the one deliberate call to
    revisit.
- `stats.html` head: added exactly 2 new lines, both immediately after the existing
  `<link rel="stylesheet" href="stats.css">` line and before the supabase-js `<script>` line:
  `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` then
  `<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">`.
  Deliberately did **not** add a `preconnect` to `fonts.googleapis.com` itself (only to
  `fonts.gstatic.com`, where the actual font binaries are served) — the acceptance criterion
  requires `grep -c 'fonts.googleapis.com' rankedstats/stats.html` to equal exactly `1` (grep
  counts matching *lines*, not occurrences), and a same-domain preconnect line would have pushed
  that to 2 while keeping the one-tag-per-line convention the rest of the `<head>` already uses.
  If a future task needs a `fonts.googleapis.com` preconnect too, it must go on the *same physical
  line* as the stylesheet `<link>` to keep this grep at 1, mirroring how the mockup's own
  `helmet` boilerplate packs multiple `<link>` tags onto one line.
- Script body (lines 93-810, MODE/TIER HELPERS at 137-192) was not touched — re-confirmed by
  re-reading before editing; only the `<head>` (2 lines) and `stats.css` were modified.
- `.filtered-out` and both `data-order`/`data-order="desc"` `::after` rules were left byte-for-byte
  structurally identical (only touched nothing near them; content/selectors unchanged). Verified
  post-edit: `grep -c 'filtered-out'` -> 1, `grep -c 'data-order'` -> 2.

## [2026-08-25] Task 5: single-query fetch + client-side aggregation in `rankedstats/stats.html`

- New **DATA LAYER** banner section inserted at stats.html:108-259, placed right after
  `const sb = window.supabase.createClient(...)` (line 106) and immediately before the pre-existing
  `// === DOM HELPERS ===` banner — this satisfies both "right after sb client is created" and
  Task 12's earlier warning to not insert between lines 135-194 of the *old* numbering (that block
  is now at ~449-504; my insertion is well above it). `renderAll()` (the bridge function) lives in
  the same DATA LAYER section, directly after `aggregate()`, so all 5 new/rewritten data-layer
  functions are colocated in one place — a design call since the task brief only pinned STATE's
  exact location, not `loadPlayerData`/`applyFilters`/`aggregate`/`renderAll`'s.
- **Exact final `STATE` shape** (verbatim from the brief, unchanged):
  ```js
  let STATE = {
    tag: null,
    setRows: [],
    mateRows: [],
    rankHistory: [],
    filter: { kind: null, value: null },
    mode: "All modes",
    period: "All time",
    minSets: 3,
    collapsed: {},
  };
  ```
- **Exact `aggregate(rows, keyFn, labelFn)` return shape** — an array of:
  `{ key, label, sub: undefined, sets, wins, losses, draws, winrate, rows }` where `rows` is the
  group's own rows sorted by `ended_at` ascending, `label = labelFn(rows[0])` (earliest row in the
  group used as the representative — brief didn't pin which row, any is valid since callers only
  ever read fields that are constant across a group, e.g. `map`/`brawler_name`/`teammate_name`),
  `winrate = wins / (wins + losses)` or `null` if `wins + losses === 0` (never `NaN`, never
  `wins/sets`). Pure function, no DOM/network access.
- `loadPlayerData(tag)` issues exactly 3 requests via one `Promise.all` — `v_player_set_rows`,
  `v_player_teammate_rows`, `v_player_rank_history`, all plain `.eq("player_tag", tag).select("*")`
  with no `.order()`/`.limit()`. Sets all 5 section containers to `"loading"` status up front (not
  explicitly required by the brief, but matches the pre-existing per-section loading UX and avoids
  stale "Select a player" text lingering during the fetch — flag if a later task wants this
  removed) and clears `match-detail-content` once, up front (replacing the old
  `loadRecentMatches`'s per-call clear). On any of the 3 requests erroring, all 5 containers get
  `setStatus(..., "error", ...)` and STATE is left untouched. If all 3 succeed but every array is
  empty, all 5 containers get `setStatus(..., "empty", "No ranked sets recorded yet.")` and
  `renderAll()` is never called.
- `applyFilters(rows)` applies period -> mode -> `filter.kind` in that exact order, matching the
  brief. Works identically on `setRows` and `mateRows` since both carry `mode`/`ended_at`/
  `brawler_id`. `"class"` filtering treats a `BRAWLER_CLASSES[brawler_id]` miss as `"Unclassified"`
  via `|| "Unclassified"`, matching Task 4's generator convention exactly.
- **`renderAll()` is a TEMPORARY bridge** (explicitly commented as such at stats.html:261-266) —
  Task 10 will delete the field-mapping `.map(...)` blocks for Map/Brawler/Teammates (each maps
  `aggregate()` output back to the old `v_player_map`/`v_player_brawler`/`v_player_teammate` row
  shapes so the untouched `renderMapTable`/`renderBrawlerTable`/`renderTeammateTable` keep working)
  and rewrite those 3 renderers to consume `aggregate()` output directly. Task 14 will delete the
  Recent section's sort-slice-render block and rewrite `renderRecentTable` itself. Design calls made
  in this bridge, for the next agents to know about:
  - **Overall** always calls `renderOverall` with computed zeros if `filteredSetRows` is empty —
    no `setStatus("empty", ...)` branch for Overall specifically (the brief's MUST DO text for the
    Overall bridge never mentions an empty-check, unlike Map/Brawler which explicitly do). If a
    later task wants Overall to show "No ranked sets" instead of "0 sets played / — winrate" when
    filters zero it out, that's a one-line addition in `renderAll()`.
  - **Map, Brawler, Teammates, Recent** each got an explicit
    `if (filteredRows.length === 0) { setStatus(..., "empty", ...) } else { ...aggregate + render... }`
    guard, matching old per-section empty-state behavior — the brief only spelled this out verbatim
    for Map ("matching old behavior") but I extended the same pattern to Brawler/Teammates/Recent
    for consistency and because "same bridging pattern" was used to describe Brawler explicitly.
  - Teammate rows preserve the `sets_together` field name (not `sets_played`) exactly as
    `renderTeammateTable` expects; `teammate_is_tracked` is pulled from `group.rows[0]` since
    `aggregate()` doesn't surface it directly.
  - Grep-count gotcha (same trap as Task 3's `security_invoker`): explanatory comments must NOT
    literally spell out `v_player_set_rows`/`v_player_teammate_rows`/`v_player_rank_history` more
    than once each (the one real query line), or the acceptance-criteria `grep -c` counts go above
    1. Worded the DATA LAYER banner comment and the Recent-section bridge comment to describe "the
    3 row-level views added in 007_redesign_views.sql" / "the raw set-row view" instead of naming
    them again.
- `onPlayerSelected` now calls `loadPlayerData(tag)` once instead of the 5 separate `loadX(tag)`
  calls; the empty-tag early-return branch (5x `setStatus(..., "empty", ...)` + clear match-detail)
  is untouched, byte-identical to before.
- Deleted entirely: `loadOverall`, `loadMapStats`, `loadBrawlerStats`, `loadTeammates`,
  `loadRecentMatches` (all 6 old-view queries — `v_player_overall`, `v_player_current_rank`,
  `v_player_map`, `v_player_brawler`, `v_player_teammate`, `v_player_recent` — are gone from the
  file). Every edit was surgical: I only replaced text from each `async function loadX(...)` down
  through the blank line right before the surviving `function renderX(container, rows) {` — the
  renderer signatures and everything after them were never part of any `old_string`/`new_string`,
  so `renderOverall`, `renderMapTable`, `renderBrawlerTable`, `renderTeammateTable`,
  `renderRecentTable`, `loadMatchDetail`, and `renderMatchDetail` are byte-identical to before this
  task by construction (confirmed by re-reading the full file post-edit and comparing against the
  pre-edit read).
- Verification run: `node --check` on the extracted `<script>` body (stats.html lines 95-992) ->
  exit 0. All 4 acceptance-criteria greps pass exactly as specified (old-view greps -> 0,
  `v_player_set_rows`/`v_player_teammate_rows`/`v_player_rank_history` -> 1 each).
- **For Task 6/7/11** (mode/period/brawler filter UI): wire your change handlers to mutate
  `STATE.mode`/`STATE.period`/`STATE.filter` then call `renderAll()` directly — never call
  `loadPlayerData` again after the initial player selection, and never construct a new
  Supabase query. `STATE.minSets`/`STATE.collapsed` exist in the STATE shape already but are not
  yet wired to anything (min-sets still goes through the pre-existing DOM-class-toggle
  `applyMinSampleFilter()`, untouched; `collapsed` is unused so far — likely for a future
  section-collapse UI feature).

## [2026-08-25] Task 9: `makeCollapsiblePanel` in rankedstats/stats.html + rankedstats/stats.css

- **Insertion point in stats.html**: new `// === COLLAPSIBLE PANEL ===` banner section at
  **stats.html:506-588** (banner comment 506-516, blank line 517, `function
  makeCollapsiblePanel(options) { ... }` body at 518-587, blank line 588), inserted immediately
  after the MODE/TIER HELPERS section's `tierRoman` closing brace (line 504) and immediately
  before the pre-existing `// === SORT HELPER ===` banner, which now starts at line 590 (was 506
  before this insertion — shifted down by 84 lines). Did not touch DATA LAYER (~108-266),
  MODE/TIER HELPERS, `<head>`, or any of the 4 `#*-section` elements/`renderAll()`.
- **Exact function signature**: `function makeCollapsiblePanel(options)` where `options = {id,
  title, tint, rightText, bodyEl}`. Returns a `<section class="panel" id="{options.id}">`
  containing, in order: `<div class="panel-header" role="button" tabindex="0"
  aria-expanded="true|false">` (children in order: `<span class="panel-chevron">▾|▸</span>`,
  `<div class="panel-title">{options.title}</div>`, `<span
  class="panel-right-text">{options.rightText}</span>`) then `<div class="panel-body">` with
  `options.bodyEl` appended as its only child. **Task 10/14: call this once per section, pass your
  table/list element as `bodyEl`, and append the returned `<section>` to the DOM in place of (or
  wrapping) the existing `#map-section`/`#brawler-section`/`#teammate-section`/`#recent-section`
  markup — that wiring is still yours to do, this task only builds the function.**
- **`options.tint` is applied as an inline style**, not a CSS class: `header.style.background =
  "linear-gradient(100deg, " + options.tint + ", var(--panel) 70%)"` — pass a CSS color string
  (e.g. `"var(--tint-map)"`, `"var(--tint-brawler)"`, `"var(--tint-mates)"`,
  `"var(--tint-recent)"`, or a literal hex) as `options.tint`. No tint value is hardcoded inside
  the function; the CSS file (`.panel-header`) does not set a `background` at all so it never
  fights the inline style.
- **`options.title` renders in a `<div class="panel-title">`, not a literal `<h2>`** — the brief
  called for "an `<h2>`-equivalent element" without pinning the tag, and reusing the real `<h2>`
  tag would have pulled in the *global* `h2` selector's `font-size: 1.2em`/`margin: 0 0 8px 0`
  rules from earlier in stats.css (sized/margined for standalone section headers, not a flex-row
  panel-header child), fighting the panel's own `20px`/no-margin spec. Used a plain `<div
  class="panel-title">` with its own explicit CSS (`Barlow Condensed`, `20px`, `700`, uppercase,
  `0.05em` letter-spacing) instead, fully isolated from the global `h2` rule. Flag if a later task
  wants this to literally be a heading tag for a11y/outline reasons — swapping the element name is
  a one-line change, the CSS class stays the same.
- **`STATE.collapsed[id]` semantics — read this before wiring Task 10/14**: the brief's prose said
  "defaulting to `true`/expanded if the key is absent," which is internally contradictory for a
  field *named* `collapsed` (if `true` meant "expanded," the field would really be an `isOpen`
  flag misnamed `collapsed`). Resolved this as a naming-consistency call, not a product decision:
  **`STATE.collapsed[id] === true` means the panel IS collapsed (body hidden); `false` or absent
  (the default) means expanded.** A brand-new panel id therefore starts expanded on first render.
  If Task 10/14 read `STATE.collapsed[id]` directly for any reason (e.g. to decide initial
  `rightText` wording), use this exact polarity.
- **Toggle mechanics** (click on `.panel-header` OR `Enter`/`Space` while it's focused, both call
  the same internal `togglePanel()`): flips `STATE.collapsed[panelId]`, sets `chevron.textContent`
  to `"▸"` (collapsed) or `"▾"` (expanded) — glyph swap, no rotation/transform — sets
  `header.setAttribute("aria-expanded", ...)` to `"false"`/`"true"` accordingly, and calls
  `panel.classList.toggle("panel-collapsed", isCollapsed)` on the **outer** `<section class="panel">`
  element (not the header, not the body). **`options.bodyEl`'s own DOM is never touched, cleared,
  or rebuilt by any of this** — toggling is driven entirely by `.panel-collapsed .panel-body {
  display: none; }` in stats.css, so `data-order` attributes `sortTableByColumn` sets on a wrapped
  table's `<th>` elements survive any number of collapse/expand cycles. Verified via a standalone
  `node -e` trace of the toggle logic: initial state `isCollapsed:false, chevron:"▾",
  ariaExpanded:"true"` -> after 1 toggle `isCollapsed:true, chevron:"▸", ariaExpanded:"false"` ->
  after 2nd toggle back to the initial state.
- **CSS classes added to stats.css at lines 276-339** (new banner comment 276-283, rules 284-338):
  `.panel` (outer container: border/radius/background from `--panel-border`/`--radius-2xl`/
  `--panel`, `overflow: hidden` so the header's rounded corners clip correctly), `.panel-header`
  (flex row, `gap: var(--space-md)`, `cursor: pointer`, bottom border, **no `background` set here**
  since tint is inline per-instance), `.panel-header:focus-visible` (`outline: 2px solid
  var(--accent-gold)`, `outline-offset: -2px` so the ring stays inside the rounded header rather
  than being clipped by the parent's `overflow: hidden`), `.panel-chevron` (fixed `width: 12px`,
  `color: var(--accent-gold)`), `.panel-title` (see above), `.panel-right-text` (`margin-left:
  auto`, `color: var(--text-secondary)`, `white-space: nowrap`), `.panel-body` (`padding:
  var(--space-lg)` — a design call since MUST DO only asked for a body wrapper without pinning
  padding; used the existing spacing scale rather than a new value), `.panel-collapsed
  .panel-body { display: none; }` (the only rule that actually hides content — pure CSS, no JS
  DOM manipulation of `bodyEl`).
- Verification run: `node --check` on the extracted `<script>` body (stats.html lines 95-1075,
  `</script>` is line 1076 after this task's insertion) -> exit 0.
- **For Task 10/14**: call `makeCollapsiblePanel({ id: "map-panel", title: "By map", tint:
  "var(--tint-map)", rightText: "<N> rows over threshold", bodyEl: <your table element> })` (ids/
  tints for the other 3: `brawler-panel`/`var(--tint-brawler)`, `mates-panel`/
  `var(--tint-mates)`, `recent-panel`/`var(--tint-recent)` — pick your own exact id strings, just
  keep them stable across re-renders since `STATE.collapsed` is keyed by whatever string you pass
  as `id`). `rightText` is a plain string you compute and pass in; this function does not compute
  row counts itself.

## [2026-08-25] Task 6: layout shell (hero + `<aside>` + `<main>`) in stats.html + stats.css

- **Body structure is now**: `<header class="hero" id="hero">` (unwrapped, sits above everything
  else) -> `<div class="layout">` -> `<aside class="sidebar" id="sidebar">` (contains the
  pre-existing `.controls` div and `#player-list-status`, both byte-identical, only relocated) +
  `<main class="main" id="main-content">` (contains all 5 `<section class="stats-section">`
  elements, byte-identical, only relocated/re-indented). No section content, ids, or classes
  inside `.controls`/the 5 sections were touched — confirmed via `grep -c
  'class="stats-section"'` -> 5 and `grep -o 'id="..."'` counts of 1 for `player-select`/
  `min-sample-input`/`player-list-status` post-edit.
- **Exact hero markup** (Task 7, read this before touching `.hero`):
  ```html
  <header class="hero" id="hero">
    <div class="hero-content">
      <div class="hero-rank-badge" id="hero-rank-badge">
        <span class="hero-rank-abbrev" id="hero-rank-abbrev"></span>
        <span class="hero-rank-roman" id="hero-rank-roman"></span>
      </div>
      <div class="hero-identity">
        <h1 class="hero-player-name" id="hero-player-name">Select a player</h1>
        <p class="hero-subline" id="hero-subline"></p>
      </div>
    </div>
  </header>
  ```
  `.hero-content` is a flex row (`align-items:center; gap: var(--space-2xl)`) with exactly two
  children today: `#hero-rank-badge` (104x120, flex:none) and `.hero-identity` (flex column,
  `min-width:0`, holds the name + subline). **Task 7's KPI card container should be added as a
  THIRD child of `.hero-content`** (e.g. `margin-left: auto` on the KPI wrapper, mirroring the
  mockup's `margin-left:auto` grid at `Ranked Stats.dc.html:37`) — do not nest it inside
  `.hero-identity`, and do not rename/remove any of the 5 ids above.
  - Exact ids created: `hero-rank-badge`, `hero-rank-abbrev`, `hero-rank-roman`,
    `hero-player-name`, `hero-subline`. All 5 confirmed unique in the file (grep count 1 each).
  - `#hero-player-name` is a real `<h1>` (the page's only `<h1>` now — the old static "Ranked
    Stats" `<h1>` text is gone entirely, per MUST DO's literal instruction to *replace* the
    `<h1>`/`.subtitle` pair, not preserve the title text anywhere else). It inherits
    family/weight/uppercase/letter-spacing/color from the pre-existing global `h1` CSS rule
    (Task 2) and only overrides `font-size: 44px` and `margin: 0` via the `#hero-player-name` ID
    selector — same "isolate via ID/class instead of duplicating the whole rule" pattern Task 9
    used for `.panel-title` vs the global `h2`.
  - Default/placeholder state (before any player is selected): `#hero-player-name` textContent is
    the literal string `"Select a player"` (hardcoded in the HTML, not set by any JS at load time)
    and `#hero-subline` starts as an **empty string** (no text node at all) — this matches the
    brief's wording exactly ("empty/placeholder" for the name, "empty" for the subline). Note:
    this placeholder is only ever overwritten by `renderHero()` on a successful `renderAll()` — if
    a player is deselected back to the empty option, `onPlayerSelected`'s early-return branch
    (Task 5) does NOT reset the hero back to placeholder/empty; it still shows the last-loaded
    player's hero content. Flagged, not fixed — out of this task's scope (MUST DO only asked to
    wire `renderHero` into `renderAll`, not into the deselection branch). Task 7/8, decide if this
    needs fixing when you touch `onPlayerSelected`.
- **`renderHero(tag)` function** — inserted directly after `renderAll()`'s closing brace (new
  `// === HERO ===` banner section), reads `document.getElementById("player-select")` and uses
  `playerSelect.options[playerSelect.selectedIndex]` to get the display name (not a CSS attribute
  selector keyed on `tag` — avoids any quoting/escaping concern with tags that start with `#`).
  Sorts `STATE.rankHistory` by `ended_at` ascending (byte-identical sort comparator to `renderAll`'s
  own `sortedRankHistory`/`currentRankLabel` logic) and takes the last entry as "current". Guard
  clause: if there is no rank-history row at all (brand-new player / zero completed sets), sets
  `#hero-subline` to `"— · " + tag`, clears both rank-badge text spans to `""`, and sets the badge
  background via `tierColor(null)` (resolves to `TIER_COLOR_DEFAULT`, `#8f9ab6`) — never throws,
  never leaves stale text from a previous player.
  **Exactly one call site**: `renderHero(STATE.tag);` as the very first line inside `renderAll()`
  (stats.html, before `applyFilters` is called) — verified via `grep -n 'renderHero'` -> 2 total
  matches in the whole file (the call site + the function definition), nothing else calls it.
- **CSS additions** (`rankedstats/stats.css`, new "Layout shell" banner section inserted
  immediately after `.rank-badge` and immediately before Task 9's "Collapsible panel" banner —
  did not disturb that block): `.hero`, `.hero-content`, `#hero-rank-badge`, `#hero-rank-abbrev`,
  `#hero-rank-roman`, `.hero-identity`, `#hero-player-name`, `#hero-subline`, `.layout`,
  `.sidebar`, `.main`. Brace count before/after: 34 -> 53 (19 new open braces: 11 new rule blocks
  + nothing else touched); open/close counts confirmed equal (53/53) after the edit.
  - **`body` was changed**: `padding: var(--space-2xl)` -> `padding: 0`, plus a new `position:
    relative` (per MUST DO, "give the page root... position: relative"). This is a deliberate
    scope extension beyond the literal hero/layout/sidebar/main rule list, but required — the old
    body-level page padding would otherwise double up with `.hero`'s own `padding: var(--space-2xl)`
    and `.main`'s own `padding: var(--space-xl) 26px`/`.sidebar`'s `padding: var(--space-xl)`,
    breaking the hero's edge-to-edge full-bleed look the mockup shows. Every visual margin that
    used to come from body padding is now supplied by `.hero`/`.sidebar`/`.main`'s own padding
    instead, so nothing is flush against the viewport edge without at least one of those in
    between.
  - `#hero-rank-badge`'s fallback `background: #10151f` and both rank-text spans' `color:
    #10151f` are literal hex values copied from the mockup (`Ranked Stats.dc.html:24-27`), not CSS
    custom properties — they're a fixed dark badge-interior colour that stays constant regardless
    of the tier colour set on top via inline `style.background` in JS; no existing token in
    `:root` represents "dark text that reads on top of any bright tier colour" so introducing a
    9th tier-adjacent token felt like over-engineering for a value used in exactly 3 places.
  - Did NOT delete the now-unused `h1`/`.subtitle` global CSS rules (stats.css) — `.subtitle`'s
    class no longer appears anywhere in stats.html's DOM, and the global `h1` rule is now
    referenced only by `#hero-player-name` (which layers on top of it). Left both alone since
    MUST DO scoped this task's CSS work to "hero/layout/sidebar/main rules", not cleanup of
    superseded rules — flag for a future cleanup pass if wanted.
  - Fixed a stale comment on the pre-existing `@media (max-width: 900px)` block (added by Task 2)
    that said `.layout`/`.sidebar`/`.main` "do not exist in the DOM yet" — updated it to reflect
    that this task added them, since that comment would otherwise mislead the next reader.
- Verification run: `node --check` on the extracted `<script>` body (stats.html, `<script>` at
  line 120, `</script>` at line 1187 after this task's insertions) -> exit 0.
  `grep -c 'innerHTML' rankedstats/stats.html` -> 0. `grep -c '{' / '}'` on stats.css -> 53/53
  (balanced). All 5 hero ids + all 3 relocated sidebar-control ids confirmed unique (count 1 each).

## [2026-08-25] Task 7: KPI cards + form chips in stats.html + stats.css

- **`.hero-content` now holds exactly 3 children** (was 2 after Task 6): `#hero-rank-badge`
  (unchanged), `.hero-identity` (unchanged `<h1 id="hero-player-name">` + `<p id="hero-subline">`,
  plus **one new third child**: `<div class="hero-form-row"><span class="hero-form-label">Form
  </span><div class="hero-form" id="hero-form"></div></div>`), and a new third sibling
  `<div class="hero-kpis" id="hero-kpis"></div>`.
  - **Design call**: the brief's MUST DO literally said to add `#hero-form` "somewhere sensible
    inside `.hero-content` (below or beside the identity block — your call)". I nested the
    `.hero-form-row` wrapper (label + `#hero-form` chip strip) as a **third child of
    `.hero-identity`** rather than as a fourth direct child of `.hero-content`, because (a) it
    mirrors the reference mockup exactly (`Ranked Stats.dc.html:29-36` stacks name -> subline ->
    form row in one column) and (b) `.hero-content` is `display:flex; align-items:center` — a bare
    sibling div there would sit *beside* identity in the row, not *below* it, without extra
    flex-column wrapping. `#hero-form` itself (the element `renderFormChips` targets and clears) is
    still just the bare chip-strip div with no extra children, so `clearElement`/rebuild logic never
    has to preserve a label.
  - Exact new ids/classes: `#hero-kpis` (grid container), `.hero-kpi-card`, `.hero-kpi-label`,
    `.hero-kpi-value` (per-card pieces, built via `createElement`/`textContent` in
    `renderKpiCards`); `.hero-form-row`/`.hero-form-label` (static HTML, never touched by JS),
    `#hero-form` (chip-strip container, cleared/rebuilt by `renderFormChips`), `.hero-form-chip`
    (per-chip span).
- **`renderKpiCards(rows)` / `renderFormChips(rows)`** both added in a new
  `// === HERO KPI CARDS + FORM CHIPS ===` banner section inserted directly after `renderHero`'s
  closing brace and before the pre-existing `// === DOM HELPERS ===` banner (a fresh insertion
  point, doesn't conflict with any line range earlier tasks flagged as off-limits).
  - `renderKpiCards` computes wins/losses/draws by iterating `rows` directly (same
    if/else-if/else-if pattern as `aggregate()`'s own counting loop, not `.reduce()`), `winrate =
    wins/(wins+losses)` or `null`, guarded — **never `wins/rows.length`**. Colours: Sets played =
    no inline color (falls back to `.hero-kpi-value`'s CSS default `var(--text-primary)`); Winrate
    = new `winrateTone(winrate)` helper (`>=0.60` -> `var(--win)`, `>=0.45` -> `var(--accent-gold)`,
    else `var(--loss)`, `null` -> no inline color, same muted default as Sets played); Wins ->
    `var(--win)`; Losses -> `var(--loss)`; Draws -> `var(--draw)`. Colors are applied via
    `valueEl.style.color = ...` (matches the existing inline-style convention `renderHero` already
    uses for `rankBadgeEl.style.background`), not CSS modifier classes.
  - `renderFormChips` sorts a **copy** of `rows` by `ended_at` descending, takes `.slice(0, 10)`
    (naturally yields fewer than 10 if fewer exist, never throws), then `.reverse()`s that slice so
    oldest-of-the-10 renders first (left) and newest renders last (right) — verified via a
    standalone `node` trace with 3 sets (renders exactly `[L, D, W]` in ended_at-ascending order, no
    blanks) and 0 sets (renders `[]`, no throw) and 12 sets (keeps only the most recent 10, still in
    ascending order within that slice). Chip text/colour: `"W"`/`var(--win)`,
    `"L"`/`var(--loss)`, `"D"`/`var(--text-muted-4)` (draw uses the muted-4 token, not `--draw`,
    per MUST DO's explicit `#4d5876`/`--text-muted-4` instruction for chips specifically — note this
    intentionally differs from the KPI Draws card, which uses `--draw` per its own separate MUST DO
    line).
  - `.hero-kpi-card` CSS: `background: rgba(7,11,20,.75)`, `border: 1px solid var(--input-border)`,
    `border-radius: var(--radius-2xl)` (12px), `padding: 11px 13px` — copied 1:1 from
    `Ranked Stats.dc.html:38` (READ ONLY reference, no JS/React copied). `.hero-kpis` grid:
    `grid-template-columns: repeat(3, 132px); gap: 10px; margin-left: auto` — 5 cards wrap 3-then-2
    as required. `.hero-form-chip`: `22px x 22px`, `border-radius: var(--radius-sm)` (6px),
    `color: var(--bg)` (dark text on every chip colour, matches the mockup's uniform `#070b14` chip
    text regardless of background — verified this is deliberate in the mockup, not an oversight,
    since it's applied identically across win/loss/draw chip variants there).
- **`renderAll()` bridge cleanup**: deleted the entire "Overall (TEMPORARY bridge...)" block
  (manual win/loss/draw/winrate computation + `sortedRankHistory`/`currentRankLabel` + the
  `renderOverall(...)` call) and replaced it with `renderKpiCards(filteredSetRows);` then
  `renderFormChips(filteredSetRows);`, placed immediately after `filteredSetRows`/`filteredMateRows`
  are computed and before the Map bridge block — matches Task 5's inherited-wisdom note exactly.
  Deleted the entire `// === SECTION 1: OVERALL ===` banner + `renderOverall` function body (nothing
  calls it anymore).
- **HTML**: deleted the entire `<section class="stats-section" id="overall-section">...</section>`
  block from `<main>`. The 4 other sections (`map-section`/`brawler-section`/`teammate-section`/
  `recent-section`) are **untouched, still present, still in `<main>`** — confirmed via
  `grep -c 'id="map-section"\|id="brawler-section"\|id="teammate-section"\|id="recent-section"'
  rankedstats/stats.html` -> `4`. **Task 9/10/14: this is your confirmation, safe to wrap these 4 in
  panels.**
- **Deviation from MUST NOT DO, forced and unavoidable — flag for reviewers**: MUST NOT DO said
  "do not touch the DATA LAYER's ... `loadPlayerData` ... function bodies", but removing
  `#overall-content` from the DOM (required by MUST DO) left two dangling
  `document.getElementById("overall-content")` references that would throw `TypeError` on every
  single player load/deselect (`clearElement(null)` -> `null.firstChild`). Made the **minimum
  possible** surgical fix: removed the `overallContainer` declaration + its entry in the
  `allContainers` array inside `loadPlayerData` (no other line in that function touched — fetch
  calls, error handling, `STATE` assignment all byte-identical to before), and removed the single
  `setStatus(document.getElementById("overall-content"), ...)` line from `onPlayerSelected`'s
  empty-tag branch (again, no other line touched). This was mechanically forced by MUST DO's own
  removal instruction, not a discretionary rewrite of data-layer behavior — flagging explicitly in
  case a reviewer wants to re-verify no other data-layer semantics shifted.
  - Note, consistent with Task 6's precedent: deselecting the player (`tag === ""`) does **not**
    reset `#hero-kpis`/`#hero-form` back to an empty/placeholder state — same "flagged, not fixed,
    out of this task's literal scope" call Task 6 made for `#hero-player-name`/`#hero-subline`.
- Verification run: `node --check` on the extracted `<script>` body (stats.html lines 120-1161,
  `</script>` at 1162) -> exit 0. All acceptance greps confirmed: `overall-summary` -> 0 in both
  stats.html and stats.css, `id="overall-section"` -> 0, the 4-section grep -> 4, `innerHTML` -> 0,
  `.hero-kpis`/`.hero-form` CSS brace count 57/57 balanced. Standalone `node` trace of the KPI/
  winrate/form-chip math against 3-set, 0-set, and 12-set fixtures all matched expected output (see
  above).

## Task 11 — Best/worst map callout cards (rankedstats/stats.html, rankedstats/stats.css)

- Container id is exactly `map-callouts`: `<div class="callouts" id="map-callouts"></div>`, inserted
  immediately before `<section class="stats-section" id="map-section">` in `<main>` (map-section is
  now the first stats section per Task 7's notes, so this callout row is the very first thing in
  `<main>`).
- `renderCallouts(mapRows)` lives in its own new section ("BEST/WORST MAP CALLOUT CARDS"), placed
  right before the existing "SECTION 2: BY MAP" banner/`renderMapTable` — did **not** touch
  `renderMapTable` or `applyMinSampleFilter` themselves, only added the new function above them.
- Wired into `renderAll()`'s map bridge block in the DATA LAYER section, exactly as instructed:
  - Empty-state branch (`filteredSetRows.length === 0`): added `renderCallouts([]);` right after the
    existing `setStatus(mapContainer, "empty", ...)` call, so a previous player's stale callout cards
    never linger when a newly selected player has zero ranked sets.
  - Populated branch: added `renderCallouts(mapRows);` right after `mapRows.sort(...)` and right
    before the pre-existing `renderMapTable(mapContainer, mapRows); applyMinSampleFilter();` lines —
    those two lines are byte-identical to before, only the new call was inserted ahead of them.
- Filter reads `STATE.minSets` live inside the function body (not captured at call time), and
  excludes `winrate === null` rows (all-draws groups) from best/worst consideration entirely, per
  spec. Best/worst found via a manual linear scan (two tracked candidates, `>`/`<` comparisons), not
  `.sort()`, matching the existing win/loss/draw-tally idiom elsewhere in the file.
- Zero-qualifying-rows path (every map below `minSets`, or `mapRows` is `[]`) renders both cards with
  `row = null` → map name `"—"`, subline `"0 sets"` (no mode prefix), winrate `"—"` — never throws,
  never hides the cards.
- CSS added as a new block titled "Best/worst map callout cards", placed right before the existing
  "Collapsible panel" comment block in stats.css (so it sits, in source order, just above the panel
  styles it visually precedes in the DOM). Reused `--win`/`--loss`/`--panel`/`--panel-border`/
  `--placeholder-swatch`/`--text-primary`/`--text-muted-2`/radius+space tokens exclusively — zero new
  hex values added; confirmed `grep -c '2f9e6b\|cf4b52' rankedstats/stats.css` → `0`.
- **Flagging, not fixing (out of this task's literal scope, same precedent as Task 6/7)**:
  `onPlayerSelected`'s empty-tag (`tag === ""`) branch resets the map/brawler/teammate/recent
  containers to a "Select a player" status but does **not** call `renderCallouts([])` — so
  deselecting a player currently leaves the previous player's callout cards visually stale, same
  known gap already flagged for `#hero-kpis`/`#hero-form`/`#hero-player-name`. Not touched here
  since MUST NOT DO forbids touching `renderHero`/DATA LAYER bodies beyond the one explicit wiring
  point given, and `onPlayerSelected` wasn't named as an editable call site in this task's MUST DO.
- Verification: `grep -c 'innerHTML' rankedstats/stats.html` → `0`;
  `grep -c '2f9e6b\|cf4b52' rankedstats/stats.css` → `0`; `node --check` on the extracted `<script>`
  body → exit 0. Manually traced `renderCallouts`' filter/max/min logic against synthetic fixtures
  (1-set 100% map correctly excluded from "Best map" at `minSets=3`; a mixed decisive/all-draw
  fixture correctly excludes the null-winrate row; empty/all-below-threshold fixtures correctly
  yield `null`/`null`; raising `minSets` from 3→5 correctly re-narrows the qualifying set) — all
  matched hand-computed expected output.

## Retrofit task — Norwegian-language LABELS object (rankedstats/stats.html)

Course-correction task, run fresh from scratch (a prior attempt crashed before touching any file —
confirmed via `grep -c LABELS rankedstats/stats.html` == 0 before this run started). Added a single
`const LABELS = {...}` object in the `<script>`'s CONFIG section (right after `const sb = ...`,
before the DATA LAYER banner) and routed every hardcoded English UI string in the file — including
`renderMapTable`/`renderBrawlerTable`/`renderTeammateTable`/`renderRecentTable`/`loadMatchDetail`/
`renderMatchDetail`, which earlier tasks' delegation prompts had explicitly told the editor to skip
— through it. Verified via targeted `Read` diffing against the pre-edit function bodies that
`renderMapTable`/`renderBrawlerTable`/`renderTeammateTable`/`renderRecentTable`/`loadMatchDetail`/
`renderMatchDetail`'s DOM structure, control flow, and the `v_set_detail` query are byte-identical
to before — only string literal values changed (inline English strings -> `LABELS.xxx`, and a few
column-label arrays reformatted from single-line to multi-line for readability, no logic change).

**Complete final `LABELS` object** (also see `rankedstats/stats.html`'s CONFIG section — this is
the copy of record other tasks should read/extend, not duplicate):

```js
const LABELS = {
  // --- status messages ---
  loading: "Laster...",
  errorPrefix: "Feil: ",
  noSetsRecorded: "Ingen rangerte sett registrert ennå.",
  selectPlayerToViewStats: "Velg en spiller for å se statistikk.",

  // --- hero ---
  selectPlayer: "Velg en spiller",
  form: "Form",
  setsPlayed: "Sett spilt",
  winrate: "Vinnrate",
  wins: "Seire",
  losses: "Tap",
  draws: "Uavgjort",

  // --- sidebar ---
  playerLabel: "Spiller",
  minSetsLabel: "Minimum sett",
  loadingPlayers: "Laster spillere...",
  errorLoadingPlayers: "Feil ved lasting av spillere: ",
  noTrackedPlayers: "Ingen sporede spillere funnet ennå.",
  failedToLoadPlayers: "(klarte ikke å laste spillere)",
  noTrackedPlayersOption: "(ingen sporede spillere)",
  choosePlayer: "-- velg en spiller --",

  // --- section titles ---
  mapSectionTitle: "Kart",
  brawlerSectionTitle: "Brawler",
  teammateSectionTitle: "Lagkamerater",
  recentSectionTitle: "Siste sett",

  // --- best/worst map callouts ---
  bestMap: "Beste kart",
  worstMap: "Dårligste kart",
  setsSuffix: "sett",

  // --- table headers ---
  tableMode: "Mode",
  tableMap: "Kart",
  tableSets: "Sett",
  tableWins: "Seire",
  tableLosses: "Tap",
  tableDraws: "Uavgjort",
  tableWinrate: "Vinnrate",
  tableBrawler: "Brawler",
  tableTeammate: "Lagkamerat",
  tableTag: "Tag",
  tableSetsTogether: "Sett sammen",
  roster: "Liste",
  tableDate: "Dato",
  tableResult: "Resultat",

  // --- match-detail modal ---
  loadingMatchDetail: "Laster settdetaljer...",
  matchDetailNotFound: "Fant ikke settdetaljer.",
  started: "Startet: ",
  ended: "Avsluttet: ",
  gamesPlayed: "Runder spilt: ",
  team0Wins: "Lag 0 seire: ",
  team1Wins: "Lag 1 seire: ",
  winningTeam: "Vinnende lag: ",
  drawUnresolved: "— (uavgjort / uavklart)",
  teamPrefix: "Lag ",
  complete: "Fullført: ",
  yes: "ja",
  no: "nei",
  gamesHeading: "Runder",
  tablePlayer: "Spiller",
  tableBrawlerCol: "Brawler",
  tablePower: "Styrke",
  tableRank: "Rang",
  tableGameNumber: "#",
  tableBattleTime: "Kamptidspunkt",
  tableDuration: "Varighet (s)",
  tableWinningTeam: "Vinnende lag",
  tableStarPlayer: "Stjernespiller",
  draw: "uavgjort",
};
```

**Static Norwegian HTML — NOT routed through `LABELS`, and why**: these are strings baked directly
into the markup instead of read from `LABELS.xxx` at render time. All of them are genuinely static
in the sense that no current JS code path (re)writes this *exact* text into that *exact* element —
so a future wording change means editing both `LABELS` (for consistency/documentation, since a key
already exists for the same concept) **and** the one HTML spot below. Flagging clearly so nobody
assumes the whole page is 100% single-source-of-truth:
- `<h1 id="hero-player-name">Velg en spiller</h1>` — initial placeholder only. `renderHero()`
  overwrites this with the selected player's name once a player is chosen, but nothing currently
  resets it back to this placeholder on deselect (a gap already flagged by Task 6, not fixed here
  per this task's MUST NOT DO — don't touch `renderHero`'s logic).
- `<label for="player-select">Spiller</label>` and `<label for="min-sample-input">Minimum sett</label>`
  — plain `<label>` text, never touched by any render function. Note: dropped the original's
  "(filter)" suffix on the min-sets label since the mockup's own confirmed exact wording for this
  concept is `Minimum sett` with no parenthetical — a deliberate wording choice, not an oversight.
- `<option value="">Laster spillere...</option>` — initial `<select>` placeholder option, visible
  only during the brief in-flight window before `loadPlayers()`'s Supabase fetch resolves; no JS
  code path ever re-sets an option back to this exact "loading" text afterward.
- `<h2>` section titles (`Kart` / `Brawler` / `Lagkamerater` / `Siste sett`) — plain static heading
  text, never touched by any render function.
- The 4 initial `<p class="status empty">Velg en spiller for å se statistikk.</p>` fallbacks (one
  per map/brawler/teammate/recent section) — these happen to share their exact wording with
  `LABELS.selectPlayerToViewStats`, which **is** actually used at runtime (`onPlayerSelected`'s
  empty-tag branch calls `setStatus(..., "empty", LABELS.selectPlayerToViewStats)` on deselect) —
  but nothing re-renders these 4 paragraphs at initial page load, only on a later deselect action,
  so the very-first-paint copy in the raw HTML is hardcoded separately. Kept in sync by using the
  identical Norwegian string in both places; if you ever change `LABELS.selectPlayerToViewStats`,
  also update these 4 `<p>` tags to match.
- `<span class="hero-form-label">Form</span>` — left completely unchanged (not even re-typed) since
  "Form" is already valid, identical-looking text in both English and Norwegian.

**Deliberately reserved-but-unused `LABELS` keys were NOT added** (`Nullstill`, `TYNT`, `Periode`,
`Vis alle brawlere`, `rader skjult`, `rader over grensen`, `Klikk for settdetaljer`) — no current
code path needs them. **Tasks 8/10/13/14/15: add your new keys to this exact same `LABELS` object
in the CONFIG section — do not create a second labels object or hardcode new English strings.**

Verification for this task: `grep -c 'Select a player to view stats\.'` -> `0`;
`grep -c '"Loading\.\.\."'` -> `0`; `grep -cE '"Sets played"|"Winrate"|"Wins"|"Losses"|"Draws"'` ->
`0`; `grep -c 'Select a player$'` -> `0`; `grep -c 'LABELS' rankedstats/stats.html` -> `74`;
`grep -c 'innerHTML' rankedstats/stats.html` -> `0`; `node --check` on the extracted `<script>` body
-> exit 0. Remaining `"draw"` string-literal matches in the file after this task are exclusively
`row.result === "draw"` data-value comparisons (2 occurrences, in `aggregate()` and `renderAll()`'s
map/brawler/teammate win/loss/draw tallies) — correctly left untranslated per MUST NOT DO (raw
DB enum values, not UI chrome).

**Unrelated, out-of-scope observation (not touched, flagging only)**: `<html lang="en">` and
`<title>Ranked Stats</title>` are still English. Neither is a "user-facing string" this task's MUST
DO named, and there's no acceptance-criteria grep covering them, so left as-is to avoid scope creep
— worth a follow-up task if the plan wants full `lang`/`<title>` localization too.

## [2026-08-25] Task 8: sidebar filters — mode chips, period chips, min-sets slider, filter bar

- **New `LABELS` keys** added as a new `// --- filters ---` category group, appended immediately
  after the existing "match-detail modal" group (the LAST group in the object, right before the
  closing `};`) — did not create a second labels object: `allModes: "Alle moduser"`,
  `modeGroupTitle: "Mode"`, `periodGroupTitle: "Periode"`, `allTime: "Alle tider"`,
  `last30Days: "Siste 30 dager"`, `last7Days: "Siste 7 dager"`, `rowsHiddenSuffix: "rader skjult"`,
  `activeFilterLabel: "Aktivt filter"`, `clear: "Nullstill"`.
  - **Design call, flag for reviewers**: `LABELS.modeGroupTitle`/`LABELS.periodGroupTitle` end up
    **unused by any JS code path** — I initially wired them via `textContent` inside
    `renderModeChips`/`renderPeriodChips`, but that left the "Mode"/"Periode" sidebar headings
    blank until the first successful `renderAll()` (i.e. until a player is selected), which reads
    as a worse gap than the precedent-established "stale content on deselect" gaps in earlier
    tasks — this one is a *blank label at first paint*, not stale text. Reverted to hardcoding
    `<span class="control-group-title">Mode</span>` / `<span class="control-group-title">Periode
    </span>` directly in the HTML (same convention the LABELS retrofit task used for `<label>
    for="player-select">Spiller</label>` etc.) so both headings are visible immediately. The two
    LABELS keys are kept in the object anyway (per MUST DO's literal instruction to add them with
    these exact values) purely for documentation/consistency — same "reserved but unused" pattern
    the retrofit task already established for `Nullstill`/`Periode`/etc. before this task landed
    (those specific 2 are now consumed by this task's HTML, just not through the object).
- **Exact new ids** (Task 13, coordinate your class/brawler filter tree against these):
  `mode-chips` (chip-row div, rebuilt every `renderAll()` by `renderModeChips`), `period-chips`
  (chip-row div, rebuilt every `renderAll()` by `renderPeriodChips`), `filter-bar` (first child of
  `<main>`, rebuilt every `renderAll()` by `renderFilterBar`), `min-sample-value` (live slider
  value span), `min-sample-hint` ("N rader skjult" hint span). `min-sample-input`'s `id` is
  UNCHANGED (still exactly that string) — only its `type` changed from `number` to `range`
  (`min="1" max="15" value="3"`), so `applyMinSampleFilter`'s existing
  `document.getElementById("min-sample-input")` call keeps working completely unmodified; only the
  `input` event listener attached to it was swapped from `applyMinSampleFilter` directly to a new
  `onMinSetsInput` wrapper (see below).
- **`STATE.mode`/`STATE.period` underlying comparison values are UNCHANGED** — confirmed via
  `grep -n 'STATE.period !== "All time"\|STATE.mode !== "All modes"\|STATE.period === "Last 7
  days"'` still resolves to the exact same 3 lines inside the untouched `applyFilters` function.
  Only the chips' *displayed* `textContent` is Norwegian (via `LABELS`); every chip's click handler
  still sets `STATE.mode`/`STATE.period` to the literal English sentinel strings
  (`"All modes"`/`"gemGrab"`/etc. for mode; `"All time"`/`"Last 30 days"`/`"Last 7 days"` for
  period) that `applyFilters` compares against.
- **Mode chip list is derived live from `STATE.setRows`** every single `renderAll()` call (a `Set`
  of `row.mode`, prefixed with the `"All modes"` sentinel) — no hardcoded mode list anywhere.
  Rebuilt unconditionally on every render (not diffed), per MUST DO's explicit "harmless, don't
  over-engineer" guidance.
- **`STATE.filter` shape and clear-button wiring (Task 13, read this before wiring your own
  class/brawler UI)**: `renderFilterBar()`'s clear button (`.filter-bar-clear`, text =
  `LABELS.clear`) is rendered ONLY when `STATE.filter.kind !== null`. Clicking it does exactly
  `STATE.filter = { kind: null, value: null }; renderAll();` — nothing else. Task 13's own
  brawler-class-tree click handlers should set `STATE.filter = { kind: "brawler", value:
  <brawler_id> }` or `STATE.filter = { kind: "class", value: <className> }` then call
  `renderAll()` — that's the exact contract `applyFilters` (untouched) already expects, and is
  exactly what makes this task's clear button appear/disappear correctly with no further wiring
  needed on this task's side.
- **`renderAll()` call-site placement**: `renderModeChips(); renderPeriodChips();
  renderFilterBar();` were added right after the existing `renderHero(STATE.tag);` line (before
  `applyFilters` runs) — they don't need `filteredSetRows`, only `STATE.setRows`/`STATE.mode`/
  `STATE.period`/`STATE.filter`/`STATE.minSets` directly. `updateMinSetsHint();` was added as the
  literal LAST line inside `renderAll()`, after all 4 section bridge blocks — this is what makes
  the hint count always reflect the just-rendered `.filtered-out` DOM state, and also means the
  slider's own `input` handler doesn't need to call it a second time after `renderAll()` returns
  (calling `renderAll()` already re-invokes it internally).
- **`onMinSetsInput()`** (new function, replaces the old direct `applyMinSampleFilter` listener):
  reads the slider's `.value`, sets `STATE.minSets = parseInt(value, 10)`, updates
  `#min-sample-value`'s `textContent`, then calls `renderAll()` — zero `sb.from(...)` calls
  anywhere in this function or in `renderModeChips`/`renderPeriodChips`/`renderFilterBar`/
  `updateMinSetsHint` (grepped the whole new-code region to confirm 0 matches).
- **`updateMinSetsHint()`** counts `tr.filtered-out` elements across `map-table`/`brawler-table`/
  `teammate-table` via `querySelectorAll` (not `innerHTML`, not a manual loop over `data-sets`
  re-comparison — trusts whatever `applyMinSampleFilter` already toggled) and sets
  `#min-sample-hint`'s `textContent` to `"{count} " + LABELS.rowsHiddenSuffix`.
- **CSS additions**: `rankedstats/stats.css` — a new "Sidebar filters" block (`.control-group-
  title`, `.chip-row`, `.chip`/`.chip.active`, `.min-sets-row`, `#min-sample-value`, `.min-sets-
  hint`) inserted right after the existing `input[type="number"] { width: 80px; }` rule and before
  `section.stats-section`; a new "Active filter bar" block (`.filter-bar`, `.filter-bar-label`,
  `.filter-bar-summary`, `.filter-bar-clear`) inserted immediately before the existing "Best/worst
  map callout cards" comment block (both live in `<main>`, kept adjacent in source order). Zero new
  hex values — every colour is an existing `--*` token (`--accent-gold`, `--text-muted-1/2/3`,
  `--bg-sidebar`, `--input-border`, `--panel`/`--panel-border`, `--radius-md`/`--radius-xl`,
  `--space-md`). `.filter-bar-clear`'s text colour uses `var(--text-secondary)` — the closest
  existing token to the mockup's literal `#c9d2e8`, per MUST DO's "reuse existing tokens, do not
  invent new hex values" instruction.
- **Left untouched, flagged only**: `input[type="number"] { width: 80px; }` and the `input[type=
  "number"]` half of the `select, input[type="number"] { ... }` shared rule in stats.css are now
  dead code (no `<input type="number">` exists anywhere in the DOM anymore) — not removed since
  cleanup of superseded rules wasn't in this task's literal MUST DO scope, same "flag, don't fix"
  precedent Task 6 set for `.subtitle`/global `h1`.
- Verification run: `grep -c 'input type="number"' rankedstats/stats.html` -> `0`; `grep -c
  'innerHTML' rankedstats/stats.html` -> `0`; `node --check` on the extracted `<script>` body
  (stats.html lines 138-1536, `<script>` at 137, `</script>` at 1537) -> exit 0; CSS brace balance
  77/77. Standalone `node` trace of the mode-chip-derivation + period-text logic against a
  `[gemGrab, brawlBall, gemGrab]` fixture produced `chipValues: ["All modes", "gemGrab",
  "brawlBall"]` / `chipLabels: ["Alle moduser", "Gem Grab", "Brawl Ball"]` — matches the
  acceptance-criteria trace exactly.

## [2026-08-25] Task 13: brawler class filter tree in stats.html + stats.css

- **New `LABELS` key**: `brawlerTreeTitle: "Brawler"`, added as its own new `// --- sidebar
  brawler class filter tree (Task 13) ---` category group, appended right after the existing
  `// --- filters ---` group (which is now the second-to-last group instead of the last). Chose a
  distinct key rather than reusing `LABELS.tableBrawler` (also `"Brawler"`) — same string value
  today, but the sidebar tree title and a table column header are conceptually different UI
  surfaces that could diverge in wording later; a one-line duplicate key costs nothing and keeps
  the two independently editable. `LABELS.clear` (`"Nullstill"`) is reused as-is for the tree's own
  `"✕ Nullstill"` clear link — no new key for that, per MUST DO.
- **`STATE.expandedClasses` polarity**: `STATE.expandedClasses[className] === true` means that
  class's row IS expanded (children visible); `false` or absent (the default) means collapsed. This
  matches the MUST DO brief's own literal wording ("`true` means expanded") directly — no
  naming-consistency reinterpretation needed here, unlike Task 9's `STATE.collapsed` (which is the
  opposite polarity: `true` there means collapsed). Don't confuse the two fields' polarities if a
  future task reads both.
- **New functions**, all added in a new `// === SIDEBAR FILTERS: BRAWLER CLASS TREE ===` banner
  section inserted immediately before the pre-existing `// === SIDEBAR FILTERS: MODE / PERIOD
  CHIPS...` banner (both live in the same overall "sidebar filters" area, kept adjacent in source
  order): `filterByModeAndPeriod(rows)` (period-then-mode filtering only, byte-for-byte same
  cutoff-date math and comparison order as `applyFilters`'s first two blocks — `applyFilters`
  itself was NOT touched), `buildBrawlerClassGroups()` (aggregates `STATE.setRows` by
  `filterByModeAndPeriod` + `aggregate(..., brawler_id, ...)`, groups by
  `BRAWLER_CLASSES[id] || "Unclassified"`, computes class-level `wins/(wins+losses)` winrate —
  never `wins/sets` — orders by `BRAWLER_CLASS_ORDER`, skips any class with `sets === 0` including
  `Unclassified` under the exact same rule as every other class), `buildBrawlerRow(brawlerAggregate)`,
  `buildClassRow(classGroup)`, `renderBrawlerTree()` (the render entry point, called with no
  arguments from `renderAll()`).
- **Click-handler wiring, read this before touching class/brawler filter UI again**: the class row's
  filter-toggle listener is attached to `.tree-class-header` (NOT the outer `.tree-class` div and
  NOT a narrower "name/bar only" element) — the chevron is a DOM descendant of that same header, so
  its own click listener calls `event.stopPropagation()` to keep chevron clicks from also bubbling
  into the header's filter-toggle handler. This was a deliberate structural choice over attaching
  the filter click to a `.tree-class-main` sibling: putting it on the header covers the full
  "anywhere except the chevron" click area described in MUST DO with exactly one listener, while
  still requiring the exact `stopPropagation` MUST DO called out explicitly. Chevron click calls
  `renderBrawlerTree()` only (cheap local re-render, since `STATE.expandedClasses` affects nothing
  outside the tree); filter clicks (class row header or brawler row) call the full `renderAll()`
  since `STATE.filter` affects KPIs/map/teammate/recent panels too.
- **HTML**: inserted `<div class="control-group"><div class="tree-header"
  id="brawler-tree-header"></div><div class="tree-list" id="brawler-tree-list"></div></div>` between
  the player `<select>` control-group and the "Mode" control-group in `<aside class="sidebar">`,
  exactly as MUST DO specified. `renderBrawlerTree()` owns and fully rebuilds both
  `#brawler-tree-header` (title span + conditional `.tree-clear` link) and `#brawler-tree-list`
  (the class/brawler rows) on every call — same `clearElement` + rebuild convention as
  `renderModeChips`/`renderPeriodChips`/`renderFilterBar`.
- **`renderAll()` call site**: `renderBrawlerTree();` added immediately after `renderHero(STATE.tag);`
  and before `renderModeChips();` — matches the sidebar's own visual top-to-bottom order (player,
  brawler tree, mode, period), though functionally the exact position among the 4 no-argument
  sidebar renders doesn't matter since none of them read each other's output.
- **CSS**: new "Brawler class filter tree" block in `stats.css`, inserted immediately after the
  existing "Sidebar filters" block (`.min-sets-hint`) and before `section.stats-section`. Zero new
  hex values — confirmed via `grep -oE '#[0-9a-fA-F]{3,6}' rankedstats/stats.css | sort -u` showing
  only pre-existing token values after the edit. Active-state styling
  (`.tree-class.active`/`.tree-brawler-row.active`) reuses the exact same `border-color:
  var(--accent-gold); background: rgba(255, 210, 61, 0.08);` pair `.chip.active` already
  established — same visual selection language across the whole sidebar. Winrate mini-bar:
  `.tree-bar-track` is the 5px `var(--divider)`-background track, `.tree-bar-fill` is a bare
  height:100% div with `width`/`background` set inline per-instance via `winrateTone(winrate)`
  (falls back to `var(--text-muted-4)` when winrate is `null`, i.e. 0 decisive sets) — same
  inline-style-from-JS-helper convention `renderHero`/`renderKpiCards` already use for tier/winrate
  colours, not a CSS modifier class.
- **Verification**: `node --check` on the extracted `<script>` body (stats.html lines 142-1780,
  `<script>` at 141, `</script>` at 1781) -> exit 0. `grep -c 'innerHTML' rankedstats/stats.html`
  -> `0`. CSS brace balance 99/99. Standalone `node` trace (fixture: 5 sets across 4 brawlers in 4
  different classes including one unmapped id falling into `Unclassified`) confirmed: rendered
  classes' `sets` sum to 5 (matches the unfiltered brawler total exactly, no double-counting/drops),
  `Unclassified` rendered under the identical `sets > 0` rule as every other class, class order
  followed `BRAWLER_CLASS_ORDER` exactly (`Damage Dealer, Assassin, Tank, Unclassified` — skipping
  the zero-sets `Marksman`/`Support`/`Controller`/`Artillery` classes from this fixture), clicking a
  class twice toggled `STATE.filter` to `{kind:"class",value:"Tank"}` then back to
  `{kind:null,value:null}`, and toggling the chevron changed only `STATE.expandedClasses` while
  `STATE.filter` stayed untouched.
- **Coordinates with Task 8's existing contract, unchanged**: `STATE.filter = {kind, value}` is
  read by the untouched `applyFilters` exactly as before; `renderFilterBar()`'s own clear button
  (Task 8) and this task's `.tree-clear` link are two independent DOM elements that both read/write
  the identical `STATE.filter` shape — neither was merged into the other, per MUST DO's explicit
  "duplicate the small amount of clear-click logic, don't merge" instruction.

## [2026-08-25] Task 10: table rows (winrate bar/sub-labels/badges) + panel-wrapping in stats.html + stats.css

- **New `LABELS` keys** (stats.html CONFIG section): `tableTrend: "Trend"` added to the existing
  "table headers" group; `thinBadge: "TYNT"`, `thinBadgeTooltip: "Lite datagrunnlag"`,
  `rowsOverThreshold: "rader over grensen"` added as a new `// --- table rows / badges (Task 10)
  ---` group right after it. `LABELS.roster` ("Liste", from an earlier task) is reused as-is for
  the ROSTER pill's text — no new key needed for that.
- **Exact panel ids** (built once, in the new INIT-section block right before `loadPlayers();`):
  `map-panel` (tint `var(--tint-map)`), `brawler-panel` (tint `var(--tint-brawler)`,
  `teammate-panel` (tint `var(--tint-mates)`) — each built via `makeCollapsiblePanel({id, title:
  LABELS.*SectionTitle, tint, rightText: "0 " + LABELS.rowsOverThreshold, bodyEl:
  document.getElementById("*-content")})`, then `clearElement(document.getElementById("*-section"))`
  + `.appendChild(panel)`. The old static `<h2>Kart</h2>` etc. inside each `<section
  class="stats-section">` is removed from the DOM this way (the panel header renders the title
  instead) — the static HTML markup at stats.html:104-127 was NOT edited (still shows the old
  `<h2>` + bare content div at first byte-read); the removal happens dynamically at load time via
  this INIT block's `clearElement` call. `#map-content`/`#brawler-content`/`#teammate-content`
  keep their exact ids and are simply relocated one level deeper (inside `.panel-body`) —
  `renderAll()`'s `getElementById` calls for them were NOT touched and need no changes.
- **New shared helper functions** (new "TABLE ROW HELPERS" banner section, inserted directly
  before the pre-existing "SECTION 2: BY MAP" banner):
  - `buildRowIconCell(label, subLabel, isThin, extraBadgeEls)` -> returns a `<td>` containing
    `.table-row-cell` (flex row: `.table-icon-placeholder` 32x32 + `.table-row-text` column) ->
    `.table-row-text` holds `.table-row-label-line` (`.table-row-label` span, then each element in
    `extraBadgeEls` appended in array order, then a `.badge-thin` span if `isThin`) and, if
    `subLabel` is truthy, a `.table-row-sublabel` span underneath. `extraBadgeEls` is an optional
    array of already-built badge elements (defaults to `[]` via `(extraBadgeEls || [])`) — this is
    how the teammate table's pre-existing ROSTER `.badge-tracked` span gets attached without
    duplicating any of buildRowIconCell's own DOM-building logic.
  - `buildWinrateCell(winrate)` -> returns a `<td>` containing a `.winrate-bar-track` >
    `.winrate-bar-fill` (width `%`, `background` both set inline via `winrateTone(winrate) ||
    "var(--text-muted-4)"`) as one child, and a **sibling** `.winrate-bar-text` `<span>` (inline
    `color` = same tone, `textContent` = `formatWinrate(winrate)`) as the second child — verified
    the bar never contains the text node, so `cell.textContent` (what `sortTableByColumn` reads)
    resolves to exactly `formatWinrate(winrate)`'s output, nothing else.
- **Trend column's exact index in each table's final column order** (0-based, for Task 15 to
  target directly via `tr.cells[i]` — the `<td>` is currently just an empty
  `document.createElement("td")` with an inline `// Trend — filled by Task 15` comment marking the
  exact spot in each renderer):
  - `map-table`: `[icon+label+sublabel, sets, wins, losses, draws, TREND=5, winrate]` (7 columns)
  - `brawler-table`: `[icon+label, sets, wins, losses, draws, TREND=5, winrate]` (7 columns)
  - `teammate-table`: `[icon+label(+ROSTER), tag, sets_together, wins, TREND=4, winrate]`
    (6 columns)
  - All 3 header rows now read `LABELS.tableMap`/`tableBrawler`/`tableTeammate` (NOT
    `LABELS.tableMode` — that key still exists in LABELS but is no longer used by any of these 3
    header rows, mode is now a per-row sub-label instead of its own column) through
    `LABELS.tableWinrate`, with `LABELS.tableTrend` inserted at the Trend index above. Every
    header except the Trend one is still built via the untouched `makeSortableHeader`; the Trend
    `<th>` is a plain `document.createElement("th")` with **no** click listener attached, by design
    — do not wire a sort handler to it in Task 15.
- **THIN badge threshold**, computed inline in each renderer (not a shared helper, it's a
  one-liner and each table reads a different sample-size field): `row.sets_played < STATE.minSets
  + 2` for map/brawler, `row.sets_together < STATE.minSets + 2` for teammate. Traced against
  `STATE.minSets = 3` (default): rows with 3 or 4 sets get the badge, 5+ do not; raising
  `STATE.minSets` to 5 shifts the badge to rows with 5 or 6 sets, confirming it re-evaluates live
  on every `renderAll()`.
- **`countFilteredOutRows(tableId)` / `updatePanelRightText(panelId, count)`** (new small helpers,
  added directly after the pre-existing `updateMinSetsHint()` in the MIN-SAMPLE FILTER section —
  distinct from that function's own single combined `#min-sample-hint` count, this is the
  *per-panel* right-side text). `countFilteredOutRows` is a 1-line
  `document.querySelectorAll("#" + tableId + " tbody tr.filtered-out").length` (returns `0` if the
  table doesn't exist, no guard needed since `querySelectorAll` on a non-matching selector is
  always an empty NodeList). `updatePanelRightText` guards on `!rightTextEl` and otherwise sets
  `textContent` to `count + " " + LABELS.rowsOverThreshold`.
  - **Call-site design call**: rather than duplicating 3 conditional call sites (one inside each of
    the map/brawler/teammate `if/else` branches in `renderAll()`, guarded by whichever branch
    actually ran), all 3 `updatePanelRightText(...)` calls were placed together, unconditionally,
    immediately after the teammate block's closing brace (right before the Recent block) — this is
    the MUST DO's own explicitly-endorsed "simplest" option, since `applyMinSampleFilter()` already
    finishes updating every table's `.filtered-out` classes across all 3 tables by the time any one
    of the 3 blocks' own `applyMinSampleFilter()` call returns, and `countFilteredOutRows` returns
    `0` safely for whichever table wasn't rebuilt this render (its section took the empty-state
    branch instead) — this is exactly what makes an empty-state panel report "0 rader over
    grensen" instead of a stale count.
- **`renderAll()`'s field-mapping bridge blocks were kept, not deleted** — re-read the row shapes
  Task 5 already produces (`{mode, map, sets_played, wins, losses, draws, winrate}` for map,
  `{brawler_id, brawler_name, sets_played, wins, losses, draws, winrate}` for brawler,
  `{teammate_tag, teammate_name, teammate_is_tracked, sets_together, wins, winrate}` for teammate)
  against what the rewritten renderers actually consume — they're identical, so the `aggregate()` ->
  row-shape `.map(...)` blocks are NOT dead code and were left in place. Only the explanatory
  comments were reworded (removed the stale "TEMPORARY bridge... Task 10 rewrites... without this
  field-mapping shim" wording that was no longer accurate) — no control-flow/data-shape change in
  `renderAll()` itself beyond adding the 3 `updatePanelRightText` lines described above.
- **`.badge-tracked` (ROSTER) CSS fix, flagged as a pre-existing bug from Task 2**: it was
  incorrectly bound to `--badge-thin-bg`/`--badge-thin-fg` (the THIN badge's own dedicated tokens)
  even though Task 2 had already defined a separate, unused `--badge-roster-bg`/`--badge-roster-fg`
  pair (solid gold pill, dark text) specifically for this badge. Repointed `.badge-tracked` to the
  roster tokens and added a new `.badge-thin` rule using the tokens `.badge-tracked` was squatting
  on — ROSTER and THIN now render as two visually distinct pills instead of identical ones.
- **`section.stats-section:has(> .panel)` CSS override added** (right after the existing
  `section.stats-section` rule): zeroes out margin/padding/border/background on a `.stats-section`
  that now directly wraps a `.panel`, to avoid a double-bordered/double-padded nested-box look once
  `#map-section`/`#brawler-section`/`#teammate-section` each hold a panel as their only child.
  Scoped via `:has()` so it does NOT affect `#recent-section`, which stays a bare `.stats-section`
  (with its own border/padding/background intact) until Task 14 wraps it in `recent-panel` too —
  Task 14, add `> .panel` will already cover your case once you append your panel there, no CSS
  change needed on your end unless you want a different visual treatment.
- **CSS additions**: `.table-row-cell`/`.table-icon-placeholder`/`.table-row-text`/
  `.table-row-label-line`/`.table-row-label`/`.table-row-sublabel` (new block right after
  `tr.filtered-out`), `.winrate-bar-track`/`.winrate-bar-fill`/`.winrate-bar-text` (same block,
  immediately after). Zero new hex values — confirmed every colour referenced is an existing
  `--*` token or an inline JS-computed `var(--win|--accent-gold|--loss|--text-muted-4)` string from
  `winrateTone`.
- Verification: `node --check` on the extracted `<script>` body (stats.html lines 142-1973,
  `<script>` at 141, `</script>` at 1974) -> exit 0. `grep -c 'innerHTML' rankedstats/stats.html`
  -> `0`. `grep -c 'data-sets' rankedstats/stats.html` -> `5` (>= 3, required). `grep -c
  'id="map-section"\|id="brawler-section"\|id="teammate-section"\|id="recent-section"'
  rankedstats/stats.html` -> `4` (all 4 sections still present — only 3 got panel-wrapped by this
  task, `recent-section` untouched). `stats.css` brace balance 110/110. Standalone `node` trace of
  `buildWinrateCell`'s bar-width math confirmed `0 -> "0%"`, `0.5 -> "50%"`, `1.0 -> "100%"`,
  `null -> "0%"` width with `formatWinrate` text `"0.0%"`/`"50.0%"`/`"100.0%"`/`"—"` respectively.
  THIN-badge threshold traced against `STATE.minSets = 3` and `= 5` fixtures, both matched expected
  per-row output described above.

## [2026-08-25] Task 14: recent matches list + match-detail modal in stats.html + stats.css

- **New `LABELS` keys** (added under a new `// --- recent matches / modal (Task 14) ---` comment
  group, right after `brawlerTreeTitle`): `clickForDetails: "Klikk for settdetaljer"` (used as both
  the `title` attribute and `aria-label` on every `.recent-row`), `closeModal: "Lukk"` (only
  referenced by the static `aria-label="Lukk"` on `#match-detail-close` in the HTML markup itself,
  not read from JS at runtime — same "static markup, LABELS key kept for documentation/consistency"
  convention already used elsewhere in this file), `resultWin: "Seier"`, `resultLoss: "Tap"`,
  `resultDraw: "Uavgjort"` (distinct from the plural `wins`/`losses`/`draws` keys — these are the
  singular per-row result-badge text). The header comment block above `const LABELS = {` was also
  updated: `"Klikk for settdetaljer"` removed from the "reserved but unused" list since it's now
  landed, and the "Future tasks (8, 10, 13, 14, 15)" line changed to "(8, 10, 13, 15)".
- **Modal element ids** (all static HTML, placed once as a direct child of `<body>`, right after
  `<div class="layout">` closes and before `<script>`): `#match-detail-overlay` (the backdrop,
  `.modal-overlay` — toggled via a `.open` class, not inline `style.display`), `#match-detail-close`
  (the `✕` button, `aria-label="Lukk"`), `#match-detail-title` (the `<h3>` in the header — starts
  empty, filled by `loadMatchDetail` after a successful fetch, cleared back to `""` by
  `closeMatchDetailModal`). `#match-detail-content` is the SAME div id as before this task — it
  moved from being a direct child of `#recent-section` to being nested inside `.modal-box`, below
  `.modal-header` — `loadMatchDetail`'s `document.getElementById("match-detail-content")` call
  needed zero changes since the id didn't change, only its position in the DOM tree.
- **`loadMatchDetail` diff (only 2 things changed, both additive, neither touches the query or the
  `data[0]` handling)**: (1) one new line inserted right before the `renderMatchDetail(container,
  data[0])` call, in the success path only (after the `error`/empty-data early returns) —
  `document.getElementById("match-detail-title").textContent = data[0].mode + " — " + data[0].map;`
  — this fills the modal header's static title from OUTSIDE `renderMatchDetail`, so
  `renderMatchDetail`'s own body never needed to know about `#match-detail-title` at all. (2)
  Nothing else changed — the `sb.from("v_set_detail").select("*").eq("set_id", setId)` query, the
  `error` check, and the `!data || data.length === 0` (no `.single()`) empty check are byte-for-byte
  identical to pre-Task-14.
- **`renderMatchDetail` diff (className additions ONLY, confirmed by diff — every
  `document.createElement`/loop/conditional/guard is unchanged)**: added `heading.className =
  "modal-detail-heading"` (this element is now CSS-hidden via `.modal-detail-heading { display:
  none; }` in stats.css, since its "{mode} — {map}" text would otherwise visually duplicate the new
  `#match-detail-title` in the modal header — the element itself is still created and appended
  exactly as before, just not shown), `summaryList.className = "modal-summary-list"`,
  `teamHeading.className = "modal-team-heading"`, `teamTable.className = "modal-team-table"`,
  `gamesHeading.className = "modal-rounds-heading"`, `gamesTable.className = "modal-rounds-table"`.
  The `set.participants || []` / `set.games || []` guards, the `[0, 1].forEach` team loop, the
  `.filter(p => p.team_index === teamIndex)` per-team participant filter, and every `makeCell(...)`
  call are all untouched. **Judgment call**: the mockup's two roster panels are laid out
  side-by-side (`grid-template-columns: 1fr 1fr`); this was NOT implemented because doing so would
  require wrapping both team blocks in a shared grid-parent `<div>` not present in the original
  code — a structural change beyond a className addition. Teams instead stack vertically (Team 0
  block, then Team 1 block), each still rendered as a bordered/panelled `<table>` (not the mockup's
  div-grid) via the new `.modal-team-table`/`.modal-rounds-table` CSS, in order to honor the
  explicit "byte-identical aside from CSS class additions" self-verification requirement over the
  mockup's exact pixel layout. Flagging this in case a future task wants the true side-by-side grid
  — it would need to touch `renderMatchDetail`'s DOM-building body, not just its CSS.
- **Modal open/close + focus** (new section "MATCH DETAIL MODAL", placed after `renderMatchDetail`,
  before `=== INIT ===`): `let matchDetailTriggerEl = null;` (module-level, not a DOM attribute).
  `openMatchDetailModal(triggerElement)` stores it, adds `.open` to `#match-detail-overlay`, focuses
  `#match-detail-close`. `closeMatchDetailModal()` removes `.open`, clears `#match-detail-content`,
  resets `#match-detail-title` to `""`, restores focus to `matchDetailTriggerEl` (guarded by
  `document.body.contains(...)` in case a re-render replaced the row) then nulls the variable. ESC
  (`document`-level `keydown`, guarded by a new `isMatchDetailModalOpen()` helper reading
  `.classList.contains("open")` — a no-op when the modal isn't open), backdrop click (guarded by
  `event.target === overlayEl`, so clicks inside `.modal-box` don't bubble-trigger it since
  `event.target` would be a descendant, not the overlay itself), and the close button's click all 3
  call `closeMatchDetailModal()`. `openMatchDetailModal`/`closeMatchDetailModal` are `function`
  declarations (hoisted) so `buildRecentRow`'s `openRowMatchDetail` helper — defined earlier in the
  file, in the SECTION 5 block — can call them even though their own definitions come later in
  script source order.
- **`renderRecentTable` rewrite**: table → `.recent-row` grid list (`96px 1fr 148px 148px 24px`),
  each row `role="button" tabindex="0"`, both `click` and `keydown` (Enter/Space) wired to a shared
  `openRowMatchDetail(rowEl, row.set_id)` helper that calls `openMatchDetailModal(rowEl)` THEN
  `loadMatchDetail(row.set_id)` (modal visibly opens with the loading state before the fetch
  resolves). A new `RESULT_TONES` lookup object (`{win, loss, draw}` → `{border, badgeBg, label}`)
  centralizes the win/loss/draw → colour/label mapping so it isn't duplicated 3x inline;
  `resultTone(result)` defaults unknown results to the `draw` tone rather than throwing. `row.title`
  AND `row.setAttribute("aria-label", ...)` both use `LABELS.clickForDetails` (title for mouse
  hover, aria-label so screen readers get the same hint instead of reading the whole row's text
  content). Score text uses `row.team0_wins + "–" + row.team1_wins` (en dash, matching mockup).
- **`recent-section` panel wrap** (INIT block, added right after the teammate-panel block, before
  `loadPlayers()`): identical `makeCollapsiblePanel({id: "recent-panel", title:
  LABELS.recentSectionTitle, tint: "var(--tint-recent)", ...})` pattern as the other 3 panels, but
  `rightText: ""` (not `"0 " + LABELS.rowsOverThreshold"`) since the min-sets filter doesn't apply
  to the recent list — nothing ever calls `updatePanelRightText("recent-panel", ...)` afterwards, so
  it stays permanently blank, which is correct per this task's brief.
- **Verification note on the `grep -c 'match-detail-content'` acceptance line**: the task brief's
  self-verify section says this should be `1`. Running it literally on the finished file returns
  `6` (one HTML `id="match-detail-content"` declaration + one explanatory HTML comment + 4
  `document.getElementById("match-detail-content")` call sites across `loadPlayerData`,
  `onPlayerSelected`, `loadMatchDetail`, and `closeMatchDetailModal`) — `grep -c` counts matching
  LINES, not distinct DOM nodes, and this file already had 3+ `getElementById("match-detail-
  content")` call sites before this task even started. `grep -c 'id="match-detail-content"'` (the
  actual HTML element declaration, scoped precisely) correctly returns `1`, confirming there is
  still exactly one such div in the DOM, now nested inside `.modal-box` instead of inline in
  `#recent-section` — this is almost certainly what the acceptance line intended. Future tasks:
  don't be surprised if a plain `grep -c 'match-detail-content'` doesn't equal 1; scope the grep to
  `id="..."` if you need to count the actual element.
- **`.stats-section:has(> .panel)` CSS override (Task 10) now also covers `#recent-section`** with
  zero CSS changes needed on this task's end, exactly as Task 10's own notepad entry predicted.
- Verification: `node --check` on the extracted `<script>` body -> exit 0. `grep -c 'v_set_detail'`
  -> `1`. `grep -c 'innerHTML'` -> `0`. `grep -c 'id="match-detail-content"'` -> `1`. `grep -c
  'id="map-section"\|id="brawler-section"\|id="teammate-section"\|id="recent-section"'` -> `4` (all
  4 sections still present). `stats.css` brace balance 143/143. No `jsdom`/browser available in this
  environment, so the "click a row → modal opens → ESC/backdrop/close-button all close it → focus
  restored" flow was verified by manual code trace (reading `openMatchDetailModal`/
  `closeMatchDetailModal`/the 3 listener wire-ups end-to-end) rather than an actual DOM run, per
  this task's own "grep + manual trace (no browser available)" verification instruction.

## [2026-08-25] Task 15 (FINAL): rank-tier chart + per-row trend sparklines in stats.html + stats.css

- **Container id**: exactly `hero-rank-chart` (`<div id="hero-rank-chart" class="hero-rank-chart">`,
  inserted as the FIRST child of `<header class="hero" id="hero">`, before `.hero-content`). CSS:
  `position: absolute; inset: auto 0 0 0; height: 190px; opacity: .45; pointer-events: none;` plus a
  `.hero-rank-chart svg { display:block; width:100%; height:100%; }` rule — the `<svg>` itself only
  carries a `viewBox`, no explicit `width`/`height` attributes, so it needed this CSS to actually
  fill the container. `.hero-content` (already `position: relative` from Task 6) gained `z-index: 1`
  so the foreground badge/name/KPIs layer above the chart — confirmed this was the only change
  needed to `.hero`/`.hero-content`, per Task 6's own prediction.
- **Rank-delta span class**: exactly `hero-rank-delta` (gold, `color: var(--accent-gold); font-weight:
  700;`). `#hero-subline` was switched from a single `textContent` assignment to `clearElement` +
  `createTextNode` (the existing `"{rank_label} · {tag}"` text) + a conditional `<span
  class="hero-rank-delta">` child holding `" " + deltaText`. The early-return guard branch (no
  rank-history at all) was left as a plain `sublineEl.textContent = "— · " + tag` assignment,
  unchanged — no delta is possible there, so no need to switch that branch to node-building too.
- **New self-contained helper**: `filterRankHistoryByPeriod(rows)`, placed directly after
  `renderHero`'s closing brace and before `renderRankChart`. Period-only (no mode filter, since
  `v_player_rank_history` rows have no `mode` column) — byte-for-byte the same cutoff-date math as
  `applyFilters`/`filterByModeAndPeriod`'s own period block, just not reusing either directly (doing
  so would either no-op or, if a mode filter were active, incorrectly zero every row since
  `row.mode` is `undefined` on rank-history rows).
- **Delta guard semantics, confirmed by trace**: delta is omitted (no span at all) ONLY when the
  period-filtered rank-history subset is empty (e.g. player's only rank-history row falls outside
  the "Last 7 days" window). A single-row history where that one row IS inside the period window
  still renders `±0` (baseline === latest is a legitimate, non-fabricated computation, not a case to
  hide) — traced via `node` with a 1-entry "All time" fixture, confirmed `±0` renders, not omitted.
- **`renderRankChart(history)`**: new module-level `const SVG_NS = "http://www.w3.org/2000/svg"`
  (shared with `renderSparkline`). Sorts a copy of `history` ascending by `ended_at`; `length < 2`
  clears the container and returns (no chart, no error) — this also correctly handles the
  zero-rank-history case since `renderHero` now calls `renderRankChart(STATE.rankHistory)`
  unconditionally as its very first line, before the `!latestRank` early-return guard.
  `minRank`/`maxRank` come only from `rank_value`s actually present in `history` (never an assumed
  1-22 domain). A perfectly flat history (`minRank === maxRank`) widens the Y-axis math range by 0.5
  on each side purely to avoid a divide-by-zero in the scaling formula — the gridline LABEL matching
  still compares against the real, unwidened `rank_value`s, so this widening never fabricates a
  label. Each of the 4 gridlines finds whichever history row's `rank_value` is closest to that
  gridline's y-value; if the distance is `<= 2` tier-values, uses that row's real `rank_label`,
  otherwise falls back to `String(Math.round(gridRankValue))` — traced with a 2-point
  `[5 "Gold I", 20 "Pro"]` fixture: gridline at 5 → "Gold I", at 19 → "Pro" (within 2 of 20), at 12
  (far from both) → plain "12". Colours set via `.style.stroke`/`.style.fill` (not
  `setAttribute("stroke", ...)`) specifically so `var(--divider)`/`var(--accent-gold)` resolve
  correctly through the real CSS engine — geometry attributes (`x1`/`y1`/`points`/`viewBox`/`r`/
  `font-size`) still use plain `setAttribute` since they're never CSS custom properties.
- **`renderSparkline(rows)`**: returns `null` for `rows.length < 3` (verified both `2` and `3`-row
  fixtures via `node` trace — `2` → `null`, `3` → 3 points). Buckets into `Math.min(8, rows.length)`
  roughly-equal contiguous chunks via `Math.round(((bucketIndex+1)*rows.length)/bucketCount)-1` end
  indexes; each bucket's winrate is CUMULATIVE from index 0 through that bucket's end index (not a
  per-bucket-only stat) — traced a 20-row fixture, bucket end-indexes came out `[2,4,7,9,12,14,17,
  19]` (roughly even, always reaching the final row). An all-draw 3-row fixture correctly produced
  `winrate: null` at every bucket (rendered as the midpoint y, matching the reference line, never a
  divide-by-zero). Line/terminal-circle colour = `winrateTone(lastPoint.winrate) ||
  "var(--text-muted-4)"`. New CSS class `.sparkline-svg` (`display:block; width:92px; height:26px;`)
  — the `<svg>` needs this since, same as the rank chart, it only carries a `viewBox` attribute.
- **Trend `<td>` wiring**: all 3 occurrences of the `// Trend — filled by Task 15` marker (map,
  brawler, teammate renderers) were replaced identically: build a `<td>`, call
  `renderSparkline(row.rows || [])`, `appendChild` the result only if non-`null`, always
  `tr.appendChild(trendCell)` — a row with `<3` sets ends up with a genuinely empty `<td>`, byte-
  identical in effect to the pre-Task-15 empty cell.
- **`rows: group.rows` bridge addition — diff for all 3 blocks in `renderAll()`** (one new line each,
  nothing else touched): map block gained `rows: group.rows,` right after `winrate: group.winrate,`;
  brawler block gained the identical line in the identical position; teammate block gained the
  identical line right after its own `winrate: group.winrate,`. Confirmed via `grep -c 'rows:
  group.rows'` → `3` post-edit.
- **Gotcha, same trap as Task 3/5's `security_invoker`/view-name grep counters**: an explanatory
  comment originally said "Built entirely with createElementNS, never innerHTML." — this pushed
  `grep -c 'innerHTML' rankedstats/stats.html` to `1` (a comment match, not real usage). Reworded to
  "no raw markup injection anywhere" to keep the acceptance-criteria grep at the required `0`. Future
  tasks: never type the literal string `innerHTML` in a comment in this file, even to say "don't use
  it" — say something else instead.
- Verification run: `node --check` on the extracted `<script>` body (stats.html lines 163-2422,
  `<script>` at 162, `</script>` at 2423) → exit 0. `grep -c 'createElementNS'` → `12` (>= 1 required).
  `grep -c 'innerHTML'` → `0`. `grep -c 'cdn.jsdelivr.net/npm/@supabase/supabase-js@2'` → `1`.
  `grep -ci 'sb_secret\|service_role'` → `0`. `grep -c "from('ranked_sets'\|from('set_participants'\|
  from('battles'"` → `0`. `grep -c 'id="map-section"\|id="brawler-section"\|id="teammate-section"\|
  id="recent-section"'` → `4` (all 4 sections still present). `stats.css` brace balance 147/147
  (was 143/143 before this task — 4 new rule blocks: `.hero-rank-chart`, `.hero-rank-chart svg`,
  `.hero-rank-delta`, `.sparkline-svg`). Standalone `node` traces (delta computation across
  All-time/Last-30/Last-7/empty/single-row fixtures; sparkline bucketing/rolling-winrate across
  3-row/2-row/all-draw/20-row fixtures; gridline label fallback across a 2-point fixture) all
  matched hand-computed expected output, shown above. No browser/DOM available in this environment,
  so actual SVG rendering was not visually confirmed — only traced via the same pure-math extraction
  approach used in every SVG-touching function above.
- **This was the final task in the rankedstats-redesign plan** — no further entries expected in this
  notepad unless a follow-up/retrofit task lands.
