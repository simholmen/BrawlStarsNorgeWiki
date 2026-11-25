-- supabase/migrations/016_ranked_profiles.sql
--
-- Wiki migration (Phase 2) — the ranked roster moves into the database.
--
-- ranked_profiles is the list of players rankedstats/ingest.py tracks. Until now that list was
-- built from `bsid` + `name` in docs/_personer/*.md (frozen since Phase 4). Editors now manage it
-- on the site ("Ranked-profiler" in the menu), independent of wiki pages: a player can be
-- tracked without having a wiki page, and a wiki page with a tag isn't tracked automatically.
--
--   - tag: WITH the leading '#', upper case, same form as players.tag. Brawl Stars tags only use
--     the characters 0289PYLQGRJCUV, so a typo like the letter O is rejected.
--   - active = false instead of deleting: the row (and who removed it) is kept, and it can be
--     turned back on. Ingest only tracks active rows, and un-tracks the rest in `players`.
--   - created_by / updated_by are filled in by a trigger from the session, so they can't be faked.
--   - RLS: everyone can read (tags are public on the ranked page anyway); editors insert/update;
--     nobody deletes through the API.
--
-- Seeded from people.bsid, which matched the Markdown roster exactly on 2026-11-25 (41 players).
--
-- SAFETY / RE-RUNNABILITY: if-not-exists / create-or-replace / drop-then-create / on conflict.
-- HOW TO APPLY: npx supabase db push --remote

create table if not exists public.ranked_profiles (
  tag              text primary key,
  name             text not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  created_by_name  text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null,
  updated_by_name  text,
  constraint ranked_profiles_tag_format check (tag ~ '^#[0289PYLQGRJCUV]{3,14}$'),
  constraint ranked_profiles_name_length check (char_length(btrim(name)) between 1 and 60)
);

create index if not exists ranked_profiles_active_idx on public.ranked_profiles (active);

-- Who/when, from the session. On update the tag and created_* can't change.
create or replace function public.ranked_profiles_stamp()
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

revoke all on function public.ranked_profiles_stamp() from public, anon, authenticated;

drop trigger if exists ranked_profiles_stamp on public.ranked_profiles;
create trigger ranked_profiles_stamp
  before insert or update on public.ranked_profiles
  for each row execute function public.ranked_profiles_stamp();

alter table public.ranked_profiles enable row level security;

drop policy if exists "ranked_profiles_select" on public.ranked_profiles;
create policy "ranked_profiles_select"
  on public.ranked_profiles for select to anon, authenticated
  using (true);

drop policy if exists "ranked_profiles_insert_editors" on public.ranked_profiles;
create policy "ranked_profiles_insert_editors"
  on public.ranked_profiles for insert to authenticated
  with check ((select public.is_editor()));

drop policy if exists "ranked_profiles_update_editors" on public.ranked_profiles;
create policy "ranked_profiles_update_editors"
  on public.ranked_profiles for update to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

revoke all on public.ranked_profiles from anon, authenticated;
grant select on public.ranked_profiles to anon, authenticated;
grant insert, update on public.ranked_profiles to authenticated;
grant all on public.ranked_profiles to service_role;

-- Seed: today's roster (every person with a valid tag). Existing rows are left alone.
insert into public.ranked_profiles (tag, name)
select '#' || upper(btrim(p.bsid)), p.name
  from public.people p
 where p.bsid is not null
   and ('#' || upper(btrim(p.bsid))) ~ '^#[0289PYLQGRJCUV]{3,14}$'
on conflict (tag) do nothing;
