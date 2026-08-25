# Research Context: Ranked Stats redesign (stats.html reskin to "3a — Ranked gold")

> **Plan**: ./notes/claude-specs/plans/rankedstats-redesign.md
> **Companion research**: ./notes/claude-specs/research/brawl-stars-brawler-class-mapping.md
> **Original build context**: ./notes/claude-specs/research/rankedstats-context.md

All line references verified 2026-08-25.

## Codebase Findings

### Current page: `rankedstats/stats.html` (937 lines)

- `<style>` block: **lines 28-209** (182 lines). `:root` custom props at 29-37:
  `--border-color:#d9d9d9`, `--header-bg:#f4f4f4`, `--status-loading:#6b6b6b`,
  `--status-error:#a4262c`, `--status-empty:#6b6b6b`, `--badge-bg:#2e7d32`,
  `--rank-badge-bg:#8a5a00`. Several colors are *not* variabilised (body `#1a1a1a`/`#ffffff`,
  muted `#6b6b6b`, `th:hover #e9e9e9`) — light theme throughout.
- Only external resource: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`
  at line 27. **Zero `<link>` tags** — no stylesheet, no fonts, no favicon.
- Client: `const sb = window.supabase.createClient(...)` line 284. Named `sb` deliberately —
  `window.supabase` is the UMD global (comment lines 282-283). URL + publishable key hardcoded
  (lines 279-280) precisely so the page works from a bare `file://` with no build/inject step.
- DOM: `h1` (213), `.subtitle` (214), `.controls` (216-227), 5 `section.stats-section`:
  `overall-section` (232-237), `map-section` (240-245), `brawler-section` (248-253),
  `teammate-section` (256-261), `recent-section` (264-270, has sibling `#match-detail-content`
  at 269). Dynamic table ids: `map-table` (577), `brawler-table` (638), `teammate-table` (698),
  `recent-table` (775).
- Functions: `clearElement` (290), `setStatus` (296), `formatWinrate` (304), `makeCell` (311),
  `sortTableByColumn` (325), `makeSortableHeader` (354), `applyMinSampleFilter` (370),
  `loadPlayers` (398), `onPlayerSelected` (447), `loadOverall` (475), `renderOverall` (504),
  `loadMapStats` (549), `renderMapTable` (573), `loadBrawlerStats` (610), `renderBrawlerTable`
  (634), `loadTeammates` (670), `renderTeammateTable` (694), `formatDateTime` (739),
  `loadRecentMatches` (746), `renderRecentTable` (771), `loadMatchDetail` (806),
  `renderMatchDetail` (828). Init: `loadPlayers()` at 932.
- **8 queries**, all `.eq("player_tag", tag)` except the roster one:
  `players` `select("tag,name").eq("is_tracked",true).order("name")` (402-406);
  `v_player_overall` `select("*")` (480); `v_player_current_rank` `select("rank_label")` (481)
  — those two run under one `Promise.all` (479-482); `v_player_map` (553-557),
  `v_player_brawler` (614-618), `v_player_teammate` (674-678) each ordered by sets desc;
  `v_player_recent` ordered `ended_at` desc `.limit(10)` (751-756);
  `v_set_detail` `.eq("set_id", setId)` (810-813).
- **No JS state at all.** No `currentPlayerTag` variable — `onPlayerSelected` reads
  `#player-select.value` fresh each call (449). Player change = full 5-query re-fetch (462-466).
  Min-sets change = pure DOM class toggle, no re-query (392 → 370). Sort = DOM reorder only.
- `applyMinSampleFilter` (370-390) loops `["map-table","brawler-table","teammate-table"]`,
  toggles `.filtered-out` (`display:none`, line 143-145) on rows whose `data-sets` attr is below
  threshold. `data-sets` set at render (591, and equivalents) from `sets_played` /`sets_together`.
- `sortTableByColumn` (325-352) strips `%` and whitespace, numeric compare if both parse, else
  `localeCompare`; re-`appendChild`s rows; manages `data-order` attr driving `::after` ▴/▾
  indicators (135-141).
- Rank badge: **no tier-color logic exists.** Always static `var(--rank-badge-bg)` `#8a5a00`
  (line 203). Only `rank_label` is read (496-499), appended into the Winrate KPI (526-531).
- **No images anywhere** — no `<img>`, no `background-image`, no icon CDN. Brawler/map are
  plain text. Brawler name falls back to id: `row.brawler_name || String(row.brawler_id)` (653).

### Schema (`rankedstats/migrations/001-006`)

Base tables — `players(tag PK, name, is_tracked, first_seen, updated_at)`;
`rank_tiers(value PK 1..22, tier_name, tier_level, label)`;
`ranked_sets(id PK, set_key, event_id, mode, map, started_at, ended_at, games_played,
team0_wins, team1_wins, winning_team_index, is_complete, updated_at)`;
`set_participants(set_id+player_tag PK, team_index, brawler_id, brawler_name, brawler_power,
rank_value FK→rank_tiers)`; `battles(id PK, set_id, game_number, battle_time, duration,
winning_team_index, star_player_tag, dedupe_key)`. All public-SELECT via RLS.

`rank_tiers` seeded 1..22: Bronze I..III, Silver I..III, Gold I..III, Diamond I..III,
Mythic I..III, Legendary I..III, Masters I..III, Pro (value 22, `tier_level` null).
**No abbreviation, threshold, or colour column.**

Views: `v_player_overall` (`003_views.sql:34-63`), `v_player_map` (72-101),
`v_player_brawler` (110-139), `v_player_teammate` (152-187) — **all four are pure aggregates
with zero date/time column in the output.** `v_player_current_rank` (`004:17-29`) uses
`distinct on (player_tag) ... order by ended_at desc` — one row per player, latest only.
`v_player_recent` (`006:29-49`) is the only per-set view: `player_tag, map, mode, brawler_name,
result, ended_at, set_id`. `v_set_detail` (`006:59-109`) is one row per set with `participants`
and `games` as **jsonb arrays**.

`winrate` convention everywhere: `wins / nullif(wins + losses, 0)` — draws excluded from both
numerator and denominator, `round(...,4)`.

### Repo conventions

- **Zero `.css` under `rankedstats/`.** Only source stylesheet in the repo is `docs/style.css`
  (348 lines, Jekyll site). It uses flat kebab-case classes, **no** custom properties, **no**
  BEM, no utilities, raw repeated hex, a Norwegian comment on nearly every declaration, and a
  trailing `@media (max-width:767px)` override block. **No dark theme anywhere in the repo.**
- `rankedstats/` sits *outside* the Jekyll source root (`docs/`), so it is never built or
  published. `docs/_config.yml` has no `exclude:` list and needs none.
- No `package.json`, no npm, no bundler. Gemfile is Jekyll-only.
- **No charting library anywhere in the repo** (no Chart.js/d3/sparkline). The mockup's own
  charts are hand-rolled inline SVG.
- JS precedent is plain global functions, no IIFE/modules (`docs/script.js`, and stats.html
  itself).
- Plan-file convention: `notes/claude-specs/plans/{name}.md` with TL;DR / Scope / Context /
  Verification Strategy / Execution Strategy / TODOs / Success Criteria / Open Questions.
  Append-only notepads live at `notes/claude-specs/notepads/rankedstats/{decisions,issues,
  learnings,problems}.md`.

## Design Spec (`rankedstats/newdesign/Ranked Stats.dc.html`)

Single variant `3a` "Ranked gold". Mockup canvas is a fixed **1320px** card, `min-height:1180px`.
**No media queries, no CSS transitions/animations, no keyboard handling, no ESC-to-close.**

Tokens — page/border `#070b14`; text primary `#eef1f8`, secondary `#a7b1cb`, muted `#8f9ab6` /
`#7d88a6` / `#66708c` / `#4d5876`; panel `#121a2e`, panel border `#24304f`, input border
`#2c3854`, sidebar/darker `#0c1220`, track/divider `#1d2740`, placeholder swatch `#233054`;
gold accent `#ffd23d`; win `#5fd39a`, loss `#ff7d84`, draw `#9aa5c0`; result chip bgs
win `#14301f`, loss `#331416`, neutral `#1d2740`; thin badge bg `#3c2f10` fg `#ffd23d`;
roster badge bg `#ffd23d` fg `#070b14`.
Tier colours: Bronze `#c07d47`, Silver `#adb6c2`, Gold `#e8b427`, Diamond `#5ed0ef`,
Mythic `#c05ae0`, Legendary `#ff6b74`, Masters `#ffd23d`, Pro `#f4f6fb`.
Header gradient `linear-gradient(120deg,#1a2340 0%,#0f1526 55%,#181e33 100%)` + `3px` gold
bottom border. Table header strip `linear-gradient(100deg,{tint},#121a2e 70%)` with tints
map `#1d2b52`, brawler `#3c2f10`, mates `#16342c`, recent `#2a2140`.
Radii 4/6/7/8/9/11/12/16px. Fonts: `Barlow Condensed` 600/700 (display) + `Inter Tight`
400-700 (body), via Google Fonts.

Layout — hero, then `display:flex`: `<aside>` `width:262px` `bg#0c1220` `border-right#24304f`
`padding:20px` `gap:20px`; `<main>` `flex:1` `padding:20px 26px` `gap:15px` `min-width:0`.
KPI grid `repeat(3,132px)` gap 10 — **5 cards wrap to 3+2**. Callouts `1fr 1fr` gap 13.
Recent row grid `96px 1fr 148px 148px 24px`. Modal team grid `1fr 1fr`; player row `1fr 100px`;
rounds row `52px 1fr 80px 1fr`.

Hero — absolutely-positioned elo chart `inset:auto 0 0 0; height:190px; opacity:.45` behind
foreground. Rank badge `104x120`, radius 16, bg = tier colour, contents `LEG` (3-letter
uppercase slice) 34px / roman tier 13px / elo 10px, all on dark `#10151f`. Name 44px Barlow
uppercase. Subline `"{rank} · {tag} · rank score {eloNow} {eloDelta} i {season}"` with delta in
gold. Form row = 10 chips `22x22` radius 6, letter W/L/D, bg green/red/`#4d5876`.

Sidebar — `Spiller` select; `Brawler` class tree (7 rows, chevron `▾`/`▸` toggles expand
independent of the click-to-filter on the name/bar area; active = border+text gold, bg
`#1a2340`; each row has a 5px-tall winrate mini-bar, a % in bar colour, and a `{sets}s` count;
expanded children indented `padding-left:33px`, grid `1fr 34px 34px`, sorted by sets desc);
conditional `Nullstill ✕`; `Mode` chips (7 incl. "All modes"); `Periode` chips
(`Sesong 53`/`Siste 30 dager`/`Siste 7 dager`); `Minimum sett` native
`<input type=range min=1 max=15>` `accent-color:#ffd23d` + live 20px gold value +
`"{n} rader skjult"` hint.

Main — filter bar (`border-left:4px solid #ffd23d`, gold 19px filter label, muted
`· {mode} · {season} · min {n} sett`, right-pinned `Vis alle brawlere ✕`); 2 callout cards
(`border-left:4px solid {tone}`, 74x54 thumb placeholder, 23px map name, 38px winrate);
3 collapsible table panels (click header to toggle, chevron glyph swap only, right-side
`"{n} rader over grensen"`). Table: sortable `th` with literal `▼`/`▲` appended, row
`border-top:1px solid #1d2740`, **no zebra, no hover style defined**; first cell 32x32
placeholder + 17px Barlow label + optional `ROSTER` and `TYNT` badges (`TYNT` has
`title="Lite datagrunnlag"`, computed `sets < minSets+2`); Sett 18px; W green 16px; L red 16px;
Trend = inline SVG `92x26` (flat reference line + 8-point polyline + terminal `r=2.4` dot,
`strokeWidth:1.8`, colour = winrate tone); Winrate = 12px-tall bar + 21px % both in tone colour.
Tone thresholds: `>=60%` green, `>=45%` gold, else red.

Recent panel — list not table; row `border-left:4px solid {result colour}`, bg `#0e1424`
(selected `#1a2440`), columns date / thumb+map+mode / brawler icon+name / result badge + score
/ `›`. Click opens modal.

Modal — overlay `position:absolute; inset:0; background:rgba(4,7,13,.78);
padding:80px 30px; align-items:flex-start` (anchored to the root, which is `position:relative`).
Box `width:860px`, radius 16, `border-top:3px solid #ffd23d`, shadow `0 30px 70px rgba(0,0,0,.6)`.
Header (thumb + 25px map name + `"{mode} · {date} · {start}–{end} · {status}"` + 32x32 `✕`
button); score bar `Lag 0` / `{t0}–{t1}` 44px gold / `Lag 1` + `"{games} runder · vinner {w}"`;
two roster panels (avatar + name + `{tag} · {brawler}`, right column `P{power}` / `{rank}`);
`Runder` table (`R{n}`, time, duration, `{winner} · ★ {star}`).

Elo chart SVG: `viewBox="0 0 640 170"`, 4 horizontal gridlines `#1d2740` with numeric y-labels
`#7d88a6` at `x=0`, no x-axis, `polyline` stroke `#ffd23d` width `2.4` `strokeLinejoin:round`,
filled `polygon` area `rgba(255,210,61,.13)`, terminal `circle r=4`.

**Mockup data is fabricated** (`makePlayer`/`lcg`/`hash` seeded RNG). `CLASSES` covers only 14
invented brawlers. `MODE_MAPS`, `MATES`, `OPP`, `PLAYERS` are all demo. Only the *shapes* and
*visual tokens* are load-bearing.

**Design inconsistency to normalise**: callout tone colours use the light-mode pair
`#2f9e6b`/`#cf4b52` while every other element in 3a uses the dark pair `#5fd39a`/`#ff7d84`.

**UI language is Norwegian** throughout the mockup; `stats.html` is entirely English.

## External Research

Full detail: `./notes/claude-specs/research/brawl-stars-brawler-class-mapping.md`.

- Official `api.brawlstars.com/v1/brawlers` returns only `id`, `name`, `starPowers[]`,
  `gadgets[]` — **class was never exposed**. Also requires a key + IP allowlist, so it is
  unreachable from a browser at all.
- `api.brawlify.com` is being retired (returns Cloudflare challenges). Successor is
  **`api.brawlapi.com`**, keyless, live-verified `Access-Control-Allow-Origin: *`.
  `GET /v1/brawlers/16000000` →
  `{"id":16000000,"name":"Shelly","imageUrl":"https://cdn.brawlify.com/brawlers/borders/16000000.png",
  "imageUrl2":".../borderless/16000000.png","imageUrl3":".../emoji/16000000.png",
  "class":{"id":1,"name":"Damage Dealer"}}`.
- **BrawlAPI's own class data is already stale**: 19 released brawlers have
  `class.name: "Unknown"` (Wendy, Nori, Bolt, Starr Nova, Damian, Najia, Sirius, Glowy, Gigi,
  Pierce, Ziggy, Mina, Trunk, Alli, Kaze, Jae-Yong, Finx, Ollie).
- Live count 2026-08-25: 107 brawlers, 106 released. The repo's own battlelogs contain 106
  distinct brawler names (uppercase, e.g. `LARRY & LAWRIE`).
- The 7 current official classes are confirmed: Damage Dealer, Marksman, Assassin, Support,
  Controller, Artillery, Tank. Historical aliases (Sharpshooter/Thrower/Heavyweight/Healer)
  **could not be verified live** — use only the current vocabulary.
- Fandom MediaWiki category counts (keyless, live): Damage Dealer 22, Assassin 19, Controller
  20, Tank 16, Support 13, Marksman 11, Artillery 7.
- Recommendation from research: **static local mapping keyed by numeric `brawler_id`**, not a
  live fetch — avoids a CORS/network failure mode on a `file://` page, and a live fetch would
  not fix completeness anyway since the upstream source itself lags releases.

## Decisions Made

Deferred to the plan's Key Decisions section — no user decisions were taken during research.

## Open Questions

- **BLOCKER-lite: UI language.** Mockup is Norwegian, current page is English. Plan ships an
  i18n-free English default with a single label table to flip, and flags this for the user.
- **Season chips.** No season concept exists in the schema. Plan substitutes date ranges and
  proposes an optional hand-seeded `seasons` table as a follow-up.
- Whether brawler portraits (available via `cdn.brawlify.com/brawlers/borderless/{id}.png`,
  and `brawler_id` is already stored) should replace the mockup's grey placeholder blocks.
