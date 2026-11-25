-- rankedstats/migrations/011_wiki_content.sql
--
-- Wiki migration (Phase 0) — `people` and `clubs` tables holding the wiki content that today
-- lives in docs/_personer/*.md and docs/_klubber/*.md.
--
-- WHY:
--   The Next.js wiki (web/, see notes/claude-specs/plans/wiki-phase1-readonly.md) renders pages
--   from these tables. During Phases 0-1 the Markdown files remain the source of truth and
--   tools/import_wiki.py rebuilds these rows from them (upsert by slug); nothing else writes here.
--
-- SHAPE:
--   - `slug` is the page's URL segment, exactly as Jekyll produces it today
--     (/personer/<slug>/, /klubber/<slug>/).
--   - `facts` is a JSON array of {"label": text, "value": text}, the extra infobox rows.
--   - `body_md` is Markdown. Links to other wiki pages use the [[person:slug|Label]] /
--     [[klubb:slug|Label]] syntax instead of raw <a> tags.
--   - Club infobox fields (aktiv, stiftet, leder, medlemmer) are free-form text, because the
--     existing content is (e.g. "05.11.2021", "Nei", "30+").
--
-- ACCESS:
--   Public read (anon + authenticated), like the ranked-stats tables. No insert/update/delete
--   policies: only the service role (the import script's secret key) can write. Editing policies
--   come with the editors table in a later migration.
--
-- SAFETY / RE-RUNNABILITY:
--   create-if-not-exists, drop-then-create for policies and triggers: safe to re-run.
--
-- HOW TO APPLY:
--   Paste this whole file into the Supabase SQL Editor and run it once (after 001-010).

-- =========================================================================================
-- === updated_at helper ===
-- =========================================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================================
-- === people ===
-- =========================================================================================

create table if not exists public.people (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  subtitle          text,
  hjemsted          text,
  born              text,                    -- usually a year; text so "ca. 2005" etc. survive
  bsid              text,                    -- Brawl Stars tag WITHOUT leading '#', as in the .md files
  favorittbrus      text,
  favoritt_brawler  text,
  quote             text,
  fiende            text,
  image_ext         text not null default 'jpg',
  hidden_profile_years int[] not null default '{}',  -- from no_<year>_profile: true flags
  facts             jsonb not null default '[]'::jsonb,
  body_md           text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists people_bsid_idx on public.people (bsid);

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

alter table public.people enable row level security;

drop policy if exists "people_select" on public.people;
create policy "people_select"
  on public.people
  for select
  to anon, authenticated
  using (true);

grant select on public.people to anon, authenticated;
grant all on public.people to service_role;

-- =========================================================================================
-- === clubs ===
-- =========================================================================================

create table if not exists public.clubs (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  aktiv         text,
  stiftet       text,
  leder         text,
  medlemmer     text,
  underklubber  text[] not null default '{}',
  image_ext     text not null default 'jpg',
  facts         jsonb not null default '[]'::jsonb,
  body_md       text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

alter table public.clubs enable row level security;

drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select"
  on public.clubs
  for select
  to anon, authenticated
  using (true);

grant select on public.clubs to anon, authenticated;
grant all on public.clubs to service_role;
