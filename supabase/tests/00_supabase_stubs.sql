-- Minimal stand-in for what Supabase provides, so migrations and tests can run on
-- a plain Postgres (locally and in CI). NOT applied to the real project.
-- Roles are shared by the whole server, so only create them once (re-runnable).
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'supabase_auth_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}',
  created_at         timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to public;

-- Reproduce Supabase's permissive defaults. The migrations must lock these down.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Test helpers ---------------------------------------------------------------
create schema t;
grant usage on schema t to public;

-- Become a logged-in user / a guest / the server for the rest of the transaction.
create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end $$;
create function t.guest() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;
create function t.server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'reset role';
end $$;

-- Assert that a statement fails with an error containing p_expect.
create function t.throws(p_sql text, p_expect text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expect in sqlerrm) > 0 then
      raise notice 'ok   - %', p_label;
      return;
    end if;
    raise exception 'FAIL - %: expected error containing "%", got "%"', p_label, p_expect, sqlerrm;
  end;
  raise exception 'FAIL - %: statement succeeded but should have failed', p_label;
end $$;

create function t.is(p_got anyelement, p_want anyelement, p_label text) returns void
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL - %: got %, want %', p_label, p_got, p_want;
  end if;
  raise notice 'ok   - %', p_label;
end $$;
grant execute on all functions in schema t to public;
