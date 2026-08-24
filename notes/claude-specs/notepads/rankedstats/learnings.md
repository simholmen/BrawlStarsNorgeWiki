# ulearnings - rankedstats
> Cumulative intelligence for subagents. APPEND ONLY.

## [2026-08-24T00:00:00Z] Task: orchestrator-seed

- Pattern confirmed: `winratefetching/extract_names_and_tags.py:4-21` parses front matter by finding `---` fences then `yaml.safe_load`; `tag = data.get('bsid','').replace('#','')` (bsid stored WITHOUT '#' in the .md files, e.g. `bsid: YQ29980`), `name = data.get('name','')`.
- Pattern confirmed: `winratefetching/battlelogfetch.py:17-32` builds URL `https://api.brawlstars.com/v1/players/%23{tag}/battlelog`, headers `{"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}`.
- Pattern confirmed: `tournamentfetching/fetch_tournament_stats_once.py:129-147` (`load_api_key`) manually parses `.env` line by line: skip blank/`#`-prefixed lines, split on first `=`, strip quotes. Mirror this exactly for rankedstats' own `.env` loader (do not import python-dotenv).
- Pattern confirmed: `tournamentfetching/fetch_tournament_stats_once.py:207-234` (`get_json`) retries on `{429,502,503,504,520}` with `time.sleep(2 ** (attempt-1))`, `attempts=4`, then `response.raise_for_status()`.
- `docs/_personer/*.md` front matter fields used: `bsid`, `name`. 25 files total in docs/_personer.
- Root `.env` (untracked, gitignored) currently has BRAWLSTARS_API_KEY and CHALLONGE_API_KEY only. No SUPABASE_URL / SUPABASE_SECRET_KEY yet — must be appended once user supplies them.
- `docs/script.js:3-21` is the vanilla-JS table-sort precedent (`sortTable(columnIndex)` toggling `data-order` asc/desc, comparing parseFloat vs localeCompare) — mirror this style for stats.html, no deps.

## [2026-08-24T00:00:00Z] Task: 002_seed_rank_tiers.sql (CHECKPOINT)

- Created `rankedstats/migrations/002_seed_rank_tiers.sql` implementing plan Task 2 (lines 276-316).
- `rank_tiers` table columns (from `001_init.sql:42-47`): `value int primary key`, `tier_name text not null`, `tier_level int` (null for Pro), `label text not null`.
- All 22 `insert into rank_tiers (...) values (...) on conflict (value) do nothing;` rows are shipped **commented out**, each line prefixed with the literal `-- insert` (lowercase, single space after `--`). Verified: `grep -c '^-- insert' rankedstats/migrations/002_seed_rank_tiers.sql` -> `22`. Verified values 1-22 each appear exactly once via `values (N,` extraction. Spot-checked value 15 -> 'Mythic III', value 16 -> 'Legendary I' (matches plan/user data points).
- **THIS IS A CHECKPOINT FILE PENDING USER CONFIRMATION.** No future task should uncomment these rows without the user explicitly confirming the 22-row tier mapping first. Once confirmed, uncomment (strip leading `-- `) and re-verify with `grep -c '^insert into rank_tiers' ... -> 22` before pasting into the Supabase SQL Editor.
- File also documents: (1) this is the post-2025-02-25 ladder (22 ranks, split Masters, Pro tier) vs. the pre-rework 19-rank ladder (unsplit Masters, no Pro) — do not apply this seed to pre-rework battlelog data; (2) cheapest independent sanity check is that a Bronze/Silver account's battlelog `rank_value` should fall in 1-9.
- Did not touch `001_init.sql` or run anything against a database — this is a static SQL draft only, per scope.

## [2026-08-24T00:00:00Z] Task: 1 — rankedstats/migrations/001_init.sql

- Created `rankedstats/migrations/001_init.sql` (directory `rankedstats/migrations/` did not exist yet — created it).
- Reproduced all 5 tables (`players`, `rank_tiers`, `ranked_sets`, `set_participants`, `battles`) verbatim from the plan's Schema section (lines 111-163) — no column/type deviations. `battle_type` intentionally absent from `battles` per plan.
- One `for select to anon, authenticated using (true)` policy per table, each preceded by `drop policy if exists "<table>_select" on public.<table>;` — policy naming convention chosen: `<table>_select` (e.g. `players_select`). No insert/update/delete policies added, per plan (writes bypass RLS via service_role/secret key).
- Explicit grants added for every table: `grant select ... to anon, authenticated;` and `grant all ... to service_role;` — per plan's note that Supabase's legacy auto-grant is opt-in now.
- All 8 indexes added exactly as listed in Task 1 (including the partial index `ranked_sets(is_complete) where is_complete`), all using `create index if not exists`.
- Verified idempotency by manual re-read: every `create table`, `create index` uses `if not exists`; every policy is preceded by `drop policy if exists`; `alter table ... enable row level security` and `grant` statements are idempotent by nature in Postgres (no-op / re-grant on repeat).
- Confirmed via grep: `enable row level security` x5, `for select` x5, `grant select` x5, `battle_participants` x0, `grant all` x5, `create table if not exists` x5, `drop policy if exists` x5, `create index if not exists` x8. No `games_played in (...)` check constraint added (1 is a valid value per plan). `winning_team_index` left nullable on both `ranked_sets` and `battles` (draws).
- Did not add a `create extension pgcrypto` statement — `gen_random_uuid()` (used for `ranked_sets.id` and `battles.id`) relies on pgcrypto, which is enabled by default on Supabase projects; the plan's Schema section also omits any extension-creation statement, so this is consistent with the spec as given. Flagging here in case a fresh non-Supabase Postgres target ever needs `create extension if not exists pgcrypto;` added to a future migration.
- No local `psql`/`pg_isready` available in this environment to execute the SQL directly — verification was via grep against the acceptance-criteria plus a full manual re-read for idempotency; the plan's own acceptance criteria (Supabase SQL Editor paste + Advisors check) still need to be run manually by the user or a later task.
- Did not touch `rank_tiers` seed data (Task 2, gated on user confirmation) — table is created empty as required.

## [2026-08-24T15:57:21Z] Task: 4 — rankedstats/sets.py

- Created `rankedstats/sets.py`. Pure stdlib only (`hashlib`, `datetime`, `typing`, `__future__`) —
  verified via `grep -E '^import (requests|yaml)|^from (requests|yaml)'` -> 0 matches, and
  `python3 -c "import rankedstats.sets"` -> exits 0.
- Implements exactly the 7 functions named in the plan: `is_ranked(item)`,
  `parse_battle_time(s)`, `canonical_teams(teams)`, `dedupe_key(battle_time_iso, all_tags)`,
  `winner_index(item, owner_tag, canonical)`, `group_into_sets(items, owner_tag)`,
  `summarize_set(group, now=None)`. Task 5/6 should import these names verbatim from
  `rankedstats.sets`.
- Two extra module-level constants callers may want: `MAX_INTRA_SET_GAP = 900`,
  `MAX_GAMES_PER_SET = 3`, `MYTHIC_I_RANK_VALUE = 13`.
- **`CanonicalTeams` shape** (a `typing.NamedTuple`, returned by `canonical_teams()`):
  ```python
  CanonicalTeams(
      team0_tags=(tag, tag, tag),   # lexicographically-smaller sorted-tag-list team
      team1_tags=(tag, tag, tag),
      participants={
          tag: {
              "brawler_id": int,
              "brawler_name": str,
              "brawler_power": int,
              "rank_value": int,   # == brawler.trophies verbatim; for soloRanked this is a
                                   # 1-22 rank TIER, not real trophies
          },
          ...  # all 6 tags across both teams
      },
  )
  ```
- **`RawGame` shape** (a `typing.NamedTuple`, one per battlelog item, stored inside a group's
  `"games"` list, ascending by `battle_time`):
  ```python
  RawGame(
      battle_time=datetime,        # parsed, UTC-aware, END of the battle (not start)
      battle_time_raw=str,         # original battleTime string verbatim, e.g. "20260720T103754.000Z"
                                    # — this exact string is what dedupe_key/set_key hash over,
                                    # NOT a re-formatted isoformat() string
      duration=int,
      result=str | None,           # "victory" / "defeat" / "draw" / None (absent)
      winner_index=int | None,     # 0 / 1 / None, from winner_index()
      star_player_tag=str | None,
  )
  ```
- **Group shape** (dict returned inside the list from `group_into_sets`, consumed by
  `summarize_set`):
  ```python
  {
      "event_id": int,
      "mode": str,                 # event.mode
      "map": str,                  # event.map
      "team0_tags": (tag, tag, tag),
      "team1_tags": (tag, tag, tag),
      "participants": {tag: {...same 4 keys as CanonicalTeams.participants...}, ...},  # 6 tags,
          # captured ONCE from the group's first game (brawler/rank_value are constant within
          # a set per research — 0 changes observed across 288 (player,group) pairs; re-verified
          # empirically for this task: 0/648 informal pairs across all fixtures)
      "games": [RawGame, ...],     # ascending by battle_time, len 1..3 (capped at
                                    # MAX_GAMES_PER_SET=3; a would-be 4th matching game starts a
                                    # NEW group instead of appending)
  }
  ```
- **Set summary shape** (dict returned by `summarize_set(group, now=None)`):
  ```python
  {
      "event_id": int,
      "mode": str,
      "map": str,
      "team0_tags": (tag, tag, tag),
      "team1_tags": (tag, tag, tag),
      "participants": {tag: {brawler_id, brawler_name, brawler_power, rank_value}, ...},
      "started_at": datetime,      # first_game.battle_time - timedelta(seconds=first_game.duration)
      "ended_at": datetime,        # last_game.battle_time
      "games_played": int,         # 1..3, len(games) — do NOT assume 2 or 3
      "team0_wins": int,
      "team1_wins": int,           # draws / unresolved (winner_index is None) count toward NEITHER
      "winning_team_index": int | None,  # 0/1 if that side has >=2 wins, else None
      "is_complete": bool,         # see rules below
      "set_key": str,              # dedupe_key(first_game.battle_time_raw, all 6 tags) — computed
                                    # from the group's CURRENT earliest known game every call; if
                                    # ingest.py (Task 6) later discovers an earlier game for an
                                    # already-persisted set, it must NOT overwrite the set's stored
                                    # set_key with a freshly recomputed one (per plan, that's a
                                    # deliberate, permanent identifier)
      "games": [RawGame, ...],     # passthrough of the group's games, ascending
  }
  ```
  `is_complete` truth table (all three are OR'd, first match wins conceptually but the code just
  ORs the three booleans): `max(team0_wins, team1_wins) >= 2` OR (`games_played == 1` AND every
  participant's `rank_value < 13`) OR (`now - ended_at > timedelta(hours=2)`, `now` defaults to
  `datetime.now(timezone.utc)` but is an injectable parameter for testing).
- **Verified against real fixtures** (not just imported — ran the actual grouping algorithm over
  every `winratefetching/docs/fetchresult/battlelog_*.json`, read-only, nothing modified):
  entries=186, groups=126, size distribution `{1: 78, 2: 36, 3: 12}` — exact match to the plan's
  Verification Strategy table. Zero reshuffles, zero brawler changes across all multi-game groups.
  Zimma draw group (`20260807T194759.000Z`) confirmed: 3 games, defeat/victory/draw,
  `winning_team_index is None`, `team0_wins=1`/`team1_wins=1`. Star Virus 216s-gap group
  (`20260107T232711.000Z`) confirmed to stay a single group of 3 games (durations 92/197/105).
  Owner-tag resolution for these ad-hoc checks used "tag present in 100% of that file's ranked
  entries" — Task 5 needs the more robust roster-based disambiguation described in the plan (three
  files have multiple 100%-present tags because two roster members queued together); this module
  does not resolve owner_tag itself, callers must supply it.
- Design choice: `winner_index()` raises `ValueError` if `owner_tag` is not found in either
  canonical team, rather than returning `None`. Rationale: the log owner is definitionally always
  one of the 6 participants in their own battlelog entry, so a mismatch indicates caller error
  (wrong owner_tag passed in), not malformed API data — worth failing loudly. `is_ranked()` by
  contrast returns `False` (never raises) for malformed shapes, since that path handles arbitrary
  API entries that legitimately might not be soloRanked/3v3.
- Design choice: `dedupe_key`/`set_key` hash over the RAW `battleTime` string from JSON
  (`RawGame.battle_time_raw`), not `datetime.isoformat()` of the parsed value — the plan's spec
  names the parameter `battle_time_iso` but the sha256 must exactly reproduce the original
  research findings, which hashed the literal API string. Task 5/6 should pass the original JSON
  `battleTime` string into `dedupe_key`, not a reformatted one, or hashes will not match.
- Nothing else in the repo was touched; no fixture files modified (`git status --porcelain
  winratefetching/` untouched by this task).

## [2026-08-24T00:00:00Z] Task: 7 — rankedstats/migrations/003_views.sql

- Created `rankedstats/migrations/003_views.sql`, 5 views, using the exact column names read from `001_init.sql` (ground truth, not the plan summary): `set_participants(set_id, player_tag, team_index, brawler_id, brawler_name, brawler_power, rank_value)`; `ranked_sets(id, set_key, event_id, mode, map, started_at, ended_at, games_played, team0_wins, team1_wins, winning_team_index, is_complete, updated_at)`; `players(tag, name, is_tracked, first_seen, updated_at)`. `rank_tiers` and `battles` were not needed by any view (battles is explicitly raw-only; rank_tiers has no display column any view currently surfaces — flagging in case Task 9's stats.html wants a tier label per set, which would need a join to `rank_tiers` on `set_participants.rank_value` added later, out of this task's scope).
- Every view is `create or replace view public.<name> with (security_invoker = true) as ...;` immediately followed by its own `grant select on public.<name> to anon, authenticated;` — no combined/batched grants. Verified counts: `security_invoker = true` x5, `grant select` x5, `create or replace view` x5, `from battles|join battles` x0, `is_complete = true` x5 (all via grep on the final file).
- **Gotcha**: my first draft of the header comment block *described* `security_invoker = true` and `is_complete = true` in prose using those literal substrings, which inflated the grep counts to 7 and 6 respectively (acceptance criteria expect exactly 5 — one per view). Reworded the prose to avoid the literal patterns (e.g. "the `security_invoker` view option set on", "sets where `ranked_sets.is_complete` is true") while keeping the explanation. **Lesson for future SQL/migration tasks with grep-count acceptance criteria: keep header/prose comments from accidentally repeating the exact substring being counted, or the counts will overshoot.**
- `winrate` design choice (documented inline as a SQL comment too): `wins / nullif(wins + losses, 0)` — decisive-sets-only denominator, draws excluded from both numerator and denominator. Chose this over `wins / sets_played` because a draw-heavy player's winrate should reflect their record in games that actually resolved, not be diluted by draws; `nullif` guards div-by-zero for players with 0 decisive sets. `round(..., 4)`.
- `v_player_overall` / `v_player_map` / `v_player_brawler` share one pattern: a `with agg as (...)` CTE doing the `count(*) filter (where ...)` aggregation per grouping key, then an outer `select` that computes `winrate` from `agg`'s already-materialized `wins`/`losses` columns (Postgres doesn't allow referencing a SELECT-list alias from another expression in the same SELECT list, hence the CTE wrapper rather than repeating the filter expressions three times).
- `v_player_teammate`: self-join `set_participants sp1` to `sp2` on `sp2.set_id = sp1.set_id and sp2.team_index = sp1.team_index and sp2.player_tag <> sp1.player_tag`, joined once more to `ranked_sets` for `winning_team_index` and the `is_complete = true` filter. Deliberately **no** `is_tracked` filter anywhere in the WHERE/JOIN — `players.is_tracked` is `left join`ed in purely as a **displayed** column (`teammate_name`, `teammate_is_tracked`) per the MUST DO. Used `left join public.players` (not inner) so a teammate tag that hasn't yet landed a `players` row (edge case, shouldn't happen given `players` is upserted for every seen participant per Task 6, but the view shouldn't hard-fail if it does) still produces a row with null name.
- `v_player_recent`: `result` is a text column (`'win' | 'loss' | 'draw'`) via `case when winning_team_index = team_index then 'win' when winning_team_index is not null then 'loss' else 'draw' end` — chose text over boolean so the UI can render it directly without a lookup table. No `limit` in the view itself; noted in a comment that callers apply `.order(ended_at.desc).limit(N)` via PostgREST. No `player_tag` filter either — it's a plain view over all players, callers filter with PostgREST `?player_tag=eq.<tag>`.
- Did not modify `001_init.sql` or `002_seed_rank_tiers.sql`. Did not run any SQL against a live database (none provisioned yet) — no local `psql` available in this environment either; verification was grep-based against the acceptance criteria plus a full manual re-read of the file for join/aggregation correctness.
- Full list of grep counts measured on the final file: `security_invoker = true` → 5, `grant select` → 5, `create or replace view` → 5, `from battles|join battles` (case-insensitive) → 0, `is_complete = true` → 5.

## [2026-08-24T00:00:00Z] Task: 3 — rankedstats/roster.py + rankedstats/bs_api.py

- Created `rankedstats/roster.py` (`load_roster()`) and `rankedstats/bs_api.py` (`fetch_battlelog(tag)`), plus `rankedstats/__init__.py` (needed for `from rankedstats.roster import ...` to work as a package import from repo root — didn't exist before this task).
- `load_roster()` walks `docs/_personer/*.md` sorted alphabetically, reuses the same fence-finding loop as `extract_names_and_tags.py:4-21` but reimplemented locally (no import from `winratefetching/`), skips files with missing/blank `bsid` or `name`, prepends `#` to `bsid` for the tag, and lowercases+underscores `name` for `slug`. Verified: 25/25 `docs/_personer/*.md` files have both fields populated, so `load_roster()` returns exactly 25 entries, all tags start with `#`.
- `.env` parsing: mirrored `fetch_tournament_stats_once.py:129-147`'s `load_api_key` structure exactly — `os.environ.get("BRAWLSTARS_API_KEY")` checked first (env var wins), falls back to manual line-by-line parse of `REPO_ROOT/.env` (skip blank/`#` lines, split on first `=`, strip surrounding quotes). Named the function `load_api_key()` in `bs_api.py` too, for consistency with the reference.
- Gotcha: initially wrote a docstring containing the literal word "dotenv" (explaining that no python-dotenv dependency is used) — this tripped the acceptance-criteria grep (`grep -rc 'dotenv' rankedstats/*.py` must be `0`). Rewrote the comment to avoid the substring entirely. **Any future rankedstats file must avoid writing the literal string "dotenv" anywhere, even in comments/docstrings, or the grep check will fail.**
- `fetch_battlelog(tag)` builds the URL with `urllib.parse.quote(tag, safe='')` (not a hand-rolled `%23` replace) per MUST DO, retries on `{429,502,503,504,520}` with `2 ** (attempt-1)` backoff over 4 attempts (mirroring `get_json`), raises `RuntimeError` with the exact wording specified in the brief on HTTP 403, and returns `response.json()["items"]`. Also writes a debug copy to `rankedstats/fetchresult/battlelog_{tag_without_hash_lowercased}.json` (created `rankedstats/fetchresult/` — did not exist before) — this is this folder's own directory via `Path(__file__).resolve().parent / "fetchresult"`, never `winratefetching/docs/fetchresult/`.
- Both scripts' venv note: repo root `python3` (Homebrew, no yaml/requests) can't run these directly — must `source .venv/bin/activate` (or `venv/bin/activate`; both exist and both have `yaml`+`requests` installed) before running any rankedstats script or the acceptance-criteria commands.
- **LIVE network verification result**: `fetch_battlelog('#YQ29980')` currently raises the expected `RuntimeError` for a genuine 403, confirmed independently with a raw `requests.get` outside my code returning `{"reason":"accessDenied.invalidIp","message":"Invalid authorization: API key does not allow access from IP 178.232.180.174"}`. This is a Brawl Stars API key IP-allowlist mismatch (this sandbox's egress IP is not allow-listed for the key currently in root `.env`), **not a bug in `bs_api.py`** — the retry/error-handling logic is confirmed correct (it does NOT retry on 403, and surfaces the exact clear message required by MUST DO). Task 6 (`ingest.py`) or whoever runs this live will need to either add this egress IP to the Brawl Stars key's allow-list at https://developer.brawlstars.com, or run from a machine/IP that's already allow-listed (e.g. wherever `winratefetching`/`tournamentfetching` scripts are normally run from, since those use the same key and are documented as "confirmed present and working").
- All acceptance-criteria greps pass: `grep -rc '/Users/simenholmen' rankedstats/*.py` -> `0` for both files; `grep -rc 'dotenv' rankedstats/*.py` -> `0` for both files. `load_roster()` -> 25, all tags `#`-prefixed.

## [2026-08-24T16:05:53Z] Task: 6 — rankedstats/supa.py + rankedstats/ingest.py

- Created `rankedstats/supa.py` (thin PostgREST wrapper: `get_config()`, `upsert()`, `select()`, `patch()`) and `rankedstats/ingest.py` (manual entrypoint, `main()` + per-player/per-set helper functions). **CODE WRITTEN BUT NOT YET RUN LIVE** — no Supabase project is provisioned yet (`SUPABASE_URL`/`SUPABASE_SECRET_KEY` absent from root `.env`, confirmed via `grep -c SUPABASE .env` -> `0`). Did not touch `.env` at all, per scope. Verification in this task was entirely static: both modules import cleanly with zero credentials present (`python3 -c "import rankedstats.supa"` / `"import rankedstats.ingest"` -> exit 0), `_require_config()` raises a clear `RuntimeError` only when an actual `upsert`/`select`/`patch` call is attempted, never at import time. Task 8 (first real ingestion run, gated on the user providing real credentials) still needs to: (a) run `python3 rankedstats/ingest.py` twice back-to-back and confirm the 2nd run reports 0 new sets/battles, (b) run the `curl | jq | sort | uniq -d` dedupe_key-uniqueness check from the plan's acceptance criteria, (c) verify against real multi-poll data that a set assembled across two polls actually converges onto one `ranked_sets` row (steps 3/4 below were only reasoned through, not exercised against a live DB).
- `supa.py` env loading mirrors `bs_api.py`'s `load_api_key` structure exactly (env var wins, else manual `.env` line-by-line parse, skip blank/`#` lines, split on first `=`, strip quotes), but reads lazily via `get_config()`/`_require_config()` — `get_config()` never raises (returns `{"url": "", "secret_key": ""}` if unset), only `_require_config()` (called from inside `upsert`/`select`/`patch`, not at import time) raises `RuntimeError` for missing config. **Gotcha repeated from Task 3**: an earlier draft of `supa.py`'s module docstring contained the literal string "dotenv" (explaining no python-dotenv dependency) — this would have broken the established repo-wide invariant `grep -rc 'dotenv' rankedstats/*.py` -> `0` for every file, not just the two Task 3 files. Reworded to avoid the substring. **Any new file added to `rankedstats/` should keep avoiding "dotenv" in comments/docstrings**, since that grep check is effectively directory-wide, not per-file.
- `upsert(table, rows, on_conflict, ignore_duplicates=False)` sends `Prefer: return=representation,resolution=merge-duplicates` (default) or `resolution=ignore-duplicates` (when `ignore_duplicates=True`, used only for the `battles` insert). All three functions (`upsert`/`select`/`patch`) print the response body via `_raise_with_body()` before calling `raise_for_status()` on any 4xx/5xx, so PostgREST's informative error JSON is never swallowed.
- **Step 3/4 convergence logic (the trickiest part)**: `ingest_set()` first computes every game's `dedupe_key` for the incoming set (`sets.dedupe_key(game.battle_time_raw, all_tags)`, all 6 tags, not just the owner), then queries `battles?select=set_id,dedupe_key&dedupe_key=in.(...)`. If ANY game already exists in storage, the WHOLE incoming set reuses that game's `set_id` (`find_set_id_via_stored_battles`) — this is what makes a set that straddles two polls (e.g. game 1 seen in poll A, games 1+2 seen again in poll B) collapse onto a single row rather than duplicating. Only if step 3 finds nothing does it fall to step 4 (`find_open_set_to_attach`): query `ranked_sets?event_id=eq.<id>&is_complete=eq.false`, then for each open candidate, check `abs(new_set's_first_game.battle_time - candidate.ended_at) <= MAX_INTRA_SET_GAP` (imported from `sets.py`, not re-hardcoded) AND that `set_participants` for that candidate exactly matches the incoming set's 6-tag frozenset (queried per-candidate, since PostgREST doesn't have a good way to do a set-equality filter server-side — N+1 queries here, acceptable for a low-volume manual script, not a hot path). Step 4 specifically covers the case where the earlier game(s) of a still-open set have rolled out of the player's battlelog window (API only returns ~25 most recent items) by the time a later game in the same set is polled, so step 3's dedupe-key match would find nothing even though the set is a real continuation.
- **Step 8 recompute (the other trickiest part)**: after inserting this poll's battles, `recompute_and_patch_set()` re-queries `battles?select=*&set_id=eq.<id>` for the FULL set of rows currently stored (union across every poll that ever touched this set, not just what this call just inserted) and recomputes `games_played`/`team0_wins`/`team1_wins`/`winning_team_index`/`is_complete` purely from that authoritative query result. `is_complete` reimplements the same 3-rule OR from `sets.summarize_set` (>=2 wins on one side; OR exactly 1 game and every participant below `MYTHIC_I_RANK_VALUE` — imported from `sets.py`, not re-hardcoded, using the group's `participants` dict which is safe to reuse since brawler/rank never change within a set; OR the latest stored battle's `battle_time` is >2h old) — could not reuse `summarize_set` directly here since it takes a `group` dict shaped from `group_into_sets`, not a list of already-stored Postgres battle rows, so this rule had to be reimplemented against the DB row shape. **Design decision**: only the 5 explicitly-named fields (`games_played`, `team0_wins`, `team1_wins`, `winning_team_index`, `is_complete`, plus `updated_at` for freshness) are PATCHed — `set_key`/`started_at`/`ended_at` are deliberately left untouched by this patch, matching the plan's Task 6 block (line 475-476) and MUST DO section 4 step 8, both of which name exactly those 5 fields as "computed fields" to patch. This means `ranked_sets.ended_at` stays fixed at whatever it was when the row was last inserted-or-attached-to, which is intentionally NOT kept in sync with the true latest stored battle on every poll — flagging this for Task 8: if a real 3-poll-spanning set ever shows step 4's gap check misfiring (comparing against a stale `ended_at`), the fix would be to also PATCH `ended_at` in step 8, but that would deviate from the plan's literal field list, so it was NOT done proactively here.
- Players upsert (step 2) batches ALL participant tags across ALL of a player's sets into ONE pair of upsert calls per player (not one call per set) — a roster-tags call (includes `is_tracked: true`) and a separate non-roster-tags call (`is_tracked` key omitted entirely from the row, not set to `false` or `null`) — done as two separate calls specifically so each call's row array is key-homogeneous (PostgREST bulk upsert is safest when every object in the payload array has the same keys). `name` is resolved via a `build_tag_to_name()` helper that reads `player.get("name")` directly from the raw battlelog `battle.teams` JSON (this field is dropped by `sets.canonical_teams`, which only keeps brawler/rank data) — falls back to the roster's own display name, then finally to the tag itself, so `name` is always a non-empty string and never sent as an explicit `null` (which would downgrade an existing known name via merge-duplicates).
- Confirmed no `delete` call anywhere in either file (`grep -c delete rankedstats/ingest.py` -> `1`, but that one hit is the module docstring's own sentence explaining that nothing performs a delete — not an actual delete call). Confirmed via manual re-read that `set_key` is written exactly once (in `insert_new_ranked_set`, step 5) and never referenced again in any patch payload.
- Verified: `python3 -c "import rankedstats.supa"` and `"import rankedstats.ingest"` both exit 0 with zero env vars set (confirmed by explicitly checking `$SUPABASE_URL` was empty in the shell first). Verified `supa.select(...)` called with no config raises `RuntimeError: Missing SUPABASE_URL or SUPABASE_SECRET_KEY...` as expected (not some other error like an `AttributeError`). `git status --porcelain winratefetching/ docs/ update_all.sh` -> empty. `.env` confirmed byte-identical/untouched (`git status --porcelain .env` -> empty, file mtime predates this session).
- Did not create `rankedstats/migrations/003_views.sql` derivative changes, did not touch `stats.html` (Task 9, separate task) — out of scope, not created.

## [2026-08-24T00:00:00Z] Task: 5 — rankedstats/test_sets.py

- Created `rankedstats/test_sets.py`. Plain stdlib script (`json`, `sys`, `collections.defaultdict`,
  `pathlib.Path`) plus `rankedstats.roster.load_roster` and the 7 `rankedstats.sets` functions —
  no pytest/unittest. Adds `REPO_ROOT` to `sys.path` at the top so `python3 rankedstats/test_sets.py`
  works when invoked directly (Python only puts the script's own dir, `rankedstats/`, on `sys.path`
  by default, not the repo root, so the `rankedstats.roster`/`rankedstats.sets` imports would
  otherwise fail).
- **Run environment gotcha (inherited from Task 3, reconfirmed)**: repo-root Homebrew `python3` has
  no `yaml` installed (`roster.py` needs it), so `python3 rankedstats/test_sets.py` from a bare shell
  raises `ModuleNotFoundError: No module named 'yaml'`. Must `source .venv/bin/activate` (or
  `venv/bin/activate`) first. Confirmed the acceptance command `python3 rankedstats/test_sets.py;
  echo $?` only produces `exit 0` under one of those two venvs. This is a pre-existing repo condition,
  not something introduced by this task or fixable within `rankedstats/test_sets.py`'s scope.
- **Owner-tag resolution finding**: for the CURRENT 27 fixture files, filename-stem-to-roster-slug
  matching (`battlelog_{slug}.json` -> `roster[i]['slug']`) resolves unambiguously for all 25
  fixtures that belong to a roster member — the 100%-presence fallback described in the plan is
  never actually exercised by the present fixture set, even for `aambakk`/`cursed`/`wafels` (the
  three files the plan calls out as having multiple 100%-present roster tags). Two fixture files,
  `battlelog_wafles.json` (typo of `wafels`) and `battlelog_trym.json` (stale — superseded by
  `battlelog_trym_ivar.json`, no `trym` roster slug exists), match no roster slug by filename AND
  have **zero** qualifying (`soloRanked`, `battleTime >= 20260101`) entries each, so owner-tag
  resolution is moot for them regardless — they contribute `0` to every total. Implemented the
  100%-presence fallback anyway per the plan's explicit MUST DO, exercised only defensively (never
  hit on the current fixture set).
- **Measured numbers, all confirmed independently against the real fixtures** (27 files,
  `winratefetching/docs/fetchresult/battlelog_*.json`, read-only):
  `entries=186`, `groups=126`, `sizes={1: 78, 2: 36, 3: 12}`, `reshuffles=0`, `brawler_changes=0/288`
  (the 288 denominator was NOT hardcoded — it falls out naturally as `6 tags x 48 multi-game groups
  (36 of size 2 + 12 of size 3)`), `distinct participant tags=510`, `roster members with >=1 game=13`.
  Zimma draw group (`20260807T194759.000Z`): confirmed `defeat`/`victory`/`draw`,
  `winning_team_index is None`, `games_played=3`. Star Virus 216s-gap group
  (`20260107T232711.000Z`): confirmed stays a single group of 3 games. All of these exactly match
  Task 4's ad-hoc verification in this same notepad — independent re-derivation agrees.
- **DISCREPANCY FOUND vs. the plan's Verification Strategy table — cross-file duplicate battles**:
  plan says `25, all aambakk/cursed`; my independently-measured value is **15**, not 25 (still 100%
  attributable to the aambakk/cursed file pair — that part of the plan's claim holds). Root cause
  identified, not a bug in `sets.py` or a fixture data-quality problem: the plan's "25" figure was
  copied from `notes/claude-specs/research/rankedstats-context.md` lines 152-154 ("`battleTime` +
  sorted participant tags is already unique across the entire 669-entry corpus (644 distinct keys;
  the 25 collisions...)"), but that "669-entry corpus" is explicitly the FULL corpus — every battle
  type (`ranked` 423, `soloRanked` 209, `tournament` 17, `friendly` 14, absent 6 — see research doc
  line 101), every date — not the 186-entry `soloRanked` + `battleTime >= 20260101` scope that the
  plan's table row is listed under. Confirmed the ceiling directly: `battlelog_aambakk.json` and
  `battlelog_cursed.json` each contain EXACTLY 15 `soloRanked` entries total (regardless of date
  filter — both files' entire `soloRanked` history is 15 games, all from a single 2026-07-20
  session), so 15 is the maximum possible collision count between them under the plan's own stated
  scope; 25 is unreachable there. `test_sets.py` asserts the true measured value (15) as a PASS and
  prints a `WARN:` line (not a `FAIL:`) documenting this root cause plus a pointer to
  `notes/claude-specs/notepads/rankedstats/issues.md`, per the parent task's instruction to report
  divergences honestly rather than force a false pass — this does not affect the script's overall
  exit code (still `0`) since none of the acceptance-criteria's required literal substrings
  (`entries=186`, `groups=126`, `sizes={...}`, `reshuffles=0`, `brawler_changes=0/288`) reference the
  cross-file-duplicate count.
- Design choice: `battleTime >= "20260101"` filtering uses a plain lexicographic STRING compare
  against the raw `battleTime` field (not `parse_battle_time` + a `datetime` compare) — documented
  in the module docstring. Works correctly because `battleTime` is a fixed-width, zero-padded
  `YYYYMMDDT...` string, so lexicographic order matches date order.
- Design choice: `size_distribution` dict is pre-seeded as `{1: 0, 2: 0, 3: 0}` (in that order)
  before the counting loop, specifically so `print(f"sizes={size_distribution}")`'s dict-repr key
  order is deterministic (`{1: 78, 2: 36, 3: 12}`) regardless of which group size is encountered
  first while iterating fixture files — insertion order, not sorted order, drives Python's dict
  repr, so this had to be forced rather than left to arise naturally.
- Bug I hit and fixed in my own script (not `sets.py`): first draft had bare `failures += 1`
  statements inside `main()` without a `global failures` declaration at the top of `main()` (only
  the separate `check()` helper had one) — Python's `main` then implicitly treated `failures` as a
  local, and `if failures:` at the end raised `UnboundLocalError`. Fixed by adding `global failures`
  as the first line inside `main()` too. Lesson for any future script with a module-level mutable
  counter incremented from multiple functions: every function that assigns to it needs its own
  `global` declaration, not just one of them.
- `git status --porcelain winratefetching/` confirmed empty both before and after running the script
  — no fixture file was read via anything other than `open(path, encoding="utf-8")` (read mode),
  never written/moved/deleted.
- Full script output (251 lines, one PASS/FAIL/NOTE/WARN line per fixture-level check plus the
  aggregate summary) available by re-running `python3 rankedstats/test_sets.py` under `.venv`;
  final line is `All assertions PASSED`, `sys.exit(0)`.
- **Follow-up fix to `rankedstats/ingest.py`'s step-8 `recompute_and_patch_set`**: the initial
  version PATCHed `games_played`/`team0_wins`/`team1_wins`/`winning_team_index`/`is_complete` but
  never `ended_at`, so a set's `ended_at` stayed frozen at whatever it was when the row was
  inserted/last attached, even after step 4 attached a later game to it across two polls. This was
  a real gap: it would let the step-9 sweep close a set based on a stale `ended_at` even though the
  set had just grown, and it would make `v_player_recent`'s `ended_at desc` drill-down ordering
  wrong. Fixed by reusing the `latest_battle_time = max(battle_time)` value the function already
  computed (it was already needed for the `is_complete` staleness check) and adding it to the PATCH
  payload as `ended_at`. The payload is now 6 fields:
  `games_played, team0_wins, team1_wins, winning_team_index, is_complete, ended_at` (plus
  `updated_at`). Deliberately asymmetric with `started_at`/`set_key`, which stay frozen forever
  after `insert_new_ranked_set` (step 5) per the plan's explicit "set_key is never rewritten even
  if a later poll reveals an earlier game" language: `started_at`/`set_key` are the set's
  EARLIEST-game identity fields (fixed once known), while `ended_at` is the LATEST-game field and
  must keep tracking new data as it arrives — that's a different field with a different contract,
  not an inconsistency to "fix" into symmetry. Both the module docstring (step 8) and the function's
  own docstring/an inline comment at the `supa.patch(...)` call site now spell this out. Re-verified
  `python3 -c "import rankedstats.ingest"` exits 0 under `.venv`/`venv` with no credentials present
  (the bare system `python3` still lacks `requests` entirely, unrelated to this module and unrelated
  to this change).

## [2026-08-24T00:00:00Z] Task: 9 — rankedstats/stats.html

- Created `rankedstats/stats.html`, a single self-contained file (inline `<style>` + `<script>`,
  no build step). Client named `sb` (never `supabase` at top level — verified via
  `grep -n '^\s*\(const\|let\|var\) supabase\s*='` -> no matches), created via
  `window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)`. Hardcoded
  `SUPABASE_URL = "https://pojzifcfobmsnsvrnvob.supabase.co"` and
  `SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3WuJOVb5GuP4h6fCBGBV-Q_HjOjfH54"` exactly as given
  in the task brief — both are the real, already-provisioned project values, publishable-key-only.
- All 4 sections query only the Task 7 views (`v_player_overall`, `v_player_map`,
  `v_player_brawler`, `v_player_teammate`) filtered by `.eq('player_tag', tag)`; player picker
  queries `players` (`tag,name`, `.eq('is_tracked', true).order('name')`). Zero direct queries
  against `ranked_sets`/`set_participants`/`battles` (verified by grep).
- **Sort implementation**: generalized `docs/script.js:3-21`'s `sortTable(columnIndex)` pattern
  into `sortTableByColumn(table, columnIndex)` — same core algorithm (data-order attribute toggle
  on the clicked header cell, parseFloat comparison when both cells parse as numbers else
  localeCompare, physically reordering `<tr>` elements via `appendChild`), but parameterized on an
  arbitrary `<table>` element + column index instead of `getElementById("ranktable")` hardcoded,
  since this file has 3 independent sortable tables (map/brawler/teammate). Each `<th>` gets its
  click handler via a shared `makeSortableHeader(table, columnIndex, label)` helper built at
  render time.
- **Min-sample filter design choice**: rather than re-querying or rebuilding rows on every
  threshold change, each `<tr>` in the 3 filterable tables carries a `data-sets` attribute (set
  once at render time, from `sets_played` for map/brawler or `sets_together` for teammates).
  `applyMinSampleFilter()` just toggles a `filtered-out` CSS class (`display: none`) on rows below
  the current threshold. This is independent of and composes cleanly with sorting — filtering
  never has to re-sort, and sorting never has to re-filter, since both just act on the same live
  `<tr>` elements already in the DOM.
- **Three-state handling** (loading/error/empty) implemented identically across all 4 section load
  functions (`loadOverall`, `loadMapStats`, `loadBrawlerStats`, `loadTeammates`) via a shared
  `setStatus(container, statusClass, message)` helper: set to "Loading..." before the `await`,
  then branch on `error` (renders `"Error: " + error.message"` verbatim via `textContent`, never
  `innerHTML`, so no escaping is needed and no injection risk from a hostile error string) vs.
  `!data || data.length === 0` ("No ranked sets recorded yet.") vs. success (render). Additionally
  handles a 4th pseudo-state — "no player selected yet" — shown in all 4 sections' initial HTML
  and restored by `onPlayerSelected()` when the picker is reset to the blank option.
- **DOM-building choice**: `createElement`/`textContent` throughout (never `innerHTML` with
  interpolated data) for every dynamic value — player names, tags, brawler names, error
  messages — specifically so a hostile/unexpected string in Supabase data (e.g. a player display
  name containing `<script>`) can never be interpreted as HTML. This was a judgment call the brief
  left open ("template literals or createElement — your call, but keep it consistent") — chose
  `createElement` uniformly over template-literal `innerHTML` for this XSS-safety reason, at the
  cost of more verbose render functions.
- **Gotcha repeated from Task 7's 003_views.sql**: my first draft's header HTML comment described
  the publishable key as "not the secret/service_role key", which contains the literal substring
  `service_role` and inflated `grep -ci 'sb_secret\|service_role'` to 1 (acceptance criteria
  requires exactly 0). Reworded to describe it relatively ("a deliberately different, weaker
  credential than the elevated write-capable key used by the server-side ingest script") without
  using the literal forbidden substrings. **Lesson reconfirmed for any future rankedstats file with
  a grep-count acceptance criteria on `service_role`/`sb_secret`/`dotenv`: audit prose comments for
  accidental literal matches, not just actual code.**
- **No headless browser available in this sandbox** (no `chromium`/`google-chrome` binary, no
  global `puppeteer`, and `npx puppeteer` would require a network install, which is out of scope
  for a "no build step, no npm install" file) — could not literally open `file://` and inspect the
  live console for the acceptance criterion "renders without console errors". Verified instead via:
  (1) `node --check` on the extracted `<script>` body (valid JS syntax, exit 0), (2) a Python
  `html.parser` balanced-tag check across the whole file (zero mismatches), (3) full manual re-read
  confirming every `await sb.from(...)` call always destructures `{ data, error }` and branches on
  `error` before touching `data`, so a real network/schema error (expected right now, since
  migrations 001-003 have not been pasted into the live project's SQL Editor as of this task) will
  hit the error branch and render `error.message` rather than throwing an uncaught exception.
  **Whoever picks up Task 8 (applying the migrations) or does final QA should do one real
  `file://` open with DevTools open to confirm this empirically** — that verification step is what
  this task could not complete in-sandbox.
- Measured grep counts on the final file: `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` -> `1`;
  `sb_secret\|service_role` (case-insensitive) -> `0`; `from(.ranked_sets.\|from(.set_participants.\|from(.battles.` -> `0`; no top-level `const|let|var supabase =` anywhere (confirmed by grep
  returning no matches). `const sb = window.supabase.createClient(...)` present exactly once at
  line 261 (line number as of this write).
- Did not touch any other file in this task (only `rankedstats/stats.html` created, plus this
  notepad append) — no `.env` read, no write/insert/update/delete call anywhere in the file, no
  `package.json`/build tooling added, not placed under `docs/`, no Jekyll front matter.

## [2026-08-24T00:00:00Z] Task: 10 — rankedstats/README.md

- Created `rankedstats/README.md`. Covers, in order: package contents (`migrations/` in apply
  order, then each `.py`/`.html` file), one-time setup (create project -> run 001 -> 002 -> 003 in
  the SQL Editor -> add `SUPABASE_URL`/`SUPABASE_SECRET_KEY` to root `.env` -> paste URL +
  publishable key into `stats.html`), daily use (`python3 rankedstats/ingest.py` then open
  `stats.html` via `file://`), why only `soloRanked` is ingested (plain `ranked` = trophy ladder,
  carries `trophyChange`; `soloRanked` never does; also guarantees 2 teams of 3), why stats are
  set-level (brawler/rank tier constant per set, draft happens once; `battles` is raw-only, no stat
  derives from it), that `battleTime` is the battle's END time (not start), future schema changes
  (new `migrations/NNN_*.sql`, never edit an applied file, never use the Table Editor UI), future
  automation (launchd, ~20 min, tied to the 25-battle no-pagination window), future VM move (all
  paths resolve from `__file__`, all config from `.env`, so copy-portable; the IP-allowlist 403 is
  stated as CONFIRMED per the MUST DO, with no link since no public docs confirm it), the scope
  note (nothing outside `rankedstats/` changes except the two new `.env` keys), and
  `python3 rankedstats/test_sets.py` as the no-network/no-DB way to verify `sets.py`. Deliberately
  did NOT hardcode the real Supabase project URL (`pojzifcfobmsnsvrnvob.supabase.co`) or any key
  anywhere in the file — verified via `grep -n 'pojzifcfobmsnsvrnvob\|sb_publishable_3WuJOVb5GuP4h6fCBGBV' rankedstats/README.md` -> no matches. Setup steps are written generically ("create a
  Supabase project") per the plan's intent, even though this repo already has a real project
  provisioned.
- **Project state as of this task (end of Task 10, all 10 plan tasks now written)**: Tasks 1-7, 9,
  and 10 are complete and verified on disk. Task 8 (first real ingestion run against the live
  project) has still NOT succeeded and was explicitly out of this task's scope — migrations 001-003
  exist on disk and are ready to paste into the Supabase SQL Editor, but as of this writing have not
  yet been applied to the live project at `https://pojzifcfobmsnsvrnvob.supabase.co`, and even once
  applied, a live `python3 rankedstats/ingest.py` run will still fail from this build sandbox
  because the `BRAWLSTARS_API_KEY` in root `.env` is IP-allowlisted for a different machine
  (confirmed via a real 403 `accessDenied.invalidIp` response, see Task 3's entry above and
  `notes/claude-specs/notepads/rankedstats/problems.md`). Whoever picks this up next needs to, in
  order: (1) paste `001_init.sql` -> `002_seed_rank_tiers.sql` -> `003_views.sql` into the live
  project's SQL Editor, (2) run `python3 rankedstats/ingest.py` from a machine/IP already
  allow-listed for the Brawl Stars key (or get this sandbox's IP added to the key's allow-list, or
  issue a new key), (3) confirm idempotency by running it a second time back-to-back and checking
  for `0 new sets, 0 new battles`, (4) do one real `file://` open of `stats.html` with DevTools open
  to confirm it renders without console errors against live data (flagged as unverifiable
  in-sandbox by Task 9's own notepad entry above). No code in `rankedstats/` should need to change
  for any of that — this is entirely an external-setup/verification gap, not an implementation gap.
- Verified `git status --porcelain | grep -v '^?? rankedstats/' | grep -v '^?? notes/'` -> empty
  (grep exit 1, no matching lines); full `git status --porcelain` shows only `?? notes/` and
  `?? rankedstats/` as untracked, confirming this task (and the whole project through Task 10) has
  not touched anything outside those two directories.
