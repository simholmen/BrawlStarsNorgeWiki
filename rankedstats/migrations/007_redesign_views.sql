-- rankedstats/migrations/007_redesign_views.sql
--
-- Ranked Stats — adds 3 new row-level views that power the redesigned stats.html: instead of
-- shipping the browser pre-aggregated totals (v_player_overall / v_player_map / v_player_brawler /
-- v_player_teammate from 003_views.sql), these views hand back one row per underlying record so
-- the client can filter by mode/period/brawler and re-aggregate in JS without a round trip per
-- filter combination.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once (after 001-006). Every
--   statement is `create or replace` / its own `grant`, so re-running this exact file a second
--   time is safe and will not error.
--
-- SECURITY:
--   Every view below sets the same view option as 003_views.sql: without it, a view runs with
--   the creator's (superuser) privileges and bypasses RLS, which Supabase's linter flags as an
--   ERROR-level finding. Setting the option makes each view run as the querying role instead, so
--   the existing `_select` RLS policies from 001_init.sql still apply.
--
-- SEMANTICS (shared by every view below):
--   - v_player_set_rows and v_player_teammate_rows only ever include sets where
--     `ranked_sets.is_complete` is true, matching v_player_recent's convention.
--   - v_player_rank_history keeps every completed-set row per player instead of collapsing to the
--     newest one (that collapsed shape already exists as v_player_current_rank, 004_current_rank.sql),
--     so the browser can plot a rank-over-time series rather than a single current value.
--   - None of these views reference `public.battles` — per 001_init.sql, that table is a raw
--     record only; every measure below comes from `ranked_sets` + `set_participants` (+ `players` /
--     `rank_tiers` for display columns).
--   - No view here applies its own `limit`, `player_tag` filter, or `order by` — PostgREST callers
--     apply those themselves via query params.

-- =========================================================================================
-- === v_player_set_rows ===
-- === One row per (player, completed set): every column stats.html needs to filter and
-- === re-aggregate client-side by mode/map/brawler/time period, without the server pre-collapsing
-- === anything. `result` reuses v_player_recent's exact CASE expression (006_set_detail.sql).
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
  end as result
from public.set_participants sp
join public.ranked_sets rs on rs.id = sp.set_id
left join public.rank_tiers rt on rt.value = sp.rank_value
where rs.is_complete = true;

grant select on public.v_player_set_rows to anon, authenticated;

-- =========================================================================================
-- === v_player_teammate_rows ===
-- === One row per (player, set, teammate): the unaggregated version of v_player_teammate
-- === (003_views.sql). Reuses that view's self-join on set_id + team_index, excluding a row
-- === pairing a player with themself, but deliberately has NO `group by` -- every teammate
-- === pairing seen in a completed set gets its own row so the browser can filter/re-aggregate by
-- === mode/map/brawler before summing sets-together and wins per teammate.
-- =========================================================================================

create or replace view public.v_player_teammate_rows
with (security_invoker = true)
as
select
  sp1.player_tag,
  sp1.set_id,
  rs.ended_at,
  rs.mode,
  rs.map,
  sp1.brawler_id,
  sp2.player_tag as teammate_tag,
  p.name as teammate_name,
  p.is_tracked as teammate_is_tracked,
  case
    when rs.winning_team_index = sp1.team_index then 'win'
    when rs.winning_team_index is not null then 'loss'
    else 'draw'
  end as result
from public.set_participants sp1
join public.set_participants sp2
  on sp2.set_id = sp1.set_id
  and sp2.team_index = sp1.team_index
  and sp2.player_tag <> sp1.player_tag
join public.ranked_sets rs on rs.id = sp1.set_id
left join public.players p on p.tag = sp2.player_tag
where rs.is_complete = true;

grant select on public.v_player_teammate_rows to anon, authenticated;

-- =========================================================================================
-- === v_player_rank_history ===
-- === One row per (player, completed set): rank_value/label for every set a player has played,
-- === newest and oldest alike. Unlike v_player_current_rank (004_current_rank.sql), which uses
-- === `distinct on` to collapse down to just the newest row per player, this view keeps every row
-- === so the browser can plot the player's rank as a time series across their whole history.
-- =========================================================================================

create or replace view public.v_player_rank_history
with (security_invoker = true)
as
select
  sp.player_tag,
  rs.ended_at,
  sp.rank_value,
  rt.label as rank_label,
  rt.tier_name,
  rt.tier_level
from public.set_participants sp
join public.ranked_sets rs on rs.id = sp.set_id
left join public.rank_tiers rt on rt.value = sp.rank_value
where rs.is_complete = true;

grant select on public.v_player_rank_history to anon, authenticated;
