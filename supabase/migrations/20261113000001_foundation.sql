-- =============================================================================
-- 0001 foundation: schemas, secure defaults, profiles, invites, rate limits
-- =============================================================================
-- Security model in one paragraph:
--   * Every table in `public` has row-level security (RLS) ON.
--   * Browser clients use the roles `anon` (guest) and `authenticated` (logged in).
--     They get NOTHING by default; each table grants the minimum explicitly.
--   * `service_role` (Next.js server only) bypasses RLS. Never ship it to a browser.
--   * `app_worker` (Python worker) is a least-privilege role: it can only call
--     functions in the `queue` schema and touch the market-data cache.
--   * `private` holds helpers that no API role can call directly.
-- =============================================================================

create schema if not exists private;
create schema if not exists queue;

revoke all on schema private from public, anon, authenticated;
revoke all on schema queue   from public, anon, authenticated;

-- Least-privilege role for the Python worker. Created without login; you enable
-- login and set the password by hand (see docs/ARCHITECTURE.md, "Worker role").
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_worker') then
    create role app_worker nologin noinherit;
  end if;
end $$;

grant usage on schema queue to service_role, app_worker;
grant usage on schema public to app_worker;

-- Secure by default: new tables/functions created by migrations are NOT
-- automatically reachable from the browser. (Supabase's default is the opposite.)
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Per-user row cap, used as: ... execute function private.enforce_row_cap('2000')
-- Protects the 500 MB free database from a single abusive account.
create function private.enforce_row_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max   int := tg_argv[0]::int;
  v_count int;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into v_count using new.user_id;
  if v_count >= v_max then
    raise exception 'row_cap_exceeded' using errcode = 'P0001',
      detail = format('%s allows at most %s rows per user', tg_table_name, v_max);
  end if;
  return new;
end $$;

create function private.sha256_hex(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

-- -----------------------------------------------------------------------------
-- app_settings: tunable limits (admin panel edits these; server-only)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value) values
  ('free_daily_runs',  '5'),
  ('byok_daily_runs',  '25'),
  ('max_active_jobs',  '3'),
  ('max_schedules',    '3'),
  ('demo_max_active',  '10');

create function private.setting_int(p_key text) returns int
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::int from public.app_settings where key = p_key
$$;

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user
-- -----------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text check (char_length(display_name) <= 80),
  locale          text not null default 'en' check (locale in ('en', 'de')),
  role            text not null default 'user' check (role in ('user', 'admin')),
  daily_run_limit int check (daily_run_limit between 0 and 1000), -- admin override, null = default
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.profiles to authenticated;
-- Column-level grant: users can never change their own role or quota.
grant update (display_name, locale) on public.profiles to authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  )
$$;
grant execute on function public.is_admin() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- invites: signup requires a valid, unused, unexpired code
-- Only the SHA-256 hash of a code is stored, so a database leak leaks no codes.
-- -----------------------------------------------------------------------------
create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  code_hash  text not null unique,
  note       text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by    uuid references auth.users (id) on delete set null,
  used_at    timestamptz            -- "used" marker; survives deletion of the user
);
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;   -- no policies: server-only

-- Returns the plaintext code exactly once. Bootstrap (first admin) from the SQL
-- editor: select private.create_invite('bootstrap', interval '1 day', null);
create function private.create_invite(p_note text, p_valid_for interval, p_created_by uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)); -- 80 random bits
begin
  insert into public.invites (code_hash, note, created_by, expires_at)
  values (private.sha256_hex(v_code), p_note, p_created_by, now() + p_valid_for);
  return v_code;
end $$;

create function public.create_invite(p_note text default null, p_valid_days int default 14)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_valid_days not between 1 and 90 then
    raise exception 'invalid_validity';
  end if;
  return private.create_invite(p_note, make_interval(days => p_valid_days), (select auth.uid()));
end $$;
grant execute on function public.create_invite(text, int) to authenticated;

-- Signup gate, enforced inside the database so no client or API path can skip it.
-- The client passes the code as sign-up metadata: options.data.invite_code
-- BEFORE INSERT: claim the invite atomically and strip the code from metadata.
create function private.claim_invite_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code   text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_invite uuid;
begin
  if v_code = '' then
    raise exception 'invite_required' using errcode = 'P0001';
  end if;
  update public.invites
     set used_at = now()
   where code_hash = private.sha256_hex(v_code)
     and used_at is null
     and (expires_at is null or expires_at > now())
  returning id into v_invite;
  if v_invite is null then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  new.raw_user_meta_data :=
    (new.raw_user_meta_data - 'invite_code') || jsonb_build_object('invite_id', v_invite);
  return new;
end $$;

-- AFTER INSERT: create the profile and link the invite to the new user.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, locale)
  values (new.id, case when new.raw_user_meta_data ->> 'locale' = 'de' then 'de' else 'en' end);
  update public.invites set used_by = new.id
   where id = (new.raw_user_meta_data ->> 'invite_id')::uuid;
  return new;
end $$;

create trigger on_auth_user_claim_invite before insert on auth.users
  for each row execute function private.claim_invite_on_signup();
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- rate_limits: fixed-window counters in Postgres (no Redis needed)
-- The Next.js server calls check_rate_limit() before auth/contact/demo actions.
-- p_key must already be an HMAC of the IP (never store raw IPs: GDPR).
-- -----------------------------------------------------------------------------
create table private.rate_limits (
  bucket       text not null,
  key_hash     text not null,
  window_start timestamptz not null,
  hits         int not null default 1,
  primary key (bucket, key_hash, window_start)
);

create function public.check_rate_limit(p_bucket text, p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into private.rate_limits (bucket, key_hash, window_start)
  values (p_bucket, private.sha256_hex(p_key), v_window)
  on conflict (bucket, key_hash, window_start)
  do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;
grant execute on function public.check_rate_limit(text, text, int, int) to service_role;

-- -----------------------------------------------------------------------------
-- audit_log: admin actions (invite created, quota changed, user deleted ...)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users (id) on delete set null,
  action     text not null check (char_length(action) <= 80),
  target     text check (char_length(target) <= 200),
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;  -- no policies: server-only
