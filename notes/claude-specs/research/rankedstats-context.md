# Research Context: Ranked Stats (Supabase + static page)

> **Plan**: ./notes/claude-specs/plans/rankedstats.md

All figures below come from analysis of the 27 real battlelog files in
`winratefetching/docs/fetchresult/` (669 total battle entries) plus external docs research.

## Codebase Findings

### Roster
- `docs/_personer/*.md` — 25 files. Front matter key `bsid` holds the player tag **without** a
  leading `#` (e.g. `YQ29980`, `RU8UUYJ`). `name` is the display name.
- `winratefetching/extract_names_and_tags.py` parses front matter by hand: checks
  `lines[0].strip() == '---'`, scans to the closing `---`, `yaml.safe_load`s the block.
  Exposes `get_player_map` -> `{tag: name_slug}`, `get_player_names`, `get_name_to_tag_map`.
  `name_slug = name.lower().replace(' ', '_')`.

### Existing pipeline conventions
- `battlelogfetch.py`: `load_dotenv(dotenv_path='/Users/simenholmen/.../.env')` (hardcoded absolute),
  `os.environ.get("BRAWLSTARS_API_KEY")`, then
  `requests.get(f"https://api.brawlstars.com/v1/players/%23{tag}/battlelog",
  headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json"})`.
  Writes `battlelog_{name}.json`. Error handling is a bare `status_code == 200` check, no retry.
- `tournamentfetching/fetch_tournament_stats_once.py` has the best error handling in the repo:
  retries on `{429, 502, 503, 504, 520}` with `time.sleep(2 ** (attempt-1))`, 4 attempts.
  It also parses `.env` manually (no dotenv dependency).
- **No `requirements.txt` anywhere in the repo.**
- Two root venvs: `venv/` (Python 3.13.5, has `python-dotenv` 1.1.1, `requests` 2.32.4, PyYAML) —
  this is the one `update_all.sh` activates; and `.venv/` (Python 3.14.2, **no** dotenv,
  has `requests` 2.32.5, PyYAML).
- Every script except one hardcodes absolute `/Users/simenholmen/...` paths — not portable.
- `.env` at repo root holds `BRAWLSTARS_API_KEY`, `CHALLONGE_API_KEY`. Confirmed gitignored
  (`.gitignore:33`) and untracked.
- **No launchd plist or crontab** referencing this repo was found anywhere on the machine.
  How `update_all.sh` currently runs is unresolved — moot, new poller is manual.
- `.github/workflows/autopush_winloss.yml` is the only workflow: cron `5,35 * * * *`, but it only
  git-auto-commits `docs/diverse/slindringene/winloss_*.md`. Runs no Python.
- `docs/` has no `assets/js`; only `docs/script.js` (table sort, no `fetch()`, no CDN).
  No precedent for a standalone or client-side-fetching HTML page.
- GitHub Pages serves from `docs/`, so a file in a new root folder is **not** published.

## External Research

### Ranked tier ladder (resolves `brawler.trophies` for soloRanked)
Source: https://brawlstars.fandom.com/wiki/Ranked (Elo Distribution table order).
Current ladder is 22 ranks; sequential 1..22 matches both user-supplied data points exactly
(Mythic III = 15, Legendary I = 16), and observed data maxes out at exactly 22.

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

Confidence: moderate-to-high (inference; two independent data points land exactly, ladder length
matches observed max). **Version-dependent**: before the 2025-02-25 rework Masters was unsplit and
Pro did not exist — a 19-rank ladder. Explains the stale Feb/Mar 2025 `wafles` values.

### Ranked format
- Best-of-3 (first to 2 round wins) applies **only from Mythic I upward**. Bronze->Gold III is a
  single game; Diamond adds bans but is still one game. Source: Fandom Ranked "Gameplay".
- Draft/ban happens once per match; map and mode are chosen once and fixed for the whole set.
- Below Mythic, every battlelog entry is a complete standalone match.

### Supabase
- Official no-build CDN snippet (https://supabase.com/docs/reference/javascript/installing):
  `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`, UMD, exposes
  `window.supabase.createClient`. Gotcha: `const supabase = ...` shadows the library global.
- API keys: legacy `anon`/`service_role` JWTs deprecated end of 2026. Current:
  `sb_publishable_...` (browser, RLS-governed, safe to commit) and `sb_secret_...`
  (server-side, BYPASSRLS). https://supabase.com/docs/guides/api/api-keys
- **Grants are a separate check from RLS.** Supabase historically auto-granted CRUD on new `public`
  tables to `anon`/`authenticated` but is moving to opt-in exposure. Migrations should include
  explicit `grant select ... to anon`. https://supabase.com/docs/guides/api/securing-your-api
- **Views bypass RLS by default.** Must use `create view ... with (security_invoker = true)`,
  else linter `0010_security_definer_view` fires at ERROR level.
  https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
- Views in `public` are auto-exposed via PostgREST; `.from('view_name').select()` works as a table.
- `supabase-py` v2.31.0 supports `.upsert(rows, on_conflict="k", ignore_duplicates=True)`
  (verified in `postgrest-py/base_request_builder.py`), sending
  `Prefer: return=representation,resolution=ignore-duplicates` + `?on_conflict=k`.
  Pulls in 5 sub-packages and has a history of `httpx` pin mismatches (supabase-py#949).
  Raw `requests` equivalent is a single POST — chosen instead.
- Hand-rolled numbered `migrations/NNN_*.sql` + SQL Editor paste is a legitimate workflow.
  `supabase db push` needs CLI login + link (not Docker); Docker is only for `supabase start`.

### Brawl Stars API
- `/v1/players/{tag}/battlelog` returns `{"items": [...]}`, `paging.cursors` always empty `{}`.
  ~25 most recent battles, no pagination, **no unique battle ID**.
- API keys appear to be IP-bound at creation (Supercell portal family behavior). Docs are behind a
  Supercell ID login and could not be scraped — **unverified**, relevant only to the future VM move.

## Empirical Findings from Real Battlelogs

### Battle type semantics (the key discovery)
Across 669 entries: `ranked` 423, `soloRanked` 209, `tournament` 17, `friendly` 14, absent 6.

| | `type: "ranked"` | `type: "soloRanked"` |
|---|---|---|
| `trophyChange` | present | **never present** |
| `brawler.power` | 1–11 | only 9–11 |
| `brawler.trophies` | 0–2881, 1334 distinct | 1–22 (2026 data) |
| Team shape | 2x3, 2x5, 5x2, or flat `players` | always 2x3 |

Conclusion: `type: "ranked"` is the **trophy ladder**, not the Ranked ladder. `soloRanked` is the
real Ranked mode. Non-3v3 shapes under `ranked`: 44 soloShowdown (flat `battle.players`),
38 duoShowdown (5 teams of 2), 20 five-v-five (`brawlBall5V5`, `knockout5V5`, `wipeout`).

### soloRanked 2026 subset (the ingestion target) — 186 entries
- Present in 13 files; 14 roster files have zero. All 186 are exactly 2 teams of 3, no exceptions.
- Grouping by consecutive same `event.id` + same 6-tag set gives **126 groups**:
  78 of size 1, 36 of size 2, 12 of size 3. **Zero groups larger than 3.**
- Team partition identical across all games in all 48 multi-game groups (**0 reshuffles**).
- Same `(event.id, 6-tag set)` never recurs later in a file after intervening groups (0 cases).
- Within-group gaps 55–229s. Minimum gap between *different* adjacent groups: **95s**.
  These ranges overlap, so a time threshold alone cannot separate sets — the tag-set check is
  load-bearing.
- `event.mode` == `battle.mode` for all 186 (the siege/5v5 divergence is trophy-ladder only).
- 27 distinct `(event.id, mode, map)` triples.
- Set outcomes: 2-0 x19, 2-1 x7, 0-2 x16, 1-2 x4, 1-1 x2, plus 78 single-game sets.
  **Zero truncated mid-set groups** in this static sample.
- Draw edge case: `battlelog_zimma.json` group at `20260807T194759.000Z` is
  defeat / victory / **draw**, so a 3-game set can resolve without either team reaching 2 wins.

### battleTime is the END of the battle (proven)
Across all 60 within-set consecutive pairs:
- `gap - duration[n+1]` -> **+18 to +21s** in every single case, 0 negatives (constant
  matchmaking/loading overhead).
- `gap - duration[n]` -> -81 to +149s, 18 of 60 negative.

So: `set.started_at = first_game.battle_time - first_game.duration`,
`set.ended_at = last_game.battle_time`.

### Brawler is constant within a set
Across all **288** (player, set) pairs in multi-game groups: **0 brawler changes**. Matches the
once-per-match draft rule. Map is likewise fixed per set. This invalidates the original rationale
for game-level brawler/map stats.

### rank_value behavior
- Constant within a set (0 of 288 pairs changed), drifts across sets with wins/losses
  (e.g. `#RU8UUYJ` went 10 -> 12 across one session, dipping after losses).
- Observed range 4–22, so many roster players sit below Mythic I (=13) and therefore play
  single-game sets.
- Per-game spread across the 6 participants: 0 tiers x89 games, 1 x80, 2 x12, 3 x4, 4 x1.

### Dedupe
- `battleTime` + sorted participant tags is already unique across the entire 669-entry corpus
  (644 distinct keys; the 25 collisions are genuine cross-player duplicates, all between
  `battlelog_aambakk.json` and `battlelog_cursed.json`). `duration` adds nothing to the key.
- Prior art (`saschaSpoonbill/brawlstars-battlelog-collector`) keys on
  `(player_tag, battle_time, brawler_id)` with `INSERT IGNORE`.
- No public project implements set-grouping or handles the 25-battle limit — that logic is novel.

### "Who you play with" signal is sparse
510 distinct participant tags across the soloRanked 2026 window; only 13 are roster members.
Exactly **one** roster pair ever co-occurred (aambakk + cursed, 15 games, one session on
2026-07-20, across 8 different maps). Teammate stats must therefore span *all* teammates, with
roster membership merely flagged.

## Decisions Made

1. **Ranked filter**: `soloRanked` only. Trophy-ladder `ranked` ignored entirely.
2. **Stat granularity**: all stats at set level. Brawler and rank_value move onto
   `set_participants`. A lightweight `battles` table is retained purely as a raw record, with no
   per-game participant/brawler table.
3. **Scheduling**: manual for now. No launchd plist, no crontab.
4. **Stats page**: `rankedstats/stats.html`, local-only via `file://`. Not published.
5. Folder name `rankedstats/`; plain `requests` over PostgREST; no new dependencies.
6. Poll cadence when it is eventually automated: ~20 minutes.

## Open Questions

- **rank_tiers seed data** — pending explicit user confirmation. Research derived a
  high-confidence 22-row mapping (table above) that matches both of the user's data points and the
  observed value ceiling, but the user has not confirmed it. Migration `002` ships the derived rows
  commented out behind a confirmation checkpoint.
- **Brawl Stars API key IP-binding** — unverified (docs behind login). Only matters for the future
  laptop -> VM move, which is out of scope here.
