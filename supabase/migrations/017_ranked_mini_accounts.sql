-- supabase/migrations/017_ranked_mini_accounts.sql
--
-- Mini accounts: a ranked profile can belong to another ("main") profile.
--
--   - main_tag null  = a normal (main) profile, listed on the ranked page under its own name.
--   - main_tag set   = a mini of that main. Still ingested like any active profile, but the ranked
--                      page doesn't list it on its own: it's an account filter on the main's page
--                      (stats summed over the accounts picked), and wiki pages list it in the
--                      infobox as "Mini-kontoer".
--   - One level only: a mini can't have minis, and a profile that has minis can't become one.
--     Enforced by a trigger (with Norwegian messages the site shows as-is, errcode P0001).
--
-- SAFETY / RE-RUNNABILITY: if-not-exists / create-or-replace / drop-then-create.
-- HOW TO APPLY: npx supabase db push --remote

alter table public.ranked_profiles
  add column if not exists main_tag text references public.ranked_profiles (tag) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ranked_profiles_not_own_main') then
    alter table public.ranked_profiles
      add constraint ranked_profiles_not_own_main check (main_tag is null or main_tag <> tag);
  end if;
end $$;

create index if not exists ranked_profiles_main_tag_idx on public.ranked_profiles (main_tag);

create or replace function public.ranked_profiles_check_main()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.main_tag is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.main_tag is not distinct from old.main_tag then
    return new;
  end if;
  if not exists (select 1 from public.ranked_profiles m where m.tag = new.main_tag and m.main_tag is null) then
    raise exception 'Hovedkontoen finnes ikke, eller er selv en mini-konto.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ranked_profiles c where c.main_tag = new.tag) then
    raise exception 'Denne kontoen har egne mini-kontoer og kan ikke bli en mini-konto.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ranked_profiles_check_main on public.ranked_profiles;
create trigger ranked_profiles_check_main
  before insert or update on public.ranked_profiles
  for each row execute function public.ranked_profiles_check_main();
