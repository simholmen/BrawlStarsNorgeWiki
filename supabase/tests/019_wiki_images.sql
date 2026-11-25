-- supabase/tests/019_wiki_images.sql
--
-- Tests for 019_wiki_images.sql: only editors may upload to the wiki-images bucket, only at
-- well-formed names, and nobody may overwrite or delete. Run with tools/run_sql_test.sh (always
-- BEGIN ... ROLLBACK). First failure aborts with 'FAIL ...'.

-- ---------------------------------------------------------------- fixtures (as postgres)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-img-editor@example.invalid', '{"full_name":"imgeddie"}', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'test-img-plain@example.invalid', '{"full_name":"imgplain"}', '{}', now(), now());

insert into public.editors (user_id, role, display_name)
values ('00000000-0000-4000-8000-00000000c001', 'editor', 'Img Editor');

do $$ begin
  if not exists (select 1 from storage.buckets where id = 'wiki-images' and public
                   and file_size_limit = 5242880
                   and not ('image/svg+xml' = any (allowed_mime_types))) then
    raise exception 'FAIL bucket missing or misconfigured'; end if;
end $$;

-- ---------------------------------------------------------------- anon: no uploads
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('wiki-images', '2026-11/anontest1.png');
    raise exception 'FAIL anon can upload';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- plain logged-in user: no uploads
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000c002","role":"authenticated"}', true);
do $$ begin
  begin insert into storage.objects (bucket_id, name, owner_id)
          values ('wiki-images', '2026-11/plaintest1.png', '00000000-0000-4000-8000-00000000c002');
    raise exception 'FAIL plain user can upload';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- editor
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}', true);
do $$ declare n int; begin
  insert into storage.objects (bucket_id, name, owner_id)
  values ('wiki-images', '2026-11/editortest1.png', '00000000-0000-4000-8000-00000000c001');

  -- bad names
  begin insert into storage.objects (bucket_id, name, owner_id)
          values ('wiki-images', 'anywhere/evil.html', '00000000-0000-4000-8000-00000000c001');
    raise exception 'FAIL editor can upload at arbitrary name';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name, owner_id)
          values ('wiki-images', '2026-11/editortest2.svg', '00000000-0000-4000-8000-00000000c001');
    raise exception 'FAIL editor can upload .svg';
  exception when insufficient_privilege then null; end;

  -- other buckets are not opened up
  begin insert into storage.objects (bucket_id, name, owner_id)
          values ('some-other-bucket', '2026-11/editortest3.png', '00000000-0000-4000-8000-00000000c001');
    raise exception 'FAIL editor can upload to another bucket';
  exception when insufficient_privilege or foreign_key_violation then null; end;

  -- no overwrite, no delete
  update storage.objects set name = '2026-11/editortest9.png'
   where bucket_id = 'wiki-images' and name = '2026-11/editortest1.png';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL editor can update objects'; end if;
  -- (Storage's own protect_delete trigger may refuse direct deletes before RLS is even asked.)
  begin
    delete from storage.objects where bucket_id = 'wiki-images' and name = '2026-11/editortest1.png';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL editor can delete objects'; end if;
  exception when insufficient_privilege then null; end;
end $$;

select 'ok 019_wiki_images' as result;
