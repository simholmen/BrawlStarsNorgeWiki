-- supabase/tests/022_maxed_account.sql
--
-- Tests for 022_maxed_account.sql. Run with tools/run_sql_test.sh (BEGIN ... ROLLBACK), e.g. before
-- applying:  tools/run_sql_test.sh supabase/tests/022_maxed_account.sql supabase/migrations/022_maxed_account.sql

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        created_at, updated_at)
values ('00000000-0000-4000-8000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'test-editor22@example.invalid', '{"full_name":"eddie22"}', '{}', now(), now());
insert into public.editors (user_id, role, display_name) values
  ('00000000-0000-4000-8000-00000000e001', 'editor', 'Eddie 22');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform brawlers_owned, owned_levels, owned_buffies from public.toplist_stats;
  perform 1 from public.brawler_catalogue;
  begin insert into public.brawler_catalogue (brawler_id, name) values (1, 'x');
    raise exception 'FAIL anon can write brawler_catalogue';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000e001","role":"authenticated"}', true);
do $$ begin
  begin insert into public.brawler_catalogue (brawler_id, name) values (1, 'x');
    raise exception 'FAIL editor can write brawler_catalogue';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'ok' as result;
