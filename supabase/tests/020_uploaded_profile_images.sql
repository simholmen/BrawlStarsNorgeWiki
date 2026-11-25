-- supabase/tests/020_uploaded_profile_images.sql
--
-- Tests for 020_uploaded_profile_images.sql: portrait_url / profile_urls only take wiki-images
-- URLs, editors can set them, and the change is recorded in revisions. Run with
-- tools/run_sql_test.sh (always BEGIN ... ROLLBACK). First failure aborts with 'FAIL ...'.

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        created_at, updated_at)
values ('00000000-0000-4000-8000-00000000d001', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'test-pic-editor@example.invalid', '{"full_name":"piceddie"}', '{}', now(), now());
insert into public.editors (user_id, role, display_name)
values ('00000000-0000-4000-8000-00000000d001', 'editor', 'Pic Editor');

do $$ begin
  if not public.valid_wiki_image_url(
       'https://abc123.supabase.co/storage/v1/object/public/wiki-images/2026-11/3f2c1a9e-1b2c-4d3e-8f90-123456789abc.png')
  then raise exception 'FAIL good url rejected'; end if;
  if public.valid_wiki_image_url('https://evil.example/x.png') then raise exception 'FAIL foreign url'; end if;
  if public.valid_wiki_image_url(
       'https://abc.supabase.co/storage/v1/object/public/other/2026-11/3f2c1a9e.png')
  then raise exception 'FAIL other bucket'; end if;
  if public.valid_profile_urls('{"1999":"x"}') then raise exception 'FAIL bad year'; end if;
  if public.valid_profile_urls('[]') then raise exception 'FAIL array accepted'; end if;
  if not public.valid_profile_urls('{}') then raise exception 'FAIL empty rejected'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000d001","role":"authenticated"}', true);

do $$ declare
  good text := 'https://abc123.supabase.co/storage/v1/object/public/wiki-images/2026-11/3f2c1a9e-1b2c-4d3e-8f90-123456789abc.png';
  zid uuid; n int;
begin
  select id into zid from public.people where slug = 'zimma';

  update public.people set portrait_url = good, profile_urls = jsonb_build_object('2026', good) where slug = 'zimma';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL editor could not set images'; end if;
  select count(*) into n from public.revisions
   where entity_id = zid and field in ('portrait_url', 'profile_urls');
  if n <> 2 then raise exception 'FAIL expected 2 revisions, got %', n; end if;

  begin update public.people set portrait_url = 'https://evil.example/x.png' where slug = 'zimma';
    raise exception 'FAIL foreign portrait accepted';
  exception when check_violation then null; end;
  begin update public.people set profile_urls = '{"2026":"https://evil.example/x.png"}' where slug = 'zimma';
    raise exception 'FAIL foreign profile url accepted';
  exception when check_violation then null; end;
end $$;

select 'ok 020_uploaded_profile_images' as result;
