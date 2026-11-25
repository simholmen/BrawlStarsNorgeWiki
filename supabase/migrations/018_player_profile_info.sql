-- supabase/migrations/018_player_profile_info.sql
--
-- In-game info for wiki infoboxes ("Ingame-info"): ingest already fetches every tracked
-- player's live profile each run (rankedstats/bs_api.py fetch_player_profile, for icon_id and
-- rank snapshots); it now also stores these fields on `players`. Refreshed every ingest run
-- (every 30 min), so the wiki shows them without anyone editing anything.
--
--   profile_name            in-game name exactly as on the profile (players.name is the latest
--                           battlelog name, which can be missing or older)
--   club_tag / club_name    current club, both null when not in a club
--   highest_ranked_rank     highestAllTimeRankedRank, same 1..22 scale as rank_tiers.value
--   highest_ranked_elo      highestAllTimeRankedElo
--   wins_3v3                "3vs3Victories"
--   profile_updated_at      when these were last fetched
--
-- Readable by everyone like the rest of `players` (all of it is public on the player's
-- in-game profile anyway); only the service role (ingest) writes.
--
-- SAFETY / RE-RUNNABILITY: add column if not exists only.
-- HOW TO APPLY: npx supabase db push --remote

alter table public.players add column if not exists profile_name text;
alter table public.players add column if not exists club_tag text;
alter table public.players add column if not exists club_name text;
alter table public.players add column if not exists highest_ranked_rank int;
alter table public.players add column if not exists highest_ranked_elo int;
alter table public.players add column if not exists wins_3v3 int;
alter table public.players add column if not exists profile_updated_at timestamptz;
