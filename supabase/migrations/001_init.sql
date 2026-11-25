-- rankedstats/migrations/001_init.sql
--
-- Ranked Stats — initial schema, indexes, RLS, and grants.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once. Every statement below is
--   idempotent (create-if-not-exists / drop-then-create for policies), so re-running this exact
--   file a second time is safe and will not error.
--
-- FUTURE SCHEMA CHANGES:
--   Never edit this file after it has been applied to a live project. Add a new numbered file
--   instead (002_seed_rank_tiers.sql, 003_views.sql, 004_..., etc.) and apply that instead.

-- =========================================================================================
-- === players ===
-- =========================================================================================

create table if not exists public.players (
  tag         text primary key,          -- '#2GY22JUR', WITH leading '#'
  name        text,                      -- latest seen display name
  is_tracked  boolean not null default false,
  first_seen  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.players enable row level security;

drop policy if exists "players_select" on public.players;
create policy "players_select"
  on public.players
  for select
  to anon, authenticated
  using (true);

grant select on public.players to anon, authenticated;
grant all on public.players to service_role;

-- =========================================================================================
-- === rank_tiers ===
-- =========================================================================================

create table if not exists public.rank_tiers (
  value       int primary key,           -- 1..22
  tier_name   text not null,             -- 'Legendary'
  tier_level  int,                       -- 1..3, null for Pro
  label       text not null              -- 'Legendary I'
);

alter table public.rank_tiers enable row level security;

drop policy if exists "rank_tiers_select" on public.rank_tiers;
create policy "rank_tiers_select"
  on public.rank_tiers
  for select
  to anon, authenticated
  using (true);

grant select on public.rank_tiers to anon, authenticated;
grant all on public.rank_tiers to service_role;

-- =========================================================================================
-- === ranked_sets ===
-- =========================================================================================

create table if not exists public.ranked_sets (
  id                 uuid primary key default gen_random_uuid(),
  set_key            text not null unique,
  event_id           int not null,
  mode               text not null,
  map                text not null,
  started_at         timestamptz,        -- first game battle_time - duration
  ended_at           timestamptz,        -- last game battle_time
  games_played       int not null default 0,
  team0_wins         int not null default 0,
  team1_wins         int not null default 0,
  winning_team_index int,                -- 0 | 1 | null (draw/unresolved) — intentionally nullable
  is_complete        boolean not null default false,
  updated_at         timestamptz default now()
);

alter table public.ranked_sets enable row level security;

drop policy if exists "ranked_sets_select" on public.ranked_sets;
create policy "ranked_sets_select"
  on public.ranked_sets
  for select
  to anon, authenticated
  using (true);

grant select on public.ranked_sets to anon, authenticated;
grant all on public.ranked_sets to service_role;

-- =========================================================================================
-- === set_participants ===
-- =========================================================================================

create table if not exists public.set_participants (
  set_id        uuid references public.ranked_sets(id) on delete cascade,
  player_tag    text references public.players(tag),
  team_index    int not null check (team_index in (0, 1)),
  brawler_id    int,
  brawler_name  text,
  brawler_power int,
  rank_value    int references public.rank_tiers(value),
  primary key (set_id, player_tag)
);

alter table public.set_participants enable row level security;

drop policy if exists "set_participants_select" on public.set_participants;
create policy "set_participants_select"
  on public.set_participants
  for select
  to anon, authenticated
  using (true);

grant select on public.set_participants to anon, authenticated;
grant all on public.set_participants to service_role;

-- =========================================================================================
-- === battles ===
-- === raw record only, no stats derived from it. `battle_type` is deliberately absent —
-- === only soloRanked is ingested, so there's nothing to distinguish.
-- =========================================================================================

create table if not exists public.battles (
  id                 uuid primary key default gen_random_uuid(),
  set_id             uuid references public.ranked_sets(id) on delete cascade,
  game_number        int,
  battle_time        timestamptz not null,   -- END of the battle
  duration           int,
  winning_team_index int,                    -- nullable: draws
  star_player_tag    text references public.players(tag),  -- nullable
  dedupe_key         text not null unique
);

alter table public.battles enable row level security;

drop policy if exists "battles_select" on public.battles;
create policy "battles_select"
  on public.battles
  for select
  to anon, authenticated
  using (true);

grant select on public.battles to anon, authenticated;
grant all on public.battles to service_role;

-- =========================================================================================
-- === indexes ===
-- =========================================================================================

create index if not exists set_participants_player_tag_idx
  on public.set_participants (player_tag);

create index if not exists set_participants_set_id_idx
  on public.set_participants (set_id);

create index if not exists set_participants_brawler_id_idx
  on public.set_participants (brawler_id);

create index if not exists ranked_sets_started_at_idx
  on public.ranked_sets (started_at desc);

create index if not exists ranked_sets_event_id_idx
  on public.ranked_sets (event_id);

create index if not exists ranked_sets_is_complete_idx
  on public.ranked_sets (is_complete)
  where is_complete;

create index if not exists battles_set_id_idx
  on public.battles (set_id);

create index if not exists battles_battle_time_idx
  on public.battles (battle_time desc);
