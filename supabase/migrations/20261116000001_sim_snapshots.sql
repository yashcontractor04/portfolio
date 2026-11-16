-- Stock simulator: public daily snapshot for the dashboard.
--
-- The simulator is a separate project (github.com/yashcontractor04/stock-simulator)
-- with its own Postgres on the VM. Once a day it sends ONE small JSON document here:
-- the three model portfolios with performance, allocation and outlook. The website
-- reads it from this table, so a visitor never causes work on the VM.
--
-- The JSON shape is `Snapshot` in the simulator's docs/openapi.yaml (schema_version 1).
--
-- Who may do what:
--   anon, authenticated  read only
--   sim_publisher        may call sim.publish_snapshot() and nothing else
--   nobody               inserts, updates or deletes rows directly

-- ----------------------------------------------------------------------------
-- price_bars is no longer needed
-- ----------------------------------------------------------------------------
-- It was meant as the price cache for a stock simulator running inside the
-- portfolio worker. Prices now live in the simulator's own database (about 25
-- million rows would never fit the 500 MB limit here). The table was never
-- written to. Dropping it also removes the only table the worker role could
-- write to directly.
drop table if exists public.price_bars;

-- ----------------------------------------------------------------------------
-- Role for the simulator
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sim_publisher') then
    create role sim_publisher nologin noinherit;
  end if;
end $$;

create schema sim;
revoke all on schema sim from public;
grant usage on schema sim to sim_publisher, service_role;

-- ----------------------------------------------------------------------------
-- Table: one row per trading day, the newest row is what the site shows
-- ----------------------------------------------------------------------------
create table public.sim_snapshots (
  as_of          date primary key,
  schema_version int not null check (schema_version between 1 and 99),
  payload        jsonb not null check (
    jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 262144
  ),
  published_at   timestamptz not null default now()
);

alter table public.sim_snapshots enable row level security;
revoke all on public.sim_snapshots from anon, authenticated;
grant select on public.sim_snapshots to anon, authenticated;
create policy sim_snapshots_read on public.sim_snapshots
  for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
-- The only way in: sim.publish_snapshot(payload)
-- ----------------------------------------------------------------------------
-- Checks the outline of the document (not every field: the website validates the
-- full shape again before showing it), stores it under its `as_of` day and keeps
-- only the newest 30 days. Publishing the same day twice replaces that day, so
-- the simulator's job is safe to run again.
create function sim.publish_snapshot(p_payload jsonb) returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_as_of   date;
  v_version int;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_snapshot: payload must be a JSON object';
  end if;
  if pg_column_size(p_payload) > 262144 then
    raise exception 'invalid_snapshot: payload is larger than 256 KB';
  end if;
  if jsonb_typeof(p_payload -> 'schema_version') is distinct from 'number'
     or jsonb_typeof(p_payload -> 'as_of') is distinct from 'string'
     or jsonb_typeof(p_payload -> 'portfolios') is distinct from 'array' then
    raise exception 'invalid_snapshot: schema_version, as_of and portfolios are required';
  end if;
  if jsonb_array_length(p_payload -> 'portfolios') <> 3 then
    raise exception 'invalid_snapshot: exactly 3 portfolios are required';
  end if;

  v_version := (p_payload ->> 'schema_version')::int;
  begin
    v_as_of := (p_payload ->> 'as_of')::date;
  exception when others then
    raise exception 'invalid_snapshot: as_of is not a date';
  end;
  if v_as_of > (now() at time zone 'utc')::date + 1 or v_as_of < date '2026-01-01' then
    raise exception 'invalid_snapshot: as_of is out of range';
  end if;

  insert into public.sim_snapshots (as_of, schema_version, payload)
  values (v_as_of, v_version, p_payload)
  on conflict (as_of) do update
    set schema_version = excluded.schema_version,
        payload        = excluded.payload,
        published_at   = now();

  delete from public.sim_snapshots s
   where s.as_of not in (select k.as_of from public.sim_snapshots k order by k.as_of desc limit 30);

  return v_as_of;
end $$;

revoke all on function sim.publish_snapshot(jsonb) from public, anon, authenticated;
grant execute on function sim.publish_snapshot(jsonb) to sim_publisher, service_role;
