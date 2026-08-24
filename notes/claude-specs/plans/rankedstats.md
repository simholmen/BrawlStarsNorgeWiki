# Ranked Stats — Supabase-backed winrate by map / brawler / teammate

## TL;DR

> **Summary**: New self-contained `rankedstats/` folder at repo root. A manually-run Python
> poller reads every roster player's Brawl Stars battlelog, keeps only `soloRanked` battles,
> groups them into best-of-3 sets, and upserts into Supabase. A standalone local HTML page queries
> Supabase directly via CDN `supabase-js` and renders set-level winrate breakdowns.
>
> **Deliverables**:
> - `rankedstats/migrations/001_init.sql` — schema + indexes + RLS + grants + views
> - `rankedstats/migrations/002_seed_rank_tiers.sql` — tier seed (pending confirmation)
> - `rankedstats/` Python ingestion package (roster, API, set logic, PostgREST push)
> - `rankedstats/test_sets.py` — asserts set logic against real fixtures
> - `rankedstats/stats.html` — standalone local stats page
> - `rankedstats/README.md`
>
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 -> Task 4 -> Task 5 -> Task 6 -> Task 9

---

## Scope

**IN**: everything under a new `rankedstats/` folder — SQL migrations, ingestion scripts, a local
stats page, a test script, a README.

**OUT — explicitly untouched**:
- `winratefetching/` (all scripts, `update_all.sh`, its `docs/fetchresult/` output dir)
- `docs/_personer/*.md` (read-only input)
- `docs/_data/winloss.yml`
- `klubbleaderboardfetching/`, `tournamentfetching/`
- `docs/` in general — the stats page is **not** wired into Jekyll layouts, nav, or theme, and is
  not published via GitHub Pages
- `.github/workflows/`
- Root `.env` gains two new keys; no other repo file is modified.

Also out of scope: automation (launchd/cron), the future move to a VM, trophy-ladder
(`type: "ranked"`) battles, showdown/5v5 variants.

---

## Context

### Decisions
- **Ranked filter**: `battle.type == "soloRanked"` only. Trophy-ladder `ranked` ignored.
- **Granularity**: all stats computed at **set** level. Brawler and rank tier live on
  `set_participants` because both are constant for a whole set.
- **Raw record**: a lightweight `battles` table is kept for drill-down, with no participant table.
- **Run mode**: manual. `python3 rankedstats/ingest.py` while iterating.
- **Page**: `rankedstats/stats.html`, opened via `file://`. Local only.
- **Deps**: plain `requests` over PostgREST. No new packages.

### Research findings that shaped the design
Full detail in `./notes/claude-specs/research/rankedstats-context.md`.

- `type: "ranked"` is the **trophy ladder**, not Ranked. It carries `trophyChange`, power 1–11, and
  real trophies (0–2881). `soloRanked` never has `trophyChange`, power is 9–11, and
  `brawler.trophies` is a 1–22 rank tier. Filtering on `soloRanked` alone also removes every
  non-3v3 shape for free (all 186 soloRanked entries were exactly 2x3).
- **`battleTime` is the END of a battle**, proven: `gap - duration[n+1]` fell in +18..+21s for all
  60 within-set pairs, while `gap - duration[n]` ranged -81..+149 and went negative 18 times.
- **Brawler never changes within a set** (0 of 288 pairs) — the draft happens once per match.
- **Best-of-3 only from Mythic I (tier 13) up.** Below that a set is a single game. Observed tiers
  span 4–22, so single-game sets are normal: 78 of 126 groups.
- Grouping by consecutive same `event.id` + same 6-tag set yields max size 3, never larger; team
  partitions never reshuffle mid-set.
- Within-set gaps (55–229s) **overlap** the minimum between-set gap (95s), so time alone cannot
  separate sets. The tag-set check is mandatory.
- A set can end in an unresolved draw (`defeat/victory/draw` observed once).
- `battleTime` + sorted tags is already unique across all 669 sampled battles.
- Teammate signal is sparse: only 1 roster pair has ever co-occurred. Teammate stats must cover
  **all** teammates, not just roster members.
- Supabase now needs **explicit grants** alongside RLS, and views need `security_invoker = true`.

---

## Verification Strategy

- **Test infrastructure exists**: NO (no pytest, no test dir, no `requirements.txt` in repo).
- **Approach**: a dependency-free assert script, `rankedstats/test_sets.py`, run with plain
  `python3`. It exercises the pure set-grouping functions against the **real** fixture files in
  `winratefetching/docs/fetchresult/` (read-only) and asserts the exact numbers established during
  research. This turns the research findings into a regression suite.
- Everything touching Supabase or the network is verified manually via `curl`/browser.

Fixture-derived assertions (soloRanked, `battleTime >= 20260101`, across all 27 fixture files):

| Assertion | Expected |
|---|---|
| Qualifying entries | 186 |
| All entries 2 teams of 3 | true, 0 exceptions |
| Total groups | 126 |
| Group size distribution | 78 x1, 36 x2, 12 x3, 0 x>3 |
| Team-partition reshuffles within a group | 0 |
| Brawler changes within a group | 0 of 288 (player, group) pairs |
| Distinct dedupe keys | equals entry count per file (no intra-file collision) |
| Cross-file duplicate battles | 25, all aambakk/cursed |
| Distinct participant tags | 510 |
| Roster members with >=1 game | 13 |

---

## Schema

Final shape. Changes from the original draft: `battle_participants` is **dropped**; `brawler_*`
and `rank_value` move to `set_participants`; `winning_team_index` is nullable (draws);
`games_played` allows 1 (sub-Mythic single-game sets); `is_complete` added for partially-seen sets.

```sql
players (
  tag         text primary key,          -- '#2GY22JUR', WITH leading '#'
  name        text,                      -- latest seen display name
  is_tracked  boolean not null default false,
  first_seen  timestamptz default now(),
  updated_at  timestamptz default now()
)

rank_tiers (
  value       int primary key,           -- 1..22
  tier_name   text not null,             -- 'Legendary'
  tier_level  int,                       -- 1..3, null for Pro
  label       text not null              -- 'Legendary I'
)

ranked_sets (
  id                 uuid primary key default gen_random_uuid(),
  set_key            text not null unique,
  event_id           int not null,
  mode               text not null,
  map                text not null,
  started_at         timestamptz,        -- first game battle_time - duration
  ended_at           timestamptz,        -- last game battle_time
  games_played       int not null default 0,
  team0_wins         int not null default 0,
  team1_wins         int not null default 0,
  winning_team_index int,                -- 0 | 1 | null (draw/unresolved)
  is_complete        boolean not null default false,
  updated_at         timestamptz default now()
)

set_participants (
  set_id       uuid references ranked_sets(id) on delete cascade,
  player_tag   text references players(tag),
  team_index   int not null check (team_index in (0,1)),
  brawler_id   int,
  brawler_name text,
  brawler_power int,
  rank_value   int references rank_tiers(value),
  primary key (set_id, player_tag)
)

battles (                                -- raw record only, no stats derived from it
  id                 uuid primary key default gen_random_uuid(),
  set_id             uuid references ranked_sets(id) on delete cascade,
  game_number        int,
  battle_time        timestamptz not null,   -- END of the battle
  duration           int,
  winning_team_index int,                    -- nullable: draws
  star_player_tag    text references players(tag),  -- nullable
  dedupe_key         text not null unique
)
```

`battle_type` is deliberately absent — only `soloRanked` is ingested.

### Key derivation
- `dedupe_key = sha256(battle_time_iso + '|' + '|'.join(sorted(all 6 tags)))`.
  Proven unique across the whole 669-battle corpus. `duration` excluded — adds nothing.
- `set_key = dedupe_key of the set's earliest known game`. Deterministic and unique; it is an
  identifier, not a semantic hash, so it is **never rewritten** even if a later poll reveals an
  earlier game.

### Canonical team index (critical for cross-player dedupe)
`battle.teams` array order is relative to whichever player's log was fetched. Two roster players in
the same match must not produce mirrored team indices. Define:

> `team_index = 0` for the team whose sorted tag list is lexicographically smaller; `1` for the other.

Then `winning_team_index` is derived by locating the **log owner's** tag, reading `battle.result`
(`victory` -> owner's canonical team, `defeat` -> the other, `draw` -> `null`), independent of array
order.

### Set completion
- Complete when `max(team0_wins, team1_wins) >= 2`.
- Or when `games_played == 1` **and** every participant's `rank_value < 13` (below Mythic I =
  single-game format).
- Or fallback: `ended_at` older than 2 hours — a set that never grew is not going to.
- Otherwise `is_complete = false` (open, awaiting a later poll).
- Stats views filter on `is_complete = true`.

---

## Execution Strategy

```
Wave 1 (start immediately) — workflow: NO (2 tasks, one blocked on user):
|- Task 1: 001_init.sql schema + indexes + RLS + grants
|- Task 2: 002_seed_rank_tiers.sql  [CHECKPOINT: user confirms mapping]

Wave 2 (after Wave 1) — workflow: YES (4 independent, fully-specified tasks):
|- Task 3: roster.py + bs_api.py          [depends: none technically, grouped here]
|- Task 4: sets.py — pure set logic       [depends: none technically]
|- Task 5: test_sets.py                   [depends: 4]
|- Task 7: 003_views.sql aggregate views  [depends: 1]

Wave 3 (after Wave 2) — workflow: NO (sequential, needs real data):
|- Task 6: supa.py + ingest.py            [depends: 1, 3, 4]
|- Task 8: first real ingestion run       [depends: 6, 2]
|- Task 9: stats.html                     [depends: 7, 8]
|- Task 10: README.md                     [depends: all]

Critical Path: 1 -> 4 -> 5 -> 6 -> 8 -> 9
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|-----------|--------|---------------------|
| 1 | None | 6, 7 | 2 |
| 2 | User confirmation | 8 | 1 |
| 3 | None | 6 | 4, 7 |
| 4 | None | 5, 6 | 3, 7 |
| 5 | 4 | — | 3, 7 |
| 6 | 1, 3, 4 | 8 | — |
| 7 | 1 | 9 | 3, 4, 5 |
| 8 | 6, 2 | 9 | — |
| 9 | 7, 8 | — | 10 |
| 10 | 1–9 | — | 9 |

---

## TODOs

- [ ] 1. **`rankedstats/migrations/001_init.sql` — schema, indexes, RLS, grants**

  **What to do**:
  - Create the five tables exactly as specified in the Schema section above.
  - Indexes: `set_participants(player_tag)`, `set_participants(set_id)`,
    `ranked_sets(started_at desc)`, `ranked_sets(event_id)`,
    `ranked_sets(is_complete) where is_complete`, `battles(set_id)`,
    `battles(battle_time desc)`, `set_participants(brawler_id)`.
  - `alter table ... enable row level security` on **all five** tables.
  - One `for select ... to anon, authenticated using (true)` policy per table. **No** insert/update/
    delete policies for those roles — writes go via the secret key, which bypasses RLS.
  - Explicit grants (required; do not rely on Supabase's legacy auto-grant, which is being made
    opt-in): `grant select on public.<t> to anon, authenticated;` and
    `grant all on public.<t> to service_role;` for each table.
  - Idempotent throughout: `create table if not exists`, `drop policy if exists` before
    `create policy`, `create index if not exists`.
  - Header comment: paste into Supabase SQL Editor once; apply future changes as new numbered files.

  **Must NOT do**:
  - No `battle_participants` table.
  - No `check (games_played in (2,3))` — 1 is valid.
  - No `not null` on `winning_team_index` — draws exist.
  - Do not seed `rank_tiers` here (that is Task 2).

  **References**:
  - Schema section of this plan (authoritative).
  - RLS + grant pattern: https://supabase.com/docs/guides/database/postgres/row-level-security
    and https://supabase.com/docs/guides/api/securing-your-api

  **Acceptance Criteria**:
  - [ ] File exists: `rankedstats/migrations/001_init.sql`
  - [ ] `grep -c 'enable row level security' rankedstats/migrations/001_init.sql` -> `5`
  - [ ] `grep -c 'for select' rankedstats/migrations/001_init.sql` -> `5`
  - [ ] `grep -c 'grant select' rankedstats/migrations/001_init.sql` -> `5`
  - [ ] `grep -ci 'battle_participants' rankedstats/migrations/001_init.sql` -> `0`
  - [ ] Pasting into the Supabase SQL Editor succeeds; re-running it a second time also succeeds
        (idempotent) with no error.
  - [ ] Supabase Dashboard -> Advisors -> Security reports no `rls_disabled_in_public` finding.

---

- [ ] 2. **`rankedstats/migrations/002_seed_rank_tiers.sql` — tier seed** *(CHECKPOINT)*

  > **BLOCKER — needs user confirmation before the INSERTs are uncommented.**
  > Research derived a high-confidence mapping, but the user has not confirmed it.

  Derived mapping (Fandom Elo-table order, numbered 1..22). It matches both user data points
  (Mythic III = 15, Legendary I = 16) and the observed data ceiling of exactly 22:

  | # | Tier | # | Tier | # | Tier |
  |---|------|---|------|---|------|
  | 1 | Bronze I | 9 | Gold III | 17 | Legendary II |
  | 2 | Bronze II | 10 | Diamond I | 18 | Legendary III |
  | 3 | Bronze III | 11 | Diamond II | 19 | Masters I |
  | 4 | Silver I | 12 | Diamond III | 20 | Masters II |
  | 5 | Silver II | 13 | Mythic I | 21 | Masters III |
  | 6 | Silver III | 14 | Mythic II | 22 | Pro |
  | 7 | Gold I | 15 | Mythic III | | |
  | 8 | Gold II | 16 | Legendary I | | |

  **What to do**:
  - Write the file with all 22 `insert ... on conflict (value) do nothing` rows **commented out**,
    under a clearly marked `TODO: CONFIRM WITH USER BEFORE RUNNING` block that reproduces the table
    above.
  - Ask the user to confirm or correct, then uncomment.
  - Note in a comment that this is the post-2025-02-25 ladder; the pre-rework ladder had 19 ranks
    with an unsplit Masters and no Pro.
  - Cheapest independent check, worth noting in the comment: a Bronze/Silver account's battlelog
    should show values 1–9.

  **Must NOT do**:
  - Do not ship uncommented seed rows before the user confirms.
  - Do not block Tasks 1, 3–7 on this — only Task 8 needs it, because `set_participants.rank_value`
    has an FK to `rank_tiers(value)`.

  **Acceptance Criteria**:
  - [ ] File exists with 22 rows covering values 1..22, no gaps.
  - [ ] Before confirmation: `grep -c '^-- insert' rankedstats/migrations/002_seed_rank_tiers.sql`
        -> `22` (all commented).
  - [ ] After confirmation + run: `select count(*) from rank_tiers;` -> `22`
  - [ ] `select label from rank_tiers where value in (15,16);` -> `Mythic III`, `Legendary I`

---

- [ ] 3. **`rankedstats/roster.py` + `rankedstats/bs_api.py`**

  **What to do**:
  - `roster.py`: parse `docs/_personer/*.md` front matter (`---` fence, `yaml.safe_load` the block)
    into `[{tag, name, slug}]`. **Prepend `#` to `bsid`** — it is stored without one. Skip entries
    with a missing/blank `bsid` or `name`. `slug = name.lower().replace(' ', '_')`.
  - `bs_api.py`: `fetch_battlelog(tag) -> list[dict]`. URL-encode `#` as `%23`. Header
    `Authorization: Bearer <BRAWLSTARS_API_KEY>`, `Accept: application/json`. Return `data["items"]`.
    Retry on `{429, 502, 503, 504, 520}` with exponential backoff `2 ** (attempt-1)`, 4 attempts.
    Raise a clear error on 403 (key/IP mismatch).
  - Env loading: read repo-root `.env` **manually** (simple `KEY=VALUE` line parse), matching
    `tournamentfetching/fetch_tournament_stats_once.py`. This avoids a `python-dotenv` dependency
    and makes the folder work under both `venv/` and `.venv/`.
  - **Resolve all paths from `__file__`**, e.g. `REPO_ROOT = Path(__file__).resolve().parent.parent`.
    No hardcoded `/Users/simenholmen/...` anywhere — this is what makes the folder VM-portable later.
  - Optionally cache raw responses to `rankedstats/fetchresult/battlelog_{slug}.json` for debugging.
    Use this folder's **own** directory, never `winratefetching/docs/fetchresult/`.

  **Must NOT do**:
  - Do not import from `winratefetching/`. Copy the parsing approach; keep the folder self-contained.
  - Do not write to `winratefetching/docs/fetchresult/`.
  - Do not hardcode absolute paths.
  - Do not add `python-dotenv` or any other dependency.

  **References**:
  - Front-matter parse pattern: `winratefetching/extract_names_and_tags.py:4-21`
  - API call + headers pattern: `winratefetching/battlelogfetch.py:17-32`
  - Retry/backoff pattern: `tournamentfetching/fetch_tournament_stats_once.py:207-234`
  - Manual `.env` parse pattern: `tournamentfetching/fetch_tournament_stats_once.py:129-147`
  - Roster shape: `docs/_personer/aambakk.md` (`bsid: YQ29980`, `name: Aambakk`)

  **Acceptance Criteria**:
  - [ ] `python3 -c "from rankedstats.roster import load_roster; r=load_roster(); print(len(r))"`
        -> `25`
  - [ ] Every returned tag starts with `#`.
  - [ ] `grep -rc '/Users/simenholmen' rankedstats/*.py` -> `0` for every file.
  - [ ] `grep -rc 'dotenv' rankedstats/*.py` -> `0` for every file.
  - [ ] Live check: `python3 -c "from rankedstats.bs_api import fetch_battlelog;
        print(len(fetch_battlelog('#YQ29980')))"` -> `<= 25` and `> 0`.

---

- [ ] 4. **`rankedstats/sets.py` — pure set-grouping logic** *(core algorithm, no I/O)*

  **What to do**: pure functions only, no network and no DB, so Task 5 can test them.

  - `is_ranked(item)` -> `item["battle"].get("type") == "soloRanked"`. Defensively also require
    `battle.teams` to be exactly 2 teams of 3 and reject anything else.
  - `parse_battle_time(s)` -> `datetime.strptime(s, "%Y%m%dT%H%M%S.%fZ")`, UTC. **This is the END
    of the battle.**
  - `canonical_teams(teams)` -> order the two teams so index 0 is the one whose sorted tag list is
    lexicographically smaller. Returns `(team0_tags, team1_tags)` plus each participant's brawler
    payload. Makes indices identical regardless of whose log the battle came from.
  - `dedupe_key(battle_time_iso, all_tags)` -> `sha256(iso + '|' + '|'.join(sorted(all_tags)))`.
  - `winner_index(item, owner_tag, canonical)` -> `0`/`1`/`None`, from `battle.result` relative to
    the owner's canonical team. `draw` -> `None`. Absent `result` -> `None`.
  - `group_into_sets(items, owner_tag)`:
    1. Filter to `is_ranked`, sort **ascending** by `battle_time` (API returns newest-first).
    2. Walk the list; start a new group when `event.id` differs **or** the frozenset of 6 tags
       differs from the current group's, **or** the gap since the previous game exceeds
       `MAX_INTRA_SET_GAP = 900s` (15 min — generous vs. the observed 229s max, but far below any
       realistic session gap).
    3. Cap group size at 3; a 4th matching game starts a new group (never observed, but guard it).
    4. Per group emit: `event_id`, `mode` (`event.mode`; identical to `battle.mode` for all 186
       sampled entries), `map`, canonical team tags, per-participant brawler + `rank_value`
       (`brawler.trophies`), and the ordered games list.
  - `summarize_set(group)`:
    - `started_at = first.battle_time - timedelta(seconds=first.duration)`
    - `ended_at = last.battle_time`
    - `team0_wins`/`team1_wins` counting only games with a non-null winner (draws count toward
      neither), `games_played = len(games)`
    - `winning_team_index` = the side with >= 2 wins, else `None`
    - `is_complete` per the Set completion rules in the Schema section
    - `set_key` = `dedupe_key` of the earliest game in the group

  **Must NOT do**:
  - No network calls, no Supabase imports, no file writes — keeps the module unit-testable.
  - Do not use a pure time threshold to split sets. Within-set gaps reach 229s while the smallest
    between-set gap is 95s; they overlap. `event.id` + tag set is the primary key, time is only an
    outer sanity bound.
  - Do not assume `battleTime` is the battle start.
  - Do not assume `games_played` is 2 or 3, or that some team always reaches 2 wins.
  - Do not track brawler per game — it is constant per set.
  - Do not trust `battle.teams` array order for team identity.

  **References**:
  - Findings and every expected number: `./notes/claude-specs/research/rankedstats-context.md`
  - Fixtures: `winratefetching/docs/fetchresult/battlelog_*.json` (read-only)
  - Draw edge case: `battlelog_zimma.json`, group starting `20260807T194759.000Z`
    (`defeat`/`victory`/`draw`)
  - Largest within-set gap: `battlelog_star_virus.json`, group starting `20260107T232711.000Z`
    (gaps 216s, 124s)
  - Smallest between-set gap (95s): `battlelog_wafels.json`, `20260715T215632.000Z` ->
    `20260715T215807.000Z`

  **Acceptance Criteria**:
  - [ ] `rankedstats/sets.py` imports cleanly with no third-party imports beyond the stdlib.
  - [ ] All assertions in Task 5 pass.

---

- [ ] 5. **`rankedstats/test_sets.py` — assert set logic against real fixtures**

  **What to do**:
  - Plain `python3` assert script (no pytest). Loads every
    `winratefetching/docs/fetchresult/battlelog_*.json` **read-only**, filters to `soloRanked` with
    `battleTime >= 20260101`, and asserts the table in the Verification Strategy section.
  - Resolve the owner tag per file by matching the roster `bsid` set against tags present in 100% of
    that file's entries — three files (aambakk, cursed, wafels) have multiple 100%-present tags
    because two roster members queued together, so roster matching is required to disambiguate.
  - Print a one-line PASS/FAIL per assertion and `sys.exit(1)` on any failure.
  - Assert the specific edge cases: the zimma draw set resolves to
    `winning_team_index is None`, and the star_virus 216s-gap group stays a **single** group of 3.
  - Skip gracefully with a clear message if the fixture directory is absent (it is gitignored).

  **Must NOT do**:
  - Do not modify, move, or delete any fixture file.
  - Do not require pytest or any install.
  - Do not hit the network or Supabase.

  **References**:
  - Expected values: Verification Strategy table in this plan.
  - Fixture dir is gitignored: `.gitignore:34` (`winratefetching/docs/fetchresult/`).

  **Acceptance Criteria**:
  - [ ] `python3 rankedstats/test_sets.py; echo $?` -> `0`
  - [ ] Output contains `entries=186`, `groups=126`, `sizes={1: 78, 2: 36, 3: 12}`
  - [ ] Output asserts `reshuffles=0` and `brawler_changes=0/288`
  - [ ] `git status --porcelain winratefetching/` -> empty after the run

---

- [ ] 6. **`rankedstats/supa.py` + `rankedstats/ingest.py` — PostgREST writes and orchestration**

  **What to do**:
  - `supa.py`: thin `requests` wrapper. Base `{SUPABASE_URL}/rest/v1/{table}`, headers
    `apikey`, `Authorization: Bearer <SUPABASE_SECRET_KEY>`, `Content-Type: application/json`,
    `Prefer: return=representation,resolution=merge-duplicates` (or `ignore-duplicates` for
    append-only inserts), `?on_conflict=<col>`. Helpers: `upsert(table, rows, on_conflict, ignore)`,
    `select(table, params)`, `patch(table, filters, payload)`. `raise_for_status()` and echo the
    response body on error — PostgREST error bodies are informative.
  - Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to the root `.env` (already gitignored; verified
    untracked). The secret key must never appear in `stats.html` or any committed file.
  - `ingest.py` — the manual entrypoint, per roster player:
    1. `fetch_battlelog(tag)`; `group_into_sets(items, owner_tag)`.
    2. Upsert every seen participant into `players` on conflict `tag` (merge `name`, `updated_at`).
       Set `is_tracked = true` for roster tags; never downgrade an existing `true` to `false`.
    3. Compute each game's `dedupe_key`. Query `battles?dedupe_key=in.(...)` to find games already
       stored, and reuse their `set_id` if any match — this is what makes a set assembled across
       multiple polls converge.
    4. Otherwise look for an existing set to attach to: same `event_id`, same participant tag set,
       `is_complete = false`, and `ended_at` within `MAX_INTRA_SET_GAP` of the new game.
    5. Otherwise insert a new `ranked_sets` row, `on_conflict=set_key`.
    6. Upsert `set_participants` on `(set_id, player_tag)`.
    7. Insert `battles` with `on_conflict=dedupe_key, ignore-duplicates` — the true idempotency
       guard, and what prevents double-counting when two roster players share a match.
    8. Recompute and PATCH the parent set's `games_played`, `team0_wins`, `team1_wins`,
       `winning_team_index`, `is_complete` from **all** games currently stored for that set.
    9. Sweep: mark any `is_complete = false` set with `ended_at` older than 2 hours as complete.
    - Log a per-player summary (sets seen / new / updated, games inserted / skipped) and a totals
      line. Continue past a single player's failure; exit non-zero if any player errored.
  - Re-running immediately must be a no-op — verify this explicitly.

  **Must NOT do**:
  - Do not add `supabase-py`. Plain `requests` only — zero new dependencies, works under both venvs,
    and avoids the known `httpx` pin conflicts.
  - Do not put the secret key in any file under version control.
  - Do not write any launchd plist, crontab entry, or `.sh` scheduling wrapper.
  - Do not modify `winratefetching/update_all.sh`.
  - Do not rewrite `set_key` when an earlier game of an existing set shows up later.
  - Do not `delete` or full-`upsert` rows on re-run; inserts are append-only + ignore-duplicates.

  **References**:
  - PostgREST upsert headers/params:
    `Prefer: return=representation,resolution=ignore-duplicates` + `?on_conflict=dedupe_key`
    (https://supabase.com/docs/guides/api)
  - Secret key semantics (BYPASSRLS): https://supabase.com/docs/guides/api/api-keys
  - Retry pattern to mirror: `tournamentfetching/fetch_tournament_stats_once.py:207-234`

  **Acceptance Criteria**:
  - [ ] `python3 rankedstats/ingest.py` exits `0` and prints a per-player summary.
  - [ ] Immediate second run reports `0` new sets and `0` new battles (idempotent).
  - [ ] `curl -s "$SUPABASE_URL/rest/v1/battles?select=dedupe_key" -H "apikey: $KEY" \
        -H "Authorization: Bearer $KEY" | jq -r '.[].dedupe_key' | sort | uniq -d | wc -l` -> `0`
  - [ ] `grep -rc 'sb_secret\|service_role' rankedstats/stats.html` -> `0`
  - [ ] `git ls-files rankedstats/ | xargs grep -l 'sb_secret' | wc -l` -> `0`
  - [ ] `git status --porcelain winratefetching/ docs/ update_all.sh` -> empty

---

- [ ] 7. **`rankedstats/migrations/003_views.sql` — aggregate views**

  **What to do**: create read-only aggregate views so the browser sends simple queries. **Every**
  view must be `create or replace view public.<name> with (security_invoker = true) as ...` and be
  followed by `grant select on public.<name> to anon, authenticated;`.

  All views filter `ranked_sets.is_complete = true` and join through `set_participants`. A set is a
  win for a player when `ranked_sets.winning_team_index = set_participants.team_index`; draws and
  `null` winners count as neither win nor loss but are surfaced as a separate `draws` count.

  - `v_player_overall` — per `player_tag`: `sets_played`, `wins`, `losses`, `draws`, `winrate`.
  - `v_player_map` — per `(player_tag, mode, map)`: same measures.
  - `v_player_brawler` — per `(player_tag, brawler_id, brawler_name)`: same measures.
  - `v_player_teammate` — self-join `set_participants` on `set_id` with equal `team_index` and
    `player_tag <> teammate_tag`: per `(player_tag, teammate_tag)`, `sets_together`, `wins`,
    `winrate`, plus the teammate's `name` and `is_tracked`. Covers **all** teammates, not just
    roster members — only one roster pair has ever co-occurred, so restricting to roster would make
    the feature empty.
  - `v_player_recent` — most recent N sets per player with map, mode, brawler, result, `ended_at`,
    for the drill-down list.

  **Must NOT do**:
  - Do not omit `security_invoker = true` — without it a view runs as its creator and bypasses RLS,
    which Supabase's linter flags at ERROR level (`0010_security_definer_view`).
  - Do not compute any stat from `battles`; it is a raw record only.
  - Do not count draws as losses.
  - Do not include incomplete sets.

  **References**:
  - `security_invoker` requirement:
    https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
  - View syntax: https://supabase.com/docs/guides/database/tables

  **Acceptance Criteria**:
  - [ ] `grep -c 'security_invoker = true' rankedstats/migrations/003_views.sql` -> `5`
  - [ ] `grep -c 'grant select' rankedstats/migrations/003_views.sql` -> `5`
  - [ ] Supabase Advisors -> Security shows no `security_definer_view` finding.
  - [ ] `select sum(sets_played) from v_player_overall;` returns a non-zero number after Task 8.
  - [ ] For any player, `wins + losses + draws = sets_played` holds in `v_player_overall`.

---

- [ ] 8. **First real ingestion run + data sanity check**

  **What to do**:
  - Run `001`, then confirmed `002`, then `003` in the Supabase SQL Editor, in order.
  - Run `python3 rankedstats/ingest.py` once, then again to confirm idempotency.
  - Cross-check the live DB against the fixture-derived expectations. The numbers will not match
    exactly (live logs have moved on since the fixtures were captured), so check **shape**, not
    equality: no set has `games_played > 3`; no `set_participants` group has a size other than 6;
    every `rank_value` resolves against `rank_tiers`; no duplicate `dedupe_key`.
  - Spot-check one known set end to end against the raw JSON.

  **Must NOT do**:
  - Do not run `002` before the user confirms the tier mapping — `set_participants.rank_value` has
    an FK to `rank_tiers(value)` and inserts will fail on unseeded tiers.
  - Do not backfill from the fixture files as a shortcut; they are `winratefetching`'s output and
    stale. Fetch fresh.

  **Acceptance Criteria**:
  - [ ] `select count(*) from ranked_sets;` > `0`
  - [ ] `select count(*) from ranked_sets where games_played > 3;` -> `0`
  - [ ] `select count(*) from ranked_sets where games_played = 0;` -> `0`
  - [ ] `select set_id from set_participants group by set_id having count(*) <> 6;` -> 0 rows
  - [ ] `select count(*) from set_participants sp left join rank_tiers rt on
        sp.rank_value = rt.value where sp.rank_value is not null and rt.value is null;` -> `0`
  - [ ] `select dedupe_key from battles group by dedupe_key having count(*) > 1;` -> 0 rows
  - [ ] `select count(*) from ranked_sets where is_complete and winning_team_index is null
        and games_played >= 2;` -> small (draws only), inspect each

---

- [ ] 9. **`rankedstats/stats.html` — standalone local stats page**

  **What to do**:
  - Single self-contained file, inline `<script>` and `<style>`. No build step, no bundler,
    no framework.
  - Load `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` and
    `const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)`.
    Name the client `sb`, **not** `supabase` — the UMD build owns the `supabase` global.
  - Hardcode the project URL and the **publishable** key (`sb_publishable_...`, or legacy `anon`
    if the project only has legacy keys). Safe to commit: access is governed entirely by RLS, and
    only SELECT is granted.
  - UI: a player picker (populated from `players where is_tracked = true`, ordered by name), then
    four sections fed by the Task 7 views:
    1. **Overall** — sets played, W/L/D, winrate (`v_player_overall`).
    2. **By map** — sortable table, mode + map + sets + winrate (`v_player_map`).
    3. **By brawler** — sortable table, brawler + sets + winrate (`v_player_brawler`).
    4. **Teammates** — teammate name/tag, sets together, winrate, roster members flagged
       (`v_player_teammate`).
  - Add a minimum-sample filter (default: hide rows with fewer than 3 sets) to stop 1-set 100%
    rows dominating. Make the threshold a visible input.
  - Handle three states explicitly: loading, error (print `error.message` — an RLS or grant mistake
    surfaces here), and empty ("no ranked sets recorded yet").
  - Queries are plain `sb.from('v_...').select('*').eq('player_tag', tag)` with `.order()`.
  - Header comment: this page is local-only, opened via `file://`, and deliberately not wired into
    Jekyll. Note that `docs/style.css` is not loaded, so styling is self-contained.

  **Must NOT do**:
  - No secret/service_role key. No `.env` reads. No write calls of any kind.
  - Do not place the file in `docs/`, add it to Jekyll nav, or give it front matter.
  - Do not add a bundler, npm install, or `package.json`.
  - Do not name a variable `supabase` at top level.
  - Do not query `battles` or base tables directly for stats — use the views.

  **References**:
  - CDN snippet: https://supabase.com/docs/reference/javascript/installing
  - Publishable vs secret keys: https://supabase.com/docs/guides/api/api-keys
  - Table-sort precedent in this repo (vanilla, no deps): `docs/script.js:3-21`
  - View names and columns: Task 7.

  **Acceptance Criteria**:
  - [ ] `open rankedstats/stats.html` renders without a build step; console has no errors.
  - [ ] Selecting a player with data populates all four sections.
  - [ ] `grep -c 'cdn.jsdelivr.net/npm/@supabase/supabase-js@2' rankedstats/stats.html` -> `1`
  - [ ] `grep -ci 'sb_secret\|service_role' rankedstats/stats.html` -> `0`
  - [ ] Anon writes are rejected — verify RLS end to end:
        ```bash
        curl -s -o /dev/null -w '%{http_code}\n' -X POST \
          "$SUPABASE_URL/rest/v1/players" \
          -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $PUBLISHABLE_KEY" \
          -H "Content-Type: application/json" \
          -d '{"tag":"#TEST","name":"test"}'
        # Assert: 401 or 403, never 201
        ```
  - [ ] Anon reads succeed:
        ```bash
        curl -s "$SUPABASE_URL/rest/v1/v_player_overall?select=*&limit=1" \
          -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $PUBLISHABLE_KEY" | jq 'length'
        # Assert: 1
        ```

---

- [ ] 10. **`rankedstats/README.md`**

  **What to do**: document, briefly —
  - One-time setup: create the Supabase project, run migrations `001` -> `002` -> `003` in the SQL
    Editor in order, add `SUPABASE_URL` + `SUPABASE_SECRET_KEY` to the root `.env`, paste the URL +
    publishable key into `stats.html`.
  - Daily use: `python3 rankedstats/ingest.py` (manual by design), then open `stats.html`.
  - Why only `soloRanked` is ingested (`type: "ranked"` is the trophy ladder).
  - Why stats are set-level (brawler and map are constant per set).
  - That `battleTime` is the battle's **end** time.
  - Future schema changes: add `migrations/NNN_*.sql`, never edit an applied file, never make ad-hoc
    changes in the Table Editor (that silently desyncs the files from the live schema).
  - Future automation: wrap `ingest.py` in a launchd job at ~20 min. That interval keeps an active
    player under the 25-battle log window; the API has no pagination, so anything that rolls off is
    lost permanently. Not built now.
  - Future VM move: all paths already resolve from `__file__` and all config comes from `.env`, so
    the folder is copy-portable. Open item: Brawl Stars API keys appear to be IP-bound, so a new key
    or an added IP will likely be needed — unverified, Supercell's docs are behind a login.
  - That nothing outside `rankedstats/` is modified except two new `.env` keys.

  **Acceptance Criteria**:
  - [ ] File exists and lists migrations in apply order.
  - [ ] States the manual-run command and the soloRanked-only rationale.
  - [ ] `git status --porcelain | grep -v '^?? rankedstats/'` -> empty (nothing else changed).

---

## Success Criteria

### Verification Commands
```bash
python3 rankedstats/test_sets.py            # Expected: exit 0, all assertions PASS
python3 rankedstats/ingest.py               # Expected: exit 0, per-player summary
python3 rankedstats/ingest.py               # Expected: 0 new sets, 0 new battles (idempotent)
git status --porcelain | grep -v '^?? rankedstats/'   # Expected: empty
grep -rn 'sb_secret' rankedstats/stats.html # Expected: no matches
grep -rn '/Users/simenholmen' rankedstats/  # Expected: no matches
```

### Final Checklist
- [ ] `soloRanked` only; no trophy-ladder battles ingested
- [ ] All stats computed at set level from `ranked_sets` + `set_participants`
- [ ] `battles` retained purely as a raw record; no stat derives from it
- [ ] RLS enabled + explicit grants on all 5 tables; SELECT-only for anon
- [ ] All 5 views use `security_invoker = true`
- [ ] Secret key confined to root `.env`; publishable key only in `stats.html`
- [ ] Ingestion is idempotent and tolerates sets assembled across multiple polls
- [ ] `winratefetching/`, `docs/`, `update_all.sh`, `docs/_data/winloss.yml` all unmodified
- [ ] `rank_tiers` seeded only after user confirmation

---

## Open Questions

- **BLOCKER (Task 2, needed before Task 8): rank tier mapping.** Research derived a 22-row ladder
  that matches both user-supplied data points and the observed ceiling of 22, but the user has not
  confirmed it. Tasks 1 and 3–7 proceed regardless; only the first real ingestion is gated, because
  `set_participants.rank_value` carries an FK to `rank_tiers(value)`.
- **Non-blocking: Brawl Stars API key IP-binding.** Relevant only to the future VM move. Verify at
  developer.brawlstars.com whether a key accepts multiple IPs before migrating.
- **Non-blocking: how `winratefetching/update_all.sh` is currently scheduled** is still unknown (no
  launchd plist or crontab found). Moot — the new poller is manual and does not touch that script.
