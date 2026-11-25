-- supabase/tests/014_editing.sql
--
-- Tests for 014_editing.sql: who may write people/clubs, identity locking, checks, and that every
-- change is recorded in revisions. Run with tools/run_sql_test.sh (always BEGIN ... ROLLBACK), so
-- the edits to real rows below are never kept. First failure aborts with 'FAIL ...'.

-- ---------------------------------------------------------------- fixtures (as postgres)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-editor@example.invalid',
   '{"full_name":"eddie","custom_claims":{"global_name":"Eddie Editor"}}', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-plain@example.invalid', '{"full_name":"plain"}', '{}', now(), now());

insert into public.editors (user_id, role, display_name)
values ('00000000-0000-4000-8000-00000000b001', 'editor', 'Eddie Editor');

-- every existing row got an image_key equal to the old name rule
do $$ begin
  if exists (select 1 from public.people where image_key <> lower(replace(name, ' ', '_'))) then
    raise exception 'FAIL image_key backfill'; end if;
end $$;

-- ---------------------------------------------------------------- anon: no writes
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin update public.people set quote = 'x' where slug = 'zimma';
    raise exception 'FAIL anon can update people';
  exception when insufficient_privilege then null; end;
  begin insert into public.people (slug, name, image_key) values ('anon-test', 'A', 'a');
    raise exception 'FAIL anon can insert people';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- plain logged-in user: no writes
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000b002","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.people set quote = 'hacked' where slug = 'zimma';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL plain user updated % rows', n; end if;
  begin insert into public.people (slug, name, image_key) values ('plain-test', 'P', 'p');
    raise exception 'FAIL plain user can insert';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.revisions;
  if n <> 0 then raise exception 'FAIL plain user can read % revisions', n; end if;
end $$;

-- ---------------------------------------------------------------- editor: edits are recorded
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000b001","role":"authenticated"}', true);

do $$ declare
  n int; r public.revisions; before_quote text; before_ts timestamptz; zid uuid;
begin
  select id, quote, updated_at into zid, before_quote, before_ts from public.people where slug = 'zimma';

  -- one field
  update public.people set quote = 'Test-sitat' where slug = 'zimma';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL editor update hit % rows', n; end if;
  select * into r from public.revisions where entity_id = zid order by id desc limit 1;
  if r.field <> 'quote' or r.old_value <> to_jsonb(before_quote) or r.new_value <> '"Test-sitat"'::jsonb
     or r.user_id <> '00000000-0000-4000-8000-00000000b001' or r.user_name <> 'Eddie Editor'
     or r.entity <> 'person' or r.entity_slug <> 'zimma' then
    raise exception 'FAIL revision content: % % % % %', r.field, r.old_value, r.new_value, r.user_id, r.user_name;
  end if;

  -- same value again: no new revision
  select count(*) into n from public.revisions where entity_id = zid;
  update public.people set quote = 'Test-sitat' where slug = 'zimma';
  if (select count(*) from public.revisions where entity_id = zid) <> n then
    raise exception 'FAIL unchanged value produced a revision'; end if;

  -- two fields in one save: two revisions, same tx_id
  update public.people set hjemsted = 'Testby', favorittbrus = 'Testbrus' where slug = 'zimma';
  if (select count(distinct tx_id) from (select tx_id from public.revisions where entity_id = zid
        and field in ('hjemsted', 'favorittbrus') order by id desc limit 2) t) <> 1 then
    raise exception 'FAIL multi-field save not grouped'; end if;

  -- identity columns can't change, and produce no revision
  update public.people set slug = 'hacked-slug', image_key = 'hacked' where slug = 'zimma';
  if not exists (select 1 from public.people where slug = 'zimma' and image_key = 'zimma') then
    raise exception 'FAIL slug/image_key changed'; end if;
  if exists (select 1 from public.revisions where entity_id = zid and field in ('slug', 'image_key')) then
    raise exception 'FAIL identity change recorded'; end if;

  -- optimistic locking: a stale updated_at matches nothing. (Inside one test transaction now()
  -- never moves, so "someone saved in between" is simulated with an older timestamp.)
  update public.people set quote = 'stale' where slug = 'zimma'
     and updated_at = (select updated_at from public.people where slug = 'zimma') - interval '1 second';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL stale updated_at still updated'; end if;

  -- checks
  begin update public.people set facts = '[{"label":1,"value":"x"}]' where slug = 'zimma';
    raise exception 'FAIL bad facts accepted';
  exception when check_violation then null; end;
  begin update public.people set quote = repeat('x', 301) where slug = 'zimma';
    raise exception 'FAIL over-long quote accepted';
  exception when check_violation then null; end;

  -- create
  insert into public.people (slug, name, image_key) values ('test-person-ø', 'Test Person Ø', 'test_person_ø');
  if not exists (select 1 from public.revisions where entity_slug = 'test-person-ø' and field = '*'
                 and new_value->>'name' = 'Test Person Ø') then
    raise exception 'FAIL create not recorded'; end if;
  begin insert into public.people (slug, name, image_key) values ('Bad Slug', 'B', 'b');
    raise exception 'FAIL bad slug accepted';
  exception when check_violation then null; end;
  begin insert into public.people (slug, name, image_key) values ('zimma', 'Dup', 'dup');
    raise exception 'FAIL duplicate slug accepted';
  exception when unique_violation then null; end;

  -- clubs work the same way
  update public.clubs set medlemmer = '31' where slug = 'etpargodemenn';
  if not exists (select 1 from public.revisions where entity = 'club' and entity_slug = 'etpargodemenn'
                 and field = 'medlemmer' and new_value = '"31"'::jsonb) then
    raise exception 'FAIL club edit not recorded'; end if;

  -- no delete, no writing history directly
  begin delete from public.people where slug = 'test-person-ø';
    raise exception 'FAIL editor can delete';
  exception when insufficient_privilege then null; end;
  begin insert into public.revisions (entity, entity_id, entity_slug, field) values ('person', zid, 'zimma', 'x');
    raise exception 'FAIL editor can write revisions';
  exception when insufficient_privilege then null; end;
  begin update public.revisions set user_name = 'someone else';
    raise exception 'FAIL editor can rewrite revisions';
  exception when insufficient_privilege then null; end;

  -- editor can read history
  select count(*) into n from public.revisions;
  if n < 5 then raise exception 'FAIL editor sees only % revisions', n; end if;
end $$;

reset role;
select 'ALL 014 EDITING TESTS PASSED' as result;
