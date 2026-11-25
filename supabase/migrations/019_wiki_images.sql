-- supabase/migrations/019_wiki_images.sql
--
-- Images in page text: editors upload pictures from the Markdown editor into a public Storage
-- bucket, and the page text links to them with ![alt](https://<project>.supabase.co/storage/v1/
-- object/public/wiki-images/<yyyy-mm>/<random>.<ext>).
--
--   - Public bucket: anyone can view the files (they're on public pages), no select policy needed.
--   - Only editors (public.is_editor()) may upload; the name must be <yyyy-mm>/<lowercase id>.<ext>
--     with an image extension, so nobody can put files at arbitrary paths.
--   - Nobody may overwrite or delete through the API (no update/delete policies): a file a page
--     once linked to stays, so reverting a page from its history never shows a broken image.
--     Cleaning up is done by hand in the Supabase dashboard.
--   - The bucket enforces the size limit (5 MB) and the allowed types (no SVG: it can carry script).
--
-- SAFETY / RE-RUNNABILITY: insert ... on conflict do update, drop policy if exists.
-- HOW TO APPLY: npx supabase db push --remote

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wiki-images', 'wiki-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wiki_images_editor_insert" on storage.objects;
create policy "wiki_images_editor_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'wiki-images'
    and public.is_editor()
    and name ~ '^[0-9]{4}-[0-9]{2}/[a-z0-9-]{8,64}\.(jpg|png|webp|gif)$'
  );
