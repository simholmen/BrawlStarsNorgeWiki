-- rankedstats/migrations/004_current_rank.sql
--
-- Ranked Stats — adds v_player_current_rank, used by stats.html to show a player's rank tier
-- (from their most recent completed set) next to their winrate in the Overall section.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once (after 001-003). The
--   statement is `create or replace`, so re-running this exact file a second time is safe.

-- =========================================================================================
-- === v_player_current_rank ===
-- === One row per player: the rank_value/label from their most recent completed set, i.e. the
-- === last ranked entry recorded for them (same `is_complete = true` filter and `ended_at`
-- === ordering as v_player_recent). `distinct on` keeps just the newest row per player_tag.
-- =========================================================================================

create or replace view public.v_player_current_rank
with (security_invoker = true)
as
select distinct on (sp.player_tag)
  sp.player_tag,
  sp.rank_value,
  rt.label as rank_label,
  rs.ended_at
from public.set_participants sp
join public.ranked_sets rs on rs.id = sp.set_id
left join public.rank_tiers rt on rt.value = sp.rank_value
where rs.is_complete = true
order by sp.player_tag, rs.ended_at desc nulls last;

grant select on public.v_player_current_rank to anon, authenticated;
