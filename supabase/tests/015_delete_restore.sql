-- supabase/tests/015_delete_restore.sql
--
-- Tests for 015_delete_restore.sql. Run with tools/run_sql_test.sh (BEGIN ... ROLLBACK): the real
-- page deleted below is never actually deleted.

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-admin2@example.invalid', '{"full_name":"adminette"}', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-editor2@example.invalid', '{"full_name":"eddie2"}', '{}', now(), now());

insert into public.editors (user_id, role, display_name) values
  ('00000000-0000-4000-8000-00000000c001', 'admin', 'Adminette'),
  ('00000000-0000-4000-8000-00000000c002', 'editor', 'Eddie 2');

-- remember the real row to compare after restore
create temp table before_row as select * from public.people where slug = 'zimma';
grant select on before_row to authenticated;

-- ---------------------------------------------------------------- anon / editor: refused
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform public.delete_entity('person', 'zimma'); raise exception 'FAIL anon can delete';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000c002","role":"authenticated"}', true);
do $$ begin
  begin perform public.delete_entity('person', 'zimma'); raise exception 'FAIL editor can delete';
  exception when insufficient_privilege then null; end;
  begin delete from public.people where slug = 'zimma'; raise exception 'FAIL editor can DELETE directly';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- admin: delete + restore
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}', true);
do $$ declare rev_id bigint; restored text; snap jsonb; begin
  perform public.delete_entity('person', 'zimma');
  if exists (select 1 from public.people where slug = 'zimma') then raise exception 'FAIL not deleted'; end if;

  select id, old_value into rev_id, snap from public.revisions
   where entity = 'person' and entity_slug = 'zimma' and field = '-' order by id desc limit 1;
  if rev_id is null then raise exception 'FAIL no delete revision'; end if;
  if snap->>'name' <> 'Zimma' or (select user_name from public.revisions where id = rev_id) <> 'Adminette' then
    raise exception 'FAIL snapshot/user wrong'; end if;

  begin perform public.delete_entity('person', 'zimma'); raise exception 'FAIL deleted twice';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.delete_entity('banana', 'zimma'); raise exception 'FAIL unknown kind accepted';
  exception when sqlstate '22023' then null; end;

  restored := public.restore_entity(rev_id);
  if restored <> 'zimma' then raise exception 'FAIL restore returned %', restored; end if;
  if not exists (
    select 1 from public.people p join before_row b on b.id = p.id
     where p.slug = b.slug and p.name = b.name and p.body_md = b.body_md and p.facts = b.facts
       and p.quote is not distinct from b.quote and p.image_key = b.image_key
  ) then raise exception 'FAIL restored row differs'; end if;

  begin perform public.restore_entity(rev_id); raise exception 'FAIL restored twice';
  exception when unique_violation then null; end;

  -- clubs too
  perform public.delete_entity('club', 'lonely-gang');
  if exists (select 1 from public.clubs where slug = 'lonely-gang') then raise exception 'FAIL club not deleted'; end if;
end $$;

reset role;
select 'ALL 015 DELETE/RESTORE TESTS PASSED' as result;
