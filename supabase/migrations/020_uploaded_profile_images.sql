-- supabase/migrations/020_uploaded_profile_images.sql
--
-- Infobox portraits and Brawl Stars profile screenshots can be uploaded from the editor (into the
-- wiki-images bucket from 019) instead of only being files in docs/images:
--
--   portrait_url   text, null = use the old file (/images/profilbilde/<image_key>.<image_ext>,
--                  clubs: /images/klubber/klubb_profilbilde/...).
--   profile_urls   jsonb object {"<year>": "<url>"}, e.g. {"2026": "https://..."}. A year here
--                  replaces that year's old file (or adds a new year). Empty = only old files.
--
-- Both only accept URLs of files in the wiki-images bucket (same name rule as 019's storage
-- policy), so a page can't be pointed at an image on some other site. Changes are recorded in
-- revisions by the existing trigger like every other column, so they can be reverted.
--
-- SAFETY / RE-RUNNABILITY: add column if not exists, create or replace, constraints added only
-- when missing.
-- HOW TO APPLY: npx supabase db push --remote

alter table public.people add column if not exists portrait_url text;
alter table public.clubs add column if not exists portrait_url text;
alter table public.people add column if not exists profile_urls jsonb not null default '{}'::jsonb;
alter table public.clubs add column if not exists profile_urls jsonb not null default '{}'::jsonb;

-- Same rule as web/lib/uploads.ts WIKI_IMAGE_URL_RE.
create or replace function public.valid_wiki_image_url(url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/wiki-images/[0-9]{4}-[0-9]{2}/[a-z0-9-]{8,64}\.(jpg|png|webp|gif)$';
$$;

-- {"<year>": "<url>"}: max 20 years, each year 2018..2099.
create or replace function public.valid_profile_urls(urls jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(urls) = 'object'
     and (select count(*) from jsonb_object_keys(urls)) <= 20
     and not exists (
       select 1 from jsonb_each(urls) e
        where e.key !~ '^20[0-9]{2}$'
           or e.key::int < 2018
           or jsonb_typeof(e.value) <> 'string'
           or not public.valid_wiki_image_url(e.value #>> '{}')
     );
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'people_uploaded_images_valid') then
    alter table public.people add constraint people_uploaded_images_valid check (
      (portrait_url is null or public.valid_wiki_image_url(portrait_url))
      and public.valid_profile_urls(profile_urls)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clubs_uploaded_images_valid') then
    alter table public.clubs add constraint clubs_uploaded_images_valid check (
      (portrait_url is null or public.valid_wiki_image_url(portrait_url))
      and public.valid_profile_urls(profile_urls)
    );
  end if;
end $$;
