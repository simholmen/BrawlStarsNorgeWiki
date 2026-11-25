-- supabase/migrations/014_editing.sql
--
-- Wiki migration (Phase 4) — editors can edit and create people/clubs; every change is recorded.
-- Plan: notes/claude-specs/plans/wiki-phase4-editing.md (local notes).
--
-- From this phase on, Supabase is the source of truth for people/clubs (owner decision
-- 2026-11-25); tools/import_wiki.py refuses to overwrite site edits.
--
--   - image_key: images were found via the name; renaming a person would break them. The key is
--     frozen at creation and used for image paths instead.
--   - Length/shape checks so a bad save can't store junk.
--   - RLS: editors (is_editor()) may insert/update; nobody may delete through the API.
--   - slug/id/created_at can't change after creation (trigger), so URLs never break.
--   - revisions: one row per changed column per save, written by a security definer trigger.
--     There's no write policy on revisions at all, so history can't be skipped or faked.
--
-- SAFETY / RE-RUNNABILITY: if-not-exists / create-or-replace / drop-then-create throughout.
-- HOW TO APPLY: npx supabase db push --remote

-- =========================================================================================
-- === image_key ===
-- =========================================================================================

alter table public.people add column if not exists image_key text;
alter table public.clubs add column if not exists image_key text;

-- Same rule as web/lib/images.ts imageBaseName() and the Jekyll layouts.
update public.people set image_key = lower(replace(name, ' ', '_')) where image_key is null;
update public.clubs set image_key = lower(replace(name, ' ', '_')) where image_key is null;

alter table public.people alter column image_key set not null;
alter table public.clubs alter column image_key set not null;

-- =========================================================================================
-- === shape + length checks ===
-- =========================================================================================

-- facts: a JSON array (max 30) of {"label": text, "value": text}.
create or replace function public.valid_facts(facts jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(facts) = 'array'
     and jsonb_array_length(facts) <= 30
     and not exists (
       select 1 from jsonb_array_elements(facts) f
        where jsonb_typeof(f) <> 'object'
           or jsonb_typeof(f->'label') <> 'string'
           or jsonb_typeof(f->'value') <> 'string'
           or char_length(f->>'label') > 100
           or char_length(f->>'value') > 500
     );
$$;

do $$
begin
  -- people
  if not exists (select 1 from pg_constraint where conname = 'people_lengths') then
    alter table public.people add constraint people_lengths check (
      char_length(name) between 1 and 200
      and char_length(coalesce(subtitle, '')) <= 200
      and char_length(coalesce(hjemsted, '')) <= 200
      and char_length(coalesce(born, '')) <= 200
      and char_length(coalesce(bsid, '')) <= 20
      and char_length(coalesce(favorittbrus, '')) <= 200
      and char_length(coalesce(favoritt_brawler, '')) <= 200
      and char_length(coalesce(fiende, '')) <= 200
      and char_length(coalesce(quote, '')) <= 300
      and char_length(body_md) <= 50000
      and char_length(image_key) between 1 and 200
      and image_ext in ('jpg', 'jpeg', 'png', 'webp', 'gif')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'people_facts_valid') then
    alter table public.people add constraint people_facts_valid check (public.valid_facts(facts));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'people_slug_format') then
    alter table public.people add constraint people_slug_format
      check (slug = lower(slug) and slug ~ '^[[:alnum:]]+(-[[:alnum:]]+)*$');
  end if;

  -- clubs
  if not exists (select 1 from pg_constraint where conname = 'clubs_lengths') then
    alter table public.clubs add constraint clubs_lengths check (
      char_length(name) between 1 and 200
      and char_length(coalesce(aktiv, '')) <= 200
      and char_length(coalesce(stiftet, '')) <= 200
      and char_length(coalesce(leder, '')) <= 200
      and char_length(coalesce(medlemmer, '')) <= 200
      and cardinality(underklubber) <= 30
      and char_length(body_md) <= 50000
      and char_length(image_key) between 1 and 200
      and image_ext in ('jpg', 'jpeg', 'png', 'webp', 'gif')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clubs_facts_valid') then
    alter table public.clubs add constraint clubs_facts_valid check (public.valid_facts(facts));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clubs_slug_format') then
    alter table public.clubs add constraint clubs_slug_format
      check (slug = lower(slug) and slug ~ '^[[:alnum:]]+(-[[:alnum:]]+)*$');
  end if;
end $$;

-- =========================================================================================
-- === identity columns are fixed after creation ===
-- =========================================================================================

create or replace function public.lock_identity_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.slug := old.slug;
  new.created_at := old.created_at;
  new.image_key := old.image_key;
  return new;
end;
$$;

drop trigger if exists people_lock_identity on public.people;
create trigger people_lock_identity
  before update on public.people
  for each row execute function public.lock_identity_columns();

drop trigger if exists clubs_lock_identity on public.clubs;
create trigger clubs_lock_identity
  before update on public.clubs
  for each row execute function public.lock_identity_columns();

-- =========================================================================================
-- === write policies: editors insert/update, nobody deletes via the API ===
-- =========================================================================================

drop policy if exists "people_insert_editors" on public.people;
create policy "people_insert_editors"
  on public.people for insert to authenticated
  with check ((select public.is_editor()));

drop policy if exists "people_update_editors" on public.people;
create policy "people_update_editors"
  on public.people for update to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

drop policy if exists "clubs_insert_editors" on public.clubs;
create policy "clubs_insert_editors"
  on public.clubs for insert to authenticated
  with check ((select public.is_editor()));

drop policy if exists "clubs_update_editors" on public.clubs;
create policy "clubs_update_editors"
  on public.clubs for update to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

-- Supabase's default privileges give anon/authenticated ALL on new tables; 011 only added SELECT
-- on top. RLS already blocked writes, but make the grants say exactly what's allowed too.
revoke all on public.people from anon, authenticated;
revoke all on public.clubs from anon, authenticated;
grant select on public.people to anon, authenticated;
grant select on public.clubs to anon, authenticated;
grant insert, update on public.people to authenticated;
grant insert, update on public.clubs to authenticated;

-- =========================================================================================
-- === revisions ===
-- =========================================================================================

create table if not exists public.revisions (
  id           bigint generated always as identity primary key,
  entity       text not null check (entity in ('person', 'club')),
  entity_id    uuid not null,
  entity_slug  text not null,
  field        text not null,          -- column name, or '*' for "page created"
  old_value    jsonb,
  new_value    jsonb,
  user_id      uuid references auth.users (id) on delete set null,  -- null = import / service role
  user_name    text,                   -- snapshot, so history stays readable if the user leaves
  tx_id        bigint not null default txid_current(),  -- groups the fields of one save
  created_at   timestamptz not null default now()
);

create index if not exists revisions_entity_idx on public.revisions (entity, entity_id, created_at desc);
create index if not exists revisions_created_idx on public.revisions (created_at desc);

alter table public.revisions enable row level security;

drop policy if exists "revisions_select_editors" on public.revisions;
create policy "revisions_select_editors"
  on public.revisions for select to authenticated
  using ((select public.is_editor()));

revoke all on public.revisions from anon, authenticated;
grant select on public.revisions to authenticated;
grant all on public.revisions to service_role;

create or replace function public.record_revisions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity_kind text := case tg_table_name when 'people' then 'person' else 'club' end;
  uid uuid := auth.uid();
  uname text;
  old_row jsonb;
  new_row jsonb := to_jsonb(new);
  col text;
begin
  if uid is not null then
    select coalesce(e.display_name,
                    u.raw_user_meta_data->'custom_claims'->>'global_name',
                    u.raw_user_meta_data->>'full_name')
      into uname
      from auth.users u
      left join public.editors e on e.user_id = u.id
     where u.id = uid;
  end if;

  if tg_op = 'INSERT' then
    insert into public.revisions (entity, entity_id, entity_slug, field, old_value, new_value, user_id, user_name)
    values (entity_kind, new.id, new.slug, '*', null, new_row - 'created_at' - 'updated_at', uid, uname);
    return new;
  end if;

  old_row := to_jsonb(old);
  for col in select jsonb_object_keys(new_row) loop
    continue when col in ('updated_at', 'created_at', 'id');
    if old_row->col is distinct from new_row->col then
      insert into public.revisions (entity, entity_id, entity_slug, field, old_value, new_value, user_id, user_name)
      values (entity_kind, new.id, new.slug, col, old_row->col, new_row->col, uid, uname);
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.record_revisions() from public, anon, authenticated;

drop trigger if exists people_record_revisions on public.people;
create trigger people_record_revisions
  after insert or update on public.people
  for each row execute function public.record_revisions();

drop trigger if exists clubs_record_revisions on public.clubs;
create trigger clubs_record_revisions
  after insert or update on public.clubs
  for each row execute function public.record_revisions();
