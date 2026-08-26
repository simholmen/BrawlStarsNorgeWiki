-- rankedstats/migrations/010_ranked_season_id.sql
--
-- Ranked Stats — adds `ranked_season_id` to `ranked_sets`, exposes it on `v_player_set_rows`,
-- and backfills it for sets played in the season that started 2026-08-20.
--
-- WHY:
--   stats.html's "This season" period filter has always been a pure date heuristic
--   (periodCutoffDate()/currentSeasonStartDate() in stats.html, derived from
--   `player_rank_snapshots.ranked_season_id` — a LIVE per-player snapshot, never stored on the
--   set itself). Storing the season id directly on `ranked_sets` lets the frontend eventually
--   filter/sort by season as a real column instead of that heuristic.
--
-- WHAT SEASON ID TO BACKFILL WITH:
--   Every `player_rank_snapshots` row collected so far (ingest only started snapshotting
--   recently) has `ranked_season_id = 48` — no other season value has ever been observed. Since
--   the season that started 2026-08-20 is still the current one, 48 is that season's id.
--
-- GOING FORWARD:
--   ingest.py now stamps `ranked_season_id` on every newly-inserted `ranked_sets` row from the
--   same player-profile fetch that already feeds `player_rank_snapshots` (see
--   insert_new_ranked_set/ingest_set/ingest_player) — this backfill only needs to run once, for
--   sets written before that code shipped.
--
-- SAFETY / RE-RUNNABILITY:
--   `add column if not exists` / `create index if not exists` / `create or replace view` are all
--   safe to re-run. The backfill UPDATE's `and ranked_season_id is null` guard makes it a no-op
--   after the first successful run.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once (after 001-009).

-- =========================================================================================
-- === SCHEMA ===
-- =========================================================================================

alter table public.ranked_sets
  add column if not exists ranked_season_id int;

create index if not exists ranked_sets_ranked_season_id_idx
  on public.ranked_sets (ranked_season_id);

-- =========================================================================================
-- === PREVIEW (read-only) — run this first to see what will change ===
-- =========================================================================================

select id, event_id, mode, map, ended_at
from public.ranked_sets
where ended_at >= '2026-08-20T00:00:00Z'
  and ranked_season_id is null
order by ended_at;

-- =========================================================================================
-- === BACKFILL (writes) — run this after reviewing the preview above ===
-- =========================================================================================

update public.ranked_sets
set ranked_season_id = 48,
    updated_at = now()
where ended_at >= '2026-08-20T00:00:00Z'
  and ranked_season_id is null;

-- =========================================================================================
-- === v_player_set_rows — add ranked_season_id ===
-- === Same view as 007_redesign_views.sql, with rs.ranked_season_id added as a passthrough
-- === column so the browser can filter/sort by it without any other view change.
-- =========================================================================================

create or replace view public.v_player_set_rows
with (security_invoker = true)
as
select
  sp.player_tag,
  sp.set_id,
  rs.ended_at,
  rs.started_at,
  rs.mode,
  rs.map,
  sp.brawler_id,
  sp.brawler_name,
  sp.brawler_power,
  sp.rank_value,
  rt.label as rank_label,
  rt.tier_name,
  rt.tier_level,
  sp.team_index,
  rs.winning_team_index,
  rs.games_played,
  rs.team0_wins,
  rs.team1_wins,
  case
    when rs.winning_team_index = sp.team_index then 'win'
    when rs.winning_team_index is not null then 'loss'
    else 'draw'
  end as result,
  -- Appended at the end, not inserted alongside started_at/mode above: Postgres's
  -- `create or replace view` only allows adding columns at the END of the select list --
  -- inserting a new column earlier shifts every later column's position, which Postgres
  -- reads as renaming them (42P16), not adding one.
  rs.ranked_season_id
from public.set_participants sp
join public.ranked_sets rs on rs.id = sp.set_id
left join public.rank_tiers rt on rt.value = sp.rank_value
where rs.is_complete = true;

grant select on public.v_player_set_rows to anon, authenticated;
