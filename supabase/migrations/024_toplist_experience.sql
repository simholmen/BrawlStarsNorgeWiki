-- supabase/migrations/024_toplist_experience.sql
--
-- "XP-nivå" on /topplister/: the profile's experience level and points (expLevel / expPoints in
-- the API). An old system the game hardly shows any more, but the points still grow as you play.
-- Written by rankedstats/toplists.py (daily) and the 30-min ranked ingest, like the other columns.
--
-- SAFETY / RE-RUNNABILITY: add column if not exists only.
-- HOW TO APPLY: npx supabase db push --remote

alter table public.toplist_stats add column if not exists exp_level int;
alter table public.toplist_stats add column if not exists exp_points int;
