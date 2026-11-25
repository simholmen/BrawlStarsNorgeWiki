-- rankedstats/migrations/005_backfill_single_game_winner.sql
--
-- Ranked Stats — ONE-OFF DATA BACKFILL (not a schema change).
--
-- BUG BEING FIXED:
--   Below Mythic I (rank_value < 13), Ranked is a single-game format, not best-of-3 — a set
--   is complete after 1 game (see `sets.summarize_set` / `ingest.recompute_and_patch_set`).
--   Both of those functions previously set `winning_team_index` only when a side reached 2
--   wins, which a single-game set can never do. Every sub-Mythic single-game set therefore
--   got `winning_team_index = NULL`, which every `v_player_*` view (003_views.sql) treats as
--   a DRAW regardless of the game's real outcome. The code bug is already fixed (sets.py /
--   ingest.py) — this migration corrects the rows that were written before that fix.
--
-- WHY A BACKFILL, NOT JUST RE-RUNNING ingest.py:
--   The Brawl Stars API only returns each player's most recent 25 battlelog entries, so an
--   affected set that has already rolled off that window can never be re-derived from the
--   live API again. The fix has to read what's already stored in `battles` instead.
--
-- WHAT THIS DOES:
--   For every `ranked_sets` row where:
--     - `games_played = 1` (single-game set)
--     - `winning_team_index is null` (looks like a draw)
--     - `is_complete = true`
--     - every one of its `set_participants` has `rank_value < 13` (sub-Mythic — confirms
--       this really was a single-game-format set, not a bo3 set that happened to go stale
--       after only 1 game, which is a legitimate "no winner" case and must NOT be touched)
--   ...pull that set's one stored `battles` row and copy its `winning_team_index` onto the
--   `ranked_sets` row. A set whose single stored battle was itself a genuine draw
--   (`battles.winning_team_index is null`) is left untouched — there's nothing to correct.
--
--   `team0_wins`/`team1_wins` are NOT touched here: those were already computed correctly
--   from the stored battle at ingest time (that part of the old code was never buggy — only
--   the final `winning_team_index` assignment was). Only `winning_team_index` (and
--   `updated_at`, for auditability) are updated.
--
-- SAFETY / RE-RUNNABILITY:
--   Idempotent: after the first run, no row will match `winning_team_index is null` anymore
--   (for the ones that had a real winner), so re-running this file a second time is a no-op.
--   Run the SELECT preview first to see exactly which sets will change before running the
--   UPDATE.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once.

-- =========================================================================================
-- === PREVIEW (read-only) — run this first to see what will change ===
-- =========================================================================================

select
  rs.id,
  rs.event_id,
  rs.mode,
  rs.map,
  rs.ended_at,
  rs.team0_wins,
  rs.team1_wins,
  b.winning_team_index as corrected_winning_team_index
from public.ranked_sets rs
join public.battles b on b.set_id = rs.id
where rs.games_played = 1
  and rs.winning_team_index is null
  and rs.is_complete = true
  and b.winning_team_index is not null
  and not exists (
    select 1
    from public.set_participants sp
    where sp.set_id = rs.id
      and (sp.rank_value is null or sp.rank_value >= 13)
  )
order by rs.ended_at;

-- =========================================================================================
-- === BACKFILL (writes) — run this after reviewing the preview above ===
-- =========================================================================================

with candidate_sets as (
  select rs.id as set_id
  from public.ranked_sets rs
  where rs.games_played = 1
    and rs.winning_team_index is null
    and rs.is_complete = true
    and not exists (
      select 1
      from public.set_participants sp
      where sp.set_id = rs.id
        and (sp.rank_value is null or sp.rank_value >= 13)
    )
),
single_battle as (
  select b.set_id, b.winning_team_index
  from public.battles b
  join candidate_sets cs on cs.set_id = b.set_id
  where b.winning_team_index is not null
)
update public.ranked_sets rs
set
  winning_team_index = sb.winning_team_index,
  updated_at = now()
from single_battle sb
where rs.id = sb.set_id;
