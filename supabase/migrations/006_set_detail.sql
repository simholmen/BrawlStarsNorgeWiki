-- rankedstats/migrations/006_set_detail.sql
--
-- Ranked Stats — adds set_id to v_player_recent and a new v_set_detail view, together
-- powering the "last 10 matches" list + click-through detail view in stats.html.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once (after 001-005). Both
--   statements are `create or replace`, so re-running this exact file a second time is safe.
--
-- WHY set_id ON v_player_recent:
--   v_player_recent (003_views.sql) already lists a player's completed sets newest-first, but
--   has no way to identify WHICH set a row is, so the browser can't ask for that set's full
--   detail on click. Appending `set_id` as a new trailing column is backward compatible: a
--   `create or replace view` may only APPEND new output columns, never reorder or remove
--   existing ones, and stats.html only ever does `select("*")` against this view anyway.
--
-- WHY v_set_detail IS ITS OWN VIEW, NOT A stats.html QUERY AGAINST BASE TABLES:
--   stats.html's own header comment documents that it only ever queries `v_player_*` views,
--   never `ranked_sets`/`set_participants`/`battles` directly (see 003_views.sql's SEMANTICS
--   note). Full match detail needs all 6 participants' brawler/rank info plus every game's
--   result for one set -- rather than break that pattern with three raw-table queries from the
--   browser, this view does the join/aggregation server-side and hands back one row per set_id
--   with `participants` and `games` as JSON arrays.

-- =========================================================================================
-- === v_player_recent: append set_id ===
-- =========================================================================================

create or replace view public.v_player_recent
with (security_invoker = true)
as
select
  sp.player_tag,
  rs.map,
  rs.mode,
  sp.brawler_name,
  case
    when rs.winning_team_index = sp.team_index then 'win'
    when rs.winning_team_index is not null then 'loss'
    else 'draw'
  end as result,
  rs.ended_at,
  rs.id as set_id
from public.set_participants sp
join public.ranked_sets rs on rs.id = sp.set_id
where rs.is_complete = true
order by rs.ended_at desc;

grant select on public.v_player_recent to anon, authenticated;

-- =========================================================================================
-- === v_set_detail ===
-- === One row per set: the set's own summary fields plus `participants` (all 6 players'
-- === brawler/rank info, one JSON object per player) and `games` (one JSON object per game
-- === in the set, in game_number order). Not filtered by `is_complete` -- an in-progress set
-- === can still be clicked into and should show whatever games have landed so far.
-- =========================================================================================

create or replace view public.v_set_detail
with (security_invoker = true)
as
select
  rs.id as set_id,
  rs.event_id,
  rs.mode,
  rs.map,
  rs.started_at,
  rs.ended_at,
  rs.games_played,
  rs.team0_wins,
  rs.team1_wins,
  rs.winning_team_index,
  rs.is_complete,
  (
    select jsonb_agg(
      jsonb_build_object(
        'player_tag', sp.player_tag,
        'player_name', p.name,
        'team_index', sp.team_index,
        'brawler_id', sp.brawler_id,
        'brawler_name', sp.brawler_name,
        'brawler_power', sp.brawler_power,
        'rank_value', sp.rank_value,
        'rank_label', rt.label
      )
      order by sp.team_index, sp.player_tag
    )
    from public.set_participants sp
    left join public.players p on p.tag = sp.player_tag
    left join public.rank_tiers rt on rt.value = sp.rank_value
    where sp.set_id = rs.id
  ) as participants,
  (
    select jsonb_agg(
      jsonb_build_object(
        'game_number', b.game_number,
        'battle_time', b.battle_time,
        'duration', b.duration,
        'winning_team_index', b.winning_team_index,
        'star_player_tag', b.star_player_tag
      )
      order by b.game_number
    )
    from public.battles b
    where b.set_id = rs.id
  ) as games
from public.ranked_sets rs;

grant select on public.v_set_detail to anon, authenticated;
