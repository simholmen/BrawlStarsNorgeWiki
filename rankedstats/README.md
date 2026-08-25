# Ranked Stats

A small, self-contained system that ingests the roster's Brawl Stars **Ranked** (`soloRanked`)
battlelogs into a Supabase Postgres database, and shows per-player stats in a standalone HTML
page. The ingest pipeline in this folder is deliberately separate from the Jekyll site under
`docs/` and from `winratefetching/`/`tournamentfetching/` — nothing outside this folder is
touched, except two keys appended to the root `.env` (see below) and the generated
`docs/rankedstats/brawler_classes.js` (see "Contents" below).

The **published viewer page itself lives under `docs/rankedstats/`** (`stats.html`, `stats.css`,
`brawler_classes.js`, `images/`), not in this folder — that's the only copy, so GitHub Pages can
serve it directly alongside the wiki. This folder holds only the ingest pipeline that fills the
database the viewer reads from.

## Contents

- `migrations/` — 5 SQL files, meant to be applied in order (see "One-time setup" below):
  1. `001_init.sql` — tables (`players`, `rank_tiers`, `ranked_sets`, `set_participants`,
     `battles`), indexes, row-level security, and grants.
  2. `002_seed_rank_tiers.sql` — seeds the 22-row `rank_tiers` lookup table (Bronze I .. Pro).
  3. `003_views.sql` — the `v_player_*` aggregate views the browser page reads from.
  4. `004_current_rank.sql` — adds `v_player_current_rank`, one row per player with the rank tier
     from their most recent completed set. Powers the rank label shown next to Winrate in
     `stats.html`'s Overall section.
  5. `005_backfill_single_game_winner.sql` — one-off data backfill (not a schema change) that
     corrects sub-Mythic single-game sets that were wrongly recorded as draws by a bug in the old
     `winning_team_index` logic. See the file's header comment for the full story.
  6. `006_set_detail.sql` — appends `set_id` to `v_player_recent` and adds `v_set_detail` (one
     row per set with `participants`/`games` JSON arrays). Powers `stats.html`'s "Last 10
     matches" list and its click-through match detail view.
- `roster.py` — loads the tracked-player roster from `docs/_personer/*.md` front matter
  (`bsid` + `name`).
- `bs_api.py` — fetches a player's battlelog from the live Brawl Stars API.
- `sets.py` — pure, dependency-free logic that groups a battlelog into best-of-3 (or
  single-game) Ranked **sets** and computes each set's summary stats. No network or database
  access; every function takes and returns plain Python data.
- `test_sets.py` — a dependency-free regression suite for `sets.py`, run against real fixture
  battlelogs on disk. No network or database access either.
- `supa.py` — a thin PostgREST wrapper (`upsert`/`select`/`patch`) used to write to Supabase.
- `ingest.py` — the orchestration entrypoint: fetches every roster player's battlelog, groups it
  into sets, and writes it to Supabase.
- `gen_brawler_classes.py` — maintainer-run generator that writes
  `docs/rankedstats/brawler_classes.js` from the live BrawlAPI brawler list (see its own docstring).
- `docs/rankedstats/stats.html` (outside this folder) — the published page that reads the
  `v_player_*` views directly from Supabase and renders per-player stats. Not part of the Jekyll
  build (no front matter), just a static file GitHub Pages serves as-is.

## One-time setup

1. Create a Supabase project (free tier is enough).
2. Open the project's **SQL Editor** and run the three migrations, in this exact order, pasting
   each file's full contents and running it:
   1. `migrations/001_init.sql`
   2. `migrations/002_seed_rank_tiers.sql`
   3. `migrations/003_views.sql`

   Every statement in every migration is written to be safely re-runnable (`create table if not
   exists`, `create or replace view`, `drop policy if exists` before each `create policy`, `on
   conflict ... do nothing` on the seed inserts), so re-pasting a file you already ran is not
   harmful — but always apply them in numeric order the first time, since `003_views.sql` depends
   on the tables from `001_init.sql` and the data from `002_seed_rank_tiers.sql`.
3. In the project's API settings, copy the project URL, the **secret** (service-role-equivalent)
   key, and the **publishable** (anon) key.
4. Add the URL and secret key to the repo root `.env` as `SUPABASE_URL` and
   `SUPABASE_SECRET_KEY`. This file is already gitignored — never commit it.
5. Paste the project URL and the publishable key into `docs/rankedstats/stats.html`'s
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` constants near the top of its `<script>` block.
   The publishable key is safe to commit: every table and view it can see is governed by
   row-level-security policies that only ever grant `SELECT` to the `anon`/`authenticated` roles,
   so it can never write anything.

Never make ad-hoc schema changes through the Supabase Table Editor UI — that silently desyncs the
live database from these migration files, which are meant to be the single source of truth for
the schema. If the schema needs to change later, add a new `migrations/NNN_*.sql` file (see
"Future schema changes" below) instead of editing the live table by hand.

## Daily use

Run the ingest manually whenever you want fresh data:

```bash
python3 rankedstats/ingest.py
```

This is manual by design — no scheduler or automation is wired up (see "Future automation"
below). It fetches every roster player's battlelog, groups it into sets, and writes any new or
updated sets to Supabase. Re-running it immediately after a successful run is a no-op (it prints
0 new sets and 0 new battles).

Then open `docs/rankedstats/stats.html` directly in a browser (double-click it, or `open
docs/rankedstats/stats.html`) to view the stats. It reads straight from Supabase over the network,
so no local server or build step is required.

## Why only `soloRanked` is ingested

The Brawl Stars API's `battle.type == "ranked"` is the trophy ladder, not Ranked mode — those
entries carry a `trophyChange` field and real trophy counts. `soloRanked` is the actual Ranked
queue, and its entries never have `trophyChange`. Only `soloRanked` battles are ingested here.

Filtering on `soloRanked` alone also guarantees every ingested entry is exactly two teams of
three players — no other team shape has ever been observed for this battle type.

## Why stats are set-level, not per-game

A brawler pick and rank tier are constant for an entire best-of-3 set — the draft happens once,
before the first game, and does not change between games 2 and 3. Because of that, all stats and
aggregation (wins/losses/draws, winrate, per-map, per-brawler, per-teammate) live at the
`ranked_sets` / `set_participants` level, not per individual game. The `battles` table exists
purely as a raw, per-game record; no stat is ever derived from it directly — every `v_player_*`
view in `003_views.sql` reads from `ranked_sets` and `set_participants` only.

## `battleTime` is the battle's END time

The Brawl Stars API's `battleTime` field on a battlelog entry is the time the battle **ended**,
not when it started — this was proven by gap analysis across many within-set consecutive game
pairs and is not an assumption. `sets.py` reconstructs a game/set's start time as
`battleTime - duration`. Anyone extending this code should not assume `battleTime` is a start
time.

## Future schema changes

- Add a new `migrations/NNN_description.sql` file for any schema change.
- Never edit a migration file that has already been applied to the live project.
- Never make ad-hoc changes in the Supabase Table Editor UI — it silently desyncs the live schema
  from these files, which are the source of truth.

## Future automation

Not built now, by design — `ingest.py` is meant to be run manually for the time being. If/when
automation is wired up, wrap `python3 rankedstats/ingest.py` in a `launchd` job running roughly
every 20 minutes. That interval matters: the Brawl Stars API returns only the most recent 25
battlelog entries per player, with no pagination, so anything older than 25 battles at poll time
is lost permanently. A ~20-minute poll interval is what keeps an active player's battlelog window
from rolling off before it can be captured.

## Future VM move

Every path in this package already resolves from `__file__`
(`REPO_ROOT = Path(__file__).resolve().parent.parent`), and all configuration comes from `.env` —
so `ingest.py`'s whole ingest pipeline is copy-portable to a VM or another machine as-is, with no
hardcoded local paths. `gen_brawler_classes.py` is the one exception: it writes into
`docs/rankedstats/`, so it needs the rest of the repo checked out alongside `rankedstats/`, not
just this folder on its own.

**Open item, confirmed during this project's build, not just suspected**: Brawl Stars API keys
appear to be IP-bound. A live call from the build sandbox returned HTTP 403
`accessDenied.invalidIp` even with a valid, currently-working key. Moving or running this ingest
from a new machine will likely require either adding that machine's IP to the key's allow-list at
developer.brawlstars.com, or issuing a new key for that machine. No public documentation confirms
this behavior — it was observed empirically, not looked up.

## Scope note

Nothing outside `rankedstats/` is modified by this whole project, except two new keys appended to
the root `.env` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`).

## Verifying the core algorithm without network or database access

`sets.py` (the set-grouping algorithm) has no network or database dependency, and neither does
its test suite. To check it after making a change:

```bash
python3 rankedstats/test_sets.py
```

This runs a dependency-free regression suite against real fixture battlelogs on disk and asserts
exact counts (entries, groups, group-size distribution, and a couple of specific known sets). It
exits `0` on success and does not touch Supabase, the Brawl Stars API, or any other network call.
