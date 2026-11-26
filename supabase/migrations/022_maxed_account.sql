-- supabase/migrations/022_maxed_account.sql
--
-- "Maxet konto" on /topplister/: how close an account is to fully maxed. Scoring (option A):
-- every brawler can give 11 (power level) + 2 star powers + 2 gadgets + up to 6 gears + its
-- hypercharge (if it has one) + its buffies (0-3, only those that exist for it). Brawlers the
-- account doesn't own give 0. % = points owned / points possible over every brawler in the game.
--
-- What an account OWNS is stored on toplist_stats (rankedstats/toplists.py account_progress,
-- written by the daily run and by the 30-min ranked ingest). What's POSSIBLE comes from
-- brawler_catalogue, refreshed by the daily run from the API's /v1/brawlers plus buffie
-- detection: the API doesn't say which brawlers have buffies, so a buffie counts as existing once
-- any account on the lists owns it (never switched off again), with a manual override list in
-- rankedstats/toplists.py. The page combines the two (web/lib/toplistsBuild.ts), so the weights
-- can change without refetching anything.
--
-- SAFETY / RE-RUNNABILITY: add column if not exists / create table if not exists / drop-then-create.
-- HOW TO APPLY: npx supabase db push --remote

alter table public.toplist_stats add column if not exists brawlers_owned int;
alter table public.toplist_stats add column if not exists owned_levels int;        -- sum of power levels
alter table public.toplist_stats add column if not exists owned_star_powers int;
alter table public.toplist_stats add column if not exists owned_gadgets int;
alter table public.toplist_stats add column if not exists owned_gears int;         -- max 6 per brawler
alter table public.toplist_stats add column if not exists owned_hypercharges int;
alter table public.toplist_stats add column if not exists owned_buffies int;

create table if not exists public.brawler_catalogue (
  brawler_id          int primary key,
  name                text not null,
  star_powers         int not null default 0,
  gadgets             int not null default 0,
  gears               int not null default 0,   -- counted up to 6
  hypercharges        int not null default 0,
  buffie_gadget       boolean not null default false,
  buffie_star_power   boolean not null default false,
  buffie_hypercharge  boolean not null default false,
  updated_at          timestamptz not null default now()
);

alter table public.brawler_catalogue enable row level security;

drop policy if exists "brawler_catalogue_select" on public.brawler_catalogue;
create policy "brawler_catalogue_select"
  on public.brawler_catalogue for select to anon, authenticated
  using (true);

revoke all on public.brawler_catalogue from anon, authenticated;
grant select on public.brawler_catalogue to anon, authenticated;
grant all on public.brawler_catalogue to service_role;
