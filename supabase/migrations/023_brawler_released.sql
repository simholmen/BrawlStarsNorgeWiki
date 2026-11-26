-- supabase/migrations/023_brawler_released.sql
--
-- "Maxet konto": only brawlers that can actually be unlocked count. /v1/brawlers already lists
-- brawlers that are announced but not obtainable yet (e.g. 111 listed while the best accounts
-- own 109), so like buffies (022), a brawler counts as released once any account on the
-- toplists owns it, and stays so; rankedstats/toplists.py BRAWLER_OVERRIDES can correct it.
--
-- SAFETY / RE-RUNNABILITY: add column if not exists only.
-- HOW TO APPLY: npx supabase db push --remote

alter table public.brawler_catalogue add column if not exists released boolean not null default false;
