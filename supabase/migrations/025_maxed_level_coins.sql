-- supabase/migrations/025_maxed_level_coins.sql
--
-- "Maxet konto" now weighs everything by what it costs in coins (1 power point = 2 coins) instead
-- of 1 point each. Levels can't be priced from owned_levels (a sum: level 11 costs far more than
-- level 2), so the ingest also stores what the account's levels cost: sum over its brawlers of
-- the coins + 2 x power points to take each from level 1 to its level (rankedstats/toplists.py
-- LEVEL_UPGRADES). The other prices live in web/lib/toplistsBuild.ts.
--
-- SAFETY / RE-RUNNABILITY: add column if not exists.
-- HOW TO APPLY: npx supabase db push --remote (BEFORE the ingest code that writes it is pulled).

alter table public.toplist_stats add column if not exists owned_level_coins int;
