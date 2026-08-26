-- rankedstats/migrations/008_player_icon.sql
--
-- Ranked Stats — adds `players.icon_id`, the id of the player's currently-equipped Brawl
-- Stars profile icon (fetched from the live API's player-profile endpoint, not the
-- battlelog). The browser turns this id into an image URL on a public icon CDN itself
-- (see stats.html's profileIconUrl) -- no image is stored here, only the id.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once (after 001-007).
--   Every statement is idempotent, so re-running this exact file a second time is safe.

alter table public.players add column if not exists icon_id integer;

-- === v_player_teammate_rows ===
-- === Re-created from 007_redesign_views.sql with one added column: teammate_icon_id, so
-- === the teammate table can render the teammate's profile icon exactly like the
-- === leaderboard does for roster players, straight off the same players.icon_id.
-- === teammate_icon_id is appended AFTER `result` (not next to the other teammate_* columns)
-- === because `create or replace view` only allows appending trailing columns -- inserting a
-- === column ahead of an existing one shifts every column after it and Postgres reads that as
-- === renaming them (42P16), even though nothing about them actually changed.
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
  end as result,
  p.icon_id as teammate_icon_id
from public.set_participants sp1
join public.set_participants sp2
  on sp2.set_id = sp1.set_id
  and sp2.team_index = sp1.team_index
  and sp2.player_tag <> sp1.player_tag
join public.ranked_sets rs on rs.id = sp1.set_id
left join public.players p on p.tag = sp2.player_tag
where rs.is_complete = true;

grant select on public.v_player_teammate_rows to anon, authenticated;
