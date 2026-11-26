-- supabase/migrations/021_toplists.sql
--
-- Topplister (/topplister/ on the wiki): the top players in 3v3 wins, Showdown wins, fame and
-- highest ranked elo, refreshed once a day by rankedstats/toplists.py.
--
-- Which accounts are on the lists is decided by the page and the script together, from:
--   - every wiki person with a valid tag (people.bsid),
--   - every active main ranked profile (ranked_profiles, minis left out: same person twice),
--   - toplist_players below: extra accounts editors add on the page, with no wiki page and not
--     tracked on the ranked page.
--
-- toplist_players works like ranked_profiles (016): tag with '#', upper case, valid characters
-- only; active = false instead of deleting; who/when stamped by a trigger; everyone reads,
-- editors insert/update, nobody deletes through the API.
--
-- toplist_stats is the daily profile snapshot, one row per account, written only by the script
-- (service role). Everyone can read it: it's all public on the in-game profile anyway. Rows for
-- accounts that later leave the lists are kept; the page only shows current accounts.
--
-- SAFETY / RE-RUNNABILITY: if-not-exists / create-or-replace / drop-then-create.
-- HOW TO APPLY: npx supabase db push --remote

-- ---------------------------------------------------------------- toplist_players
create table if not exists public.toplist_players (
  tag              text primary key,
  name             text not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  created_by_name  text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null,
  updated_by_name  text,
  constraint toplist_players_tag_format check (tag ~ '^#[0289PYLQGRJCUV]{3,14}$'),
  constraint toplist_players_name_length check (char_length(btrim(name)) between 1 and 60)
);

create or replace function public.toplist_players_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  uname text := case when uid is null then null else public.current_editor_name() end;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := uid;
    new.created_by_name := uname;
  else
    new.tag := old.tag;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
  end if;
  new.name := btrim(new.name);
  new.updated_at := now();
  new.updated_by := uid;
  new.updated_by_name := uname;
  return new;
end;
$$;

revoke all on function public.toplist_players_stamp() from public, anon, authenticated;

drop trigger if exists toplist_players_stamp on public.toplist_players;
create trigger toplist_players_stamp
  before insert or update on public.toplist_players
  for each row execute function public.toplist_players_stamp();

alter table public.toplist_players enable row level security;

drop policy if exists "toplist_players_select" on public.toplist_players;
create policy "toplist_players_select"
  on public.toplist_players for select to anon, authenticated
  using (true);

drop policy if exists "toplist_players_insert_editors" on public.toplist_players;
create policy "toplist_players_insert_editors"
  on public.toplist_players for insert to authenticated
  with check ((select public.is_editor()));

drop policy if exists "toplist_players_update_editors" on public.toplist_players;
create policy "toplist_players_update_editors"
  on public.toplist_players for update to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

revoke all on public.toplist_players from anon, authenticated;
grant select on public.toplist_players to anon, authenticated;
grant insert, update on public.toplist_players to authenticated;
grant all on public.toplist_players to service_role;

-- ---------------------------------------------------------------- toplist_stats
create table if not exists public.toplist_stats (
  tag                       text primary key,
  profile_name              text,
  club_name                 text,
  icon_id                   int,
  trophies                  int,
  wins_3v3                  int,
  wins_solo                 int,
  wins_duo                  int,
  fame                      int,
  fame_tier_name            text,
  highest_ranked_elo        int,
  highest_ranked_rank       int,
  highest_ranked_rank_name  text,
  fetched_at                timestamptz not null default now(),
  constraint toplist_stats_tag_format check (tag ~ '^#[0289PYLQGRJCUV]{3,14}$')
);

alter table public.toplist_stats enable row level security;

drop policy if exists "toplist_stats_select" on public.toplist_stats;
create policy "toplist_stats_select"
  on public.toplist_stats for select to anon, authenticated
  using (true);

revoke all on public.toplist_stats from anon, authenticated;
grant select on public.toplist_stats to anon, authenticated;
grant all on public.toplist_stats to service_role;
