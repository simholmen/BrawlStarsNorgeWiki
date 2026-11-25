-- rankedstats/migrations/009_player_rank_snapshots.sql
--
-- Ranked Stats — adds `player_rank_snapshots`, a timestamped snapshot of each roster
-- player's LIVE Ranked season/rank/elo, taken from the player-profile endpoint (the same
-- call `players.icon_id` is fetched from -- see rankedstats/bs_api.py's
-- fetch_player_profile), once per ingest run. This is deliberately a separate append-only
-- table from `set_participants.rank_value` (007_redesign_views.sql's
-- v_player_rank_history): that column is the coarse 1-22 tier derived from a completed
-- SET's battlelog data, while `ranked_elo` here is a continuous number sampled
-- periodically regardless of whether the player finished a set since the last poll.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once (after 001-008).
--   Every statement is idempotent, so re-running this exact file a second time is safe.

create table if not exists public.player_rank_snapshots (
  player_tag        text not null references public.players(tag),
  fetched_at        timestamptz not null default now(),
  ranked_season_id  int,
  -- Same 1..22 scale as rank_tiers.value (confirmed: API rankedRank 17 = "LEGENDARY II" ==
  -- rank_tiers.value 17's label "Legendary II"), but NOT FK'd to rank_tiers -- this is a
  -- newer, less-vetted API surface than set_participants.rank_value, and a bad/out-of-range
  -- value here should degrade to a null label via the view's left join below, not fail the
  -- whole snapshot insert.
  ranked_rank       int,
  -- Raw API string (e.g. "LEGENDARY II"), stored for reference only -- never rendered
  -- directly, since its casing doesn't match rank_tiers.label ("Legendary II"). Render
  -- v_player_rank_snapshots.rank_label instead.
  ranked_rank_name  text,
  ranked_elo        int,
  primary key (player_tag, fetched_at)
);

alter table public.player_rank_snapshots enable row level security;

drop policy if exists "player_rank_snapshots_select" on public.player_rank_snapshots;
create policy "player_rank_snapshots_select"
  on public.player_rank_snapshots
  for select
  to anon, authenticated
  using (true);

grant select on public.player_rank_snapshots to anon, authenticated;
grant all on public.player_rank_snapshots to service_role;

create index if not exists player_rank_snapshots_player_tag_idx
  on public.player_rank_snapshots (player_tag, fetched_at desc);

-- =========================================================================================
-- === v_player_rank_snapshots ===
-- === One row per stored snapshot, newest and oldest alike, for the browser to plot as a
-- === time series (mirrors v_player_rank_history's shape/intent). Left-joins ranked_rank to
-- === rank_tiers so the frontend gets the SAME rank_label/tier_name/tier_level it already
-- === knows how to render (tierIconUrl/tierRoman in stats.html), instead of trusting the
-- === API's differently-cased ranked_rank_name string.
-- =========================================================================================

create or replace view public.v_player_rank_snapshots
with (security_invoker = true)
as
select
  prs.player_tag,
  prs.fetched_at,
  prs.ranked_season_id,
  prs.ranked_rank,
  prs.ranked_elo,
  rt.label as rank_label,
  rt.tier_name,
  rt.tier_level
from public.player_rank_snapshots prs
left join public.rank_tiers rt on rt.value = prs.ranked_rank;

grant select on public.v_player_rank_snapshots to anon, authenticated;
