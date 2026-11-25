-- supabase/migrations/015_delete_restore.sql
--
-- Wiki migration (Phase 4) — admins can delete a person/club page, and restore it later.
--
--   delete_entity(kind, slug):  admin only. Saves the whole row as a revision with field '-'
--                               (old_value = snapshot), then deletes the row.
--   restore_entity(revision_id): admin only. Re-inserts the snapshot from such a revision (same id,
--                               slug and content). Fails if the slug has been taken since.
--
-- There is still no DELETE grant or policy on people/clubs: these functions are the only way to
-- delete through the API, and they check is_admin() themselves. Revisions of a deleted page stay,
-- so its history (and the snapshot) remain visible on /historikk/.
--
-- SAFETY / RE-RUNNABILITY: create or replace; safe to re-run.
-- HOW TO APPLY: npx supabase db push --remote

create or replace function public.current_editor_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(e.display_name,
                  u.raw_user_meta_data->'custom_claims'->>'global_name',
                  u.raw_user_meta_data->>'full_name')
    from auth.users u
    left join public.editors e on e.user_id = u.id
   where u.id = auth.uid();
$$;

revoke all on function public.current_editor_name() from public, anon, authenticated;

create or replace function public.delete_entity(kind text, target_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  target_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan slette sider.' using errcode = '42501';
  end if;

  if kind = 'person' then
    select to_jsonb(p), p.id into snapshot, target_id from public.people p where p.slug = target_slug for update;
  elsif kind = 'club' then
    select to_jsonb(c), c.id into snapshot, target_id from public.clubs c where c.slug = target_slug for update;
  else
    raise exception 'Ukjent sidetype.' using errcode = '22023';
  end if;

  if snapshot is null then
    raise exception 'Siden finnes ikke.' using errcode = 'P0002';
  end if;

  insert into public.revisions (entity, entity_id, entity_slug, field, old_value, new_value, user_id, user_name)
  values (kind, target_id, target_slug, '-', snapshot, null, auth.uid(), public.current_editor_name());

  if kind = 'person' then
    delete from public.people where id = target_id;
  else
    delete from public.clubs where id = target_id;
  end if;
end;
$$;

create or replace function public.restore_entity(revision_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  rev public.revisions;
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan gjenopprette sider.' using errcode = '42501';
  end if;

  select * into rev from public.revisions r where r.id = revision_id;
  if not found or rev.field <> '-' or rev.old_value is null then
    raise exception 'Fant ingen slettet side å gjenopprette.' using errcode = 'P0002';
  end if;

  begin
    if rev.entity = 'person' then
      insert into public.people select * from jsonb_populate_record(null::public.people, rev.old_value);
    else
      insert into public.clubs select * from jsonb_populate_record(null::public.clubs, rev.old_value);
    end if;
  exception when unique_violation then
    raise exception 'Adressen er tatt i bruk av en annen side, eller siden finnes allerede.' using errcode = '23505';
  end;

  return rev.entity_slug;
end;
$$;

revoke all on function public.delete_entity(text, text) from public, anon;
revoke all on function public.restore_entity(bigint) from public, anon;
grant execute on function public.delete_entity(text, text) to authenticated;
grant execute on function public.restore_entity(bigint) to authenticated;
