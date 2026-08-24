-- rankedstats/migrations/003_views.sql
--
-- Ranked Stats — aggregate views for the browser (stats.html queries these directly via
-- PostgREST, never the base tables, so the SQL sent from the client stays trivial).
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once (after 001_init.sql and a
--   confirmed 002_seed_rank_tiers.sql). Every statement is `create or replace`, so re-running this
--   exact file a second time is safe and will not error.
--
-- SECURITY:
--   Every view below is created with the `security_invoker` view option set on. Without it, a
--   view executes with the privileges of its creator (a superuser in Supabase) and silently
--   bypasses row-level security on the underlying tables — Supabase's database linter flags that
--   as an ERROR-level finding (`0010_security_definer_view`). Setting the option makes the view
--   run as the querying role instead, so the `players_select` / `ranked_sets_select` / etc. RLS
--   policies from 001_init.sql still apply normally.
--
-- SEMANTICS (shared by every view below):
--   - Only sets where `ranked_sets.is_complete` is true are ever counted.
--   - A set is a WIN for a participant when `ranked_sets.winning_team_index = set_participants.team_index`.
--   - A set is a LOSS when `winning_team_index` is not null and differs from the participant's team_index.
--   - A set is a DRAW when `winning_team_index is null`. Draws count toward neither wins nor losses —
--     they are surfaced as their own `draws` column and are NEVER folded into `losses`.
--   - Nothing here is derived from `public.battles` — per 001_init.sql, that table is a raw record
--     only; every measure below comes from `ranked_sets` + `set_participants` (+ `players` /
--     `rank_tiers` for display columns where needed).

-- =========================================================================================
-- === v_player_overall ===
-- === Per-player totals across every completed set, regardless of mode/map/brawler.
-- =========================================================================================

create or replace view public.v_player_overall
with (security_invoker = true)
as
with agg as (
  select
    sp.player_tag,
    count(*)::int as sets_played,
    count(*) filter (where rs.winning_team_index = sp.team_index)::int as wins,
    count(*) filter (
      where rs.winning_team_index is not null
        and rs.winning_team_index <> sp.team_index
    )::int as losses,
    count(*) filter (where rs.winning_team_index is null)::int as draws
  from public.set_participants sp
  join public.ranked_sets rs on rs.id = sp.set_id
  where rs.is_complete = true
  group by sp.player_tag
)
select
  player_tag,
  sets_played,
  wins,
  losses,
  draws,
  -- Winrate is wins / (wins + losses) — decisive sets only. Draws are excluded from the
  -- denominator (they are neither a win nor a loss), so a draw-heavy player's rate reflects only
  -- sets that had an outcome. `nullif` guards against a divide-by-zero when a player has zero
  -- decisive sets (e.g. every set was a draw, or the player has no completed sets at all).
  round(wins::numeric / nullif(wins + losses, 0), 4) as winrate
from agg;

grant select on public.v_player_overall to anon, authenticated;

-- =========================================================================================
-- === v_player_map ===
-- === Per-player totals broken down by (mode, map).
-- =========================================================================================

create or replace view public.v_player_map
with (security_invoker = true)
as
with agg as (
  select
    sp.player_tag,
    rs.mode,
    rs.map,
    count(*)::int as sets_played,
    count(*) filter (where rs.winning_team_index = sp.team_index)::int as wins,
    count(*) filter (
      where rs.winning_team_index is not null
        and rs.winning_team_index <> sp.team_index
    )::int as losses,
    count(*) filter (where rs.winning_team_index is null)::int as draws
  from public.set_participants sp
  join public.ranked_sets rs on rs.id = sp.set_id
  where rs.is_complete = true
  group by sp.player_tag, rs.mode, rs.map
)
select
  player_tag,
  mode,
  map,
  sets_played,
  wins,
  losses,
  draws,
  round(wins::numeric / nullif(wins + losses, 0), 4) as winrate
from agg;

grant select on public.v_player_map to anon, authenticated;

-- =========================================================================================
-- === v_player_brawler ===
-- === Per-player totals broken down by brawler played that set.
-- =========================================================================================

create or replace view public.v_player_brawler
with (security_invoker = true)
as
with agg as (
  select
    sp.player_tag,
    sp.brawler_id,
    sp.brawler_name,
    count(*)::int as sets_played,
    count(*) filter (where rs.winning_team_index = sp.team_index)::int as wins,
    count(*) filter (
      where rs.winning_team_index is not null
        and rs.winning_team_index <> sp.team_index
    )::int as losses,
    count(*) filter (where rs.winning_team_index is null)::int as draws
  from public.set_participants sp
  join public.ranked_sets rs on rs.id = sp.set_id
  where rs.is_complete = true
  group by sp.player_tag, sp.brawler_id, sp.brawler_name
)
select
  player_tag,
  brawler_id,
  brawler_name,
  sets_played,
  wins,
  losses,
  draws,
  round(wins::numeric / nullif(wins + losses, 0), 4) as winrate
from agg;

grant select on public.v_player_brawler to anon, authenticated;

-- =========================================================================================
-- === v_player_teammate ===
-- === Per-(player, teammate) totals for every pair of participants who shared a team in the
-- === same completed set. Self-joins set_participants to itself on set_id with equal team_index,
-- === excluding a row pairing a player with themself. Covers ALL teammates seen in the data, not
-- === just roster members — `players.is_tracked` is only ever a displayed column here, never a
-- === filter, so non-roster teammates still show up.
-- =========================================================================================

create or replace view public.v_player_teammate
with (security_invoker = true)
as
with pairs as (
  select
    sp1.player_tag,
    sp2.player_tag as teammate_tag,
    sp1.team_index,
    rs.winning_team_index
  from public.set_participants sp1
  join public.set_participants sp2
    on sp2.set_id = sp1.set_id
    and sp2.team_index = sp1.team_index
    and sp2.player_tag <> sp1.player_tag
  join public.ranked_sets rs on rs.id = sp1.set_id
  where rs.is_complete = true
),
agg as (
  select
    player_tag,
    teammate_tag,
    count(*)::int as sets_together,
    count(*) filter (where winning_team_index = team_index)::int as wins
  from pairs
  group by player_tag, teammate_tag
)
select
  agg.player_tag,
  agg.teammate_tag,
  p.name as teammate_name,
  p.is_tracked as teammate_is_tracked,
  agg.sets_together,
  agg.wins,
  round(agg.wins::numeric / nullif(agg.sets_together, 0), 4) as winrate
from agg
left join public.players p on p.tag = agg.teammate_tag;

grant select on public.v_player_teammate to anon, authenticated;

-- =========================================================================================
-- === v_player_recent ===
-- === Per-player list of completed sets for the drill-down UI, newest first. `result` is a plain
-- === text column ('win' | 'loss' | 'draw') rather than a boolean so it renders directly without a
-- === client-side lookup. Deliberately NOT limited server-side — callers control how many rows
-- === they want via PostgREST's `.order(ended_at.desc).limit(N)`, so this stays a plain view with
-- === no `limit` clause of its own.
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
  rs.ended_at
from public.set_participants sp
join public.ranked_sets rs on rs.id = sp.set_id
where rs.is_complete = true
order by rs.ended_at desc;

grant select on public.v_player_recent to anon, authenticated;
