-- supabase/migrations/012_editors_access_requests.sql
--
-- Wiki migration (Phase 3) — editor whitelist and "request edit access".
-- Plan: notes/claude-specs/plans/wiki-phase3-auth.md (local notes).
--
-- MODEL:
--   - Anyone can log in (Supabase Auth). Logging in grants nothing.
--   - `editors` is the whitelist. Rows only get there through approve_access_request() (run by an
--     admin) or a manual insert with the service role (used once, to seed the owner as admin).
--   - `access_requests`: a logged-in non-editor sends one pending request with a message. The
--     database fills in who they are (Discord name/avatar from auth.users), so the browser can't
--     claim to be someone else.
--   - All checks live here (RLS + security definer functions that check is_admin() themselves).
--     The web app uses only the publishable key + the user's own session.
--
-- SAFETY / RE-RUNNABILITY:
--   create-if-not-exists, create-or-replace, drop-then-create for policies/triggers.
--
-- HOW TO APPLY:
--   npx supabase db push --remote   (after 001-011)

-- =========================================================================================
-- === editors ===
-- =========================================================================================

create table if not exists public.editors (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  role          text not null default 'editor' check (role in ('editor', 'admin')),
  display_name  text,                       -- snapshot for the admin list
  added_at      timestamptz not null default now(),
  added_by      uuid references auth.users (id) on delete set null
);

alter table public.editors enable row level security;

-- =========================================================================================
-- === helpers (used by RLS here and by Phase 4's write policies) ===
-- =========================================================================================

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.editors e where e.user_id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.editors e where e.user_id = auth.uid() and e.role = 'admin');
$$;

-- Postgres grants EXECUTE to PUBLIC by default; be explicit.
revoke all on function public.is_editor() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_editor() to authenticated;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "editors_select" on public.editors;
create policy "editors_select"
  on public.editors
  for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.editors from anon, authenticated;
grant select on public.editors to authenticated;
grant all on public.editors to service_role;

-- =========================================================================================
-- === access_requests ===
-- =========================================================================================

create table if not exists public.access_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  discord_username  text,
  display_name      text,
  avatar_url        text,
  message           text not null check (char_length(btrim(message)) between 1 and 500),
  status            text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users (id) on delete set null
);

-- At most one open request per person.
create unique index if not exists access_requests_one_pending
  on public.access_requests (user_id)
  where status = 'pending';

create index if not exists access_requests_status_created
  on public.access_requests (status, created_at desc);

alter table public.access_requests enable row level security;

-- Whatever the browser sends, a new request belongs to the caller, starts pending and carries the
-- caller's identity as Supabase Auth knows it.
create or replace function public.access_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb;
begin
  if auth.uid() is null then
    raise exception 'Du må være logget inn.' using errcode = '42501';
  end if;
  if exists (select 1 from public.editors e where e.user_id = auth.uid()) then
    raise exception 'Du har allerede redigeringstilgang.' using errcode = 'P0001';
  end if;

  select u.raw_user_meta_data into meta from auth.users u where u.id = auth.uid();

  new.id          := gen_random_uuid();
  new.user_id     := auth.uid();
  new.status      := 'pending';
  new.created_at  := now();
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.message     := btrim(new.message);
  -- Supabase's Discord provider: user_name/name = handle, full_name / custom_claims.global_name =
  -- display name, avatar_url = CDN URL. Fall back gracefully if the shape differs.
  new.discord_username := coalesce(meta->>'user_name', meta->>'preferred_username', meta->>'name');
  new.display_name     := coalesce(meta->'custom_claims'->>'global_name', meta->>'full_name',
                                   meta->>'name', new.discord_username);
  new.avatar_url       := meta->>'avatar_url';
  return new;
end;
$$;

revoke all on function public.access_requests_before_insert() from public, anon, authenticated;

drop trigger if exists access_requests_before_insert on public.access_requests;
create trigger access_requests_before_insert
  before insert on public.access_requests
  for each row execute function public.access_requests_before_insert();

drop policy if exists "access_requests_insert_own" on public.access_requests;
create policy "access_requests_insert_own"
  on public.access_requests
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "access_requests_select" on public.access_requests;
create policy "access_requests_select"
  on public.access_requests
  for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.access_requests from anon, authenticated;
grant select, insert on public.access_requests to authenticated;
grant all on public.access_requests to service_role;

-- =========================================================================================
-- === admin actions (the only way to change editors / request status from the app) ===
-- =========================================================================================

create or replace function public.approve_access_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.access_requests;
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan gjøre dette.' using errcode = '42501';
  end if;

  select * into req from public.access_requests r where r.id = request_id for update;
  if not found or req.status <> 'pending' then
    raise exception 'Forespørselen finnes ikke eller er allerede behandlet.' using errcode = 'P0002';
  end if;

  insert into public.editors (user_id, role, display_name, added_by)
  values (req.user_id, 'editor', coalesce(req.display_name, req.discord_username), auth.uid())
  on conflict (user_id) do nothing;

  update public.access_requests
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
   where id = request_id;
end;
$$;

create or replace function public.deny_access_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan gjøre dette.' using errcode = '42501';
  end if;

  update public.access_requests
     set status = 'denied', reviewed_at = now(), reviewed_by = auth.uid()
   where id = request_id and status = 'pending';
  if not found then
    raise exception 'Forespørselen finnes ikke eller er allerede behandlet.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.revoke_editor(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan gjøre dette.' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'Du kan ikke fjerne din egen tilgang.' using errcode = 'P0001';
  end if;

  select e.role into target_role from public.editors e where e.user_id = target for update;
  if not found then
    raise exception 'Personen er ikke redaktør.' using errcode = 'P0002';
  end if;
  if target_role = 'admin'
     and (select count(*) from public.editors e where e.role = 'admin') <= 1 then
    raise exception 'Kan ikke fjerne den siste administratoren.' using errcode = 'P0001';
  end if;

  delete from public.editors where user_id = target;
end;
$$;

revoke all on function public.approve_access_request(uuid) from public, anon;
revoke all on function public.deny_access_request(uuid) from public, anon;
revoke all on function public.revoke_editor(uuid) from public, anon;
grant execute on function public.approve_access_request(uuid) to authenticated;
grant execute on function public.deny_access_request(uuid) to authenticated;
grant execute on function public.revoke_editor(uuid) to authenticated;
