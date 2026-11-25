-- supabase/migrations/013_discord_names.sql
--
-- Fix how access requests read the Discord name. The first real login (2026-11-25) showed
-- Supabase's Discord provider stores:
--   full_name                  = handle            ("zimma2832")
--   name                       = handle + "#0"     ("zimma2832#0", legacy discriminator)
--   custom_claims.global_name  = display name      ("Zimma")
--   avatar_url                 = CDN URL
-- and no user_name. 012 picked `name` for the handle, giving "zimma2832#0".
--
-- Only the trigger function changes (create or replace); safe to re-run.

create or replace function public.access_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb;
  handle text;
begin
  if auth.uid() is null then
    raise exception 'Du må være logget inn.' using errcode = '42501';
  end if;
  if exists (select 1 from public.editors e where e.user_id = auth.uid()) then
    raise exception 'Du har allerede redigeringstilgang.' using errcode = 'P0001';
  end if;

  select u.raw_user_meta_data into meta from auth.users u where u.id = auth.uid();

  handle := coalesce(
    nullif(meta->>'user_name', ''),
    nullif(meta->>'full_name', ''),
    nullif(meta->>'preferred_username', ''),
    nullif(regexp_replace(coalesce(meta->>'name', ''), '#0$', ''), '')
  );

  new.id          := gen_random_uuid();
  new.user_id     := auth.uid();
  new.status      := 'pending';
  new.created_at  := now();
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.message     := btrim(new.message);
  new.discord_username := handle;
  new.display_name     := coalesce(nullif(meta->'custom_claims'->>'global_name', ''), handle);
  new.avatar_url       := meta->>'avatar_url';
  return new;
end;
$$;

revoke all on function public.access_requests_before_insert() from public, anon, authenticated;
