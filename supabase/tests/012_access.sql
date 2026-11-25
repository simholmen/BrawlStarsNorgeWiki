-- supabase/tests/012_access.sql
--
-- Permission tests for 012_editors_access_requests.sql. Every check raises 'FAIL ...' on a wrong
-- result, so the first failure aborts the run; a clean run ends with 'ALL 012 ACCESS TESTS PASSED'.
--
-- Runs against the real project WITHOUT changing it: tools/run_sql_test.sh wraps this file in
-- BEGIN ... ROLLBACK (optionally together with the migration itself, to test it before applying).
-- The three fake users exist only inside that transaction.

-- ---------------------------------------------------------------- fixtures (as postgres)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-admin@example.invalid',
   '{"user_name":"testadmin","full_name":"Test Admin","avatar_url":"https://cdn.example/a.png"}', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-alice@example.invalid',
   '{"user_name":"alice","custom_claims":{"global_name":"Alice A"},"avatar_url":"https://cdn.example/b.png"}', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-bob@example.invalid',
   '{"name":"bob#0","full_name":"bob","avatar_url":"https://cdn.example/c.png"}', '{}', now(), now());

insert into public.editors (user_id, role, display_name)
values ('00000000-0000-4000-8000-00000000a001', 'admin', 'Test Admin');

-- ---------------------------------------------------------------- anon: sees and runs nothing
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$ begin
  begin perform 1 from public.editors; raise exception 'FAIL anon can read editors';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.access_requests; raise exception 'FAIL anon can read access_requests';
  exception when insufficient_privilege then null; end;
  begin perform public.is_admin(); raise exception 'FAIL anon can call is_admin';
  exception when insufficient_privilege then null; end;
  begin perform public.approve_access_request(gen_random_uuid()); raise exception 'FAIL anon can call approve';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- bob: spoofing is overridden
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a003","role":"authenticated"}', true);

insert into public.access_requests (user_id, status, discord_username, display_name, message, reviewed_by)
values ('00000000-0000-4000-8000-00000000a002', 'approved', 'fake', 'Fake Name', '  Hei, jeg er Bob  ',
        '00000000-0000-4000-8000-00000000a001');

do $$ declare r public.access_requests; begin
  select * into r from public.access_requests;
  if r.user_id <> '00000000-0000-4000-8000-00000000a003' then raise exception 'FAIL user_id spoofed'; end if;
  if r.status <> 'pending' then raise exception 'FAIL status spoofed: %', r.status; end if;
  if r.reviewed_by is not null then raise exception 'FAIL reviewed_by spoofed'; end if;
  -- Real Discord shape: handle from full_name (not "bob#0"), display name falls back to it.
  if r.discord_username <> 'bob' or r.display_name <> 'bob' then
    raise exception 'FAIL identity not from auth.users: % / %', r.discord_username, r.display_name; end if;
  if r.message <> 'Hei, jeg er Bob' then raise exception 'FAIL message not trimmed'; end if;
end $$;

-- ---------------------------------------------------------------- alice: own rows only, no admin powers
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}', true);

do $$ declare n int; begin
  select count(*) into n from public.access_requests;
  if n <> 0 then raise exception 'FAIL alice sees % requests of others', n; end if;

  insert into public.access_requests (message) values ('Jeg vil redigere Alice-siden');
  select count(*) into n from public.access_requests;
  if n <> 1 then raise exception 'FAIL alice sees % own requests', n; end if;
  if (select display_name from public.access_requests) <> 'Alice A' then
    raise exception 'FAIL global_name not used'; end if;

  begin insert into public.access_requests (message) values ('igjen');
    raise exception 'FAIL second pending request allowed';
  exception when unique_violation then null; end;

  begin insert into public.access_requests (message) values ('   ');
    raise exception 'FAIL blank message allowed';
  exception when check_violation then null; end;

  begin update public.access_requests set status = 'approved';
    raise exception 'FAIL alice can update her request';
  exception when insufficient_privilege then null; end;

  begin insert into public.editors (user_id) values ('00000000-0000-4000-8000-00000000a002');
    raise exception 'FAIL alice can insert into editors';
  exception when insufficient_privilege then null; end;

  begin perform public.approve_access_request((select id from public.access_requests));
    raise exception 'FAIL alice can approve';
  exception when insufficient_privilege then null; end;

  if public.is_editor() or public.is_admin() then raise exception 'FAIL alice is editor/admin'; end if;
  select count(*) into n from public.editors;
  if n <> 0 then raise exception 'FAIL alice can see % editors', n; end if;
end $$;

-- ---------------------------------------------------------------- admin: approve / deny / revoke
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);

do $$ declare n int; alice_req uuid; bob_req uuid; begin
  if not public.is_admin() then raise exception 'FAIL admin is not admin'; end if;
  select count(*) into n from public.access_requests;
  if n <> 2 then raise exception 'FAIL admin sees % requests, expected 2', n; end if;

  select id into alice_req from public.access_requests where user_id = '00000000-0000-4000-8000-00000000a002';
  select id into bob_req from public.access_requests where user_id = '00000000-0000-4000-8000-00000000a003';

  perform public.approve_access_request(alice_req);
  if (select status from public.access_requests where id = alice_req) <> 'approved' then
    raise exception 'FAIL approve did not mark request'; end if;
  if not exists (select 1 from public.editors where user_id = '00000000-0000-4000-8000-00000000a002'
                 and role = 'editor' and added_by = '00000000-0000-4000-8000-00000000a001') then
    raise exception 'FAIL approve did not add editor'; end if;

  begin perform public.approve_access_request(alice_req);
    raise exception 'FAIL request approved twice';
  exception when sqlstate 'P0002' then null; end;

  perform public.deny_access_request(bob_req);
  if (select status from public.access_requests where id = bob_req) <> 'denied' then
    raise exception 'FAIL deny did not mark request'; end if;

  begin perform public.revoke_editor('00000000-0000-4000-8000-00000000a001');
    raise exception 'FAIL admin revoked self';
  exception when sqlstate 'P0001' then null; end;
end $$;

-- ---------------------------------------------------------------- alice as editor: still no admin powers
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}', true);

do $$ declare n int; begin
  if not public.is_editor() then raise exception 'FAIL alice not editor after approval'; end if;
  if public.is_admin() then raise exception 'FAIL alice became admin'; end if;
  select count(*) into n from public.editors;
  if n <> 1 then raise exception 'FAIL editor alice sees % editor rows, expected only her own', n; end if;
  begin insert into public.access_requests (message) values ('mer tilgang');
    raise exception 'FAIL editor can send another request';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.revoke_editor('00000000-0000-4000-8000-00000000a001');
    raise exception 'FAIL editor can revoke';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- bob (denied) may ask again; revoke works
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a003","role":"authenticated"}', true);
insert into public.access_requests (message) values ('Andre forsøk');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
do $$ begin
  perform public.revoke_editor('00000000-0000-4000-8000-00000000a002');
  if exists (select 1 from public.editors where user_id = '00000000-0000-4000-8000-00000000a002') then
    raise exception 'FAIL revoke did not remove editor'; end if;
end $$;

reset role;
select 'ALL 012 ACCESS TESTS PASSED' as result;
