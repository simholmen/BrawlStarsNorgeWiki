-- supabase/tests/021_toplists.sql
--
-- Tests for 021_toplists.sql. Run with tools/run_sql_test.sh (BEGIN ... ROLLBACK), e.g. before
-- applying:  tools/run_sql_test.sh supabase/tests/021_toplists.sql supabase/migrations/021_toplists.sql

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-editor21@example.invalid', '{"full_name":"eddie21"}', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-user21@example.invalid', '{"full_name":"user21"}', '{}', now(), now());

insert into public.editors (user_id, role, display_name) values
  ('00000000-0000-4000-8000-00000000d001', 'editor', 'Eddie 21');

-- ---------------------------------------------------------------- anon: read only
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform 1 from public.toplist_players;
  perform 1 from public.toplist_stats;
  begin insert into public.toplist_players (tag, name) values ('#2GY22JUR', 'x');
    raise exception 'FAIL anon can insert toplist_players';
  exception when insufficient_privilege then null; end;
  begin insert into public.toplist_stats (tag) values ('#2GY22JUR');
    raise exception 'FAIL anon can insert toplist_stats';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- logged in, not an editor
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000d002","role":"authenticated"}', true);
do $$ begin
  begin insert into public.toplist_players (tag, name) values ('#2GY22JUR', 'x');
    raise exception 'FAIL non-editor can insert toplist_players';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- editor
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000d001","role":"authenticated"}', true);
do $$
declare r public.toplist_players;
begin
  insert into public.toplist_players (tag, name, created_by_name) values ('#PYLQ0289', '  Testspiller ', 'fake')
    returning * into r;
  if r.name <> 'Testspiller' then raise exception 'FAIL name not trimmed: %', r.name; end if;
  if r.created_by is distinct from '00000000-0000-4000-8000-00000000d001'::uuid then
    raise exception 'FAIL created_by not stamped';
  end if;
  if r.created_by_name = 'fake' then raise exception 'FAIL created_by_name can be faked'; end if;

  update public.toplist_players set active = false where tag = '#PYLQ0289' returning * into r;
  if r.active then raise exception 'FAIL editor cannot deactivate'; end if;

  begin insert into public.toplist_players (tag, name) values ('#OOPS', 'x');
    raise exception 'FAIL bad tag accepted';
  exception when check_violation then null; end;

  begin delete from public.toplist_players where tag = '#PYLQ0289';
    raise exception 'FAIL editor can delete';
  exception when insufficient_privilege then null; end;

  begin insert into public.toplist_stats (tag) values ('#PYLQ0289');
    raise exception 'FAIL editor can write toplist_stats';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'ok' as result;
