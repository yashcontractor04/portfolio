-- =============================================================================
-- 0003 runner system: runners, job queue, quotas, schedules, API keys, caches, bots
-- =============================================================================
-- How a run flows through the database:
--   browser --rpc--> public.enqueue_job()   quota checked + job inserted, one transaction
--   worker  ------> queue.claim_job()       SELECT ... FOR UPDATE SKIP LOCKED
--   worker  ------> queue.heartbeat() / append_log() / complete_job() / fail_job()
--   browser <-----  Supabase Realtime on public.jobs (RLS: own rows only)
-- Browsers can never INSERT or UPDATE jobs directly; only the functions can.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- runners: one row per project of type `runner`, synced from the project
-- manifests by CI (scripts/sync-runners). The manifest stays the source of truth;
-- this table gives foreign keys, per-runner limits and an admin kill switch.
-- ----------------------------------------------------------------------------
create table public.runners (
  slug            text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  enabled         boolean not null default true,
  demo_enabled    boolean not null default true,
  demo_params     jsonb not null default '{}' check (pg_column_size(demo_params) <= 16384),
  timeout_seconds int not null default 120 check (timeout_seconds between 5 and 900),
  max_attempts    smallint not null default 2 check (max_attempts between 1 and 5),
  key_provider    text check (key_provider ~ '^[a-z0-9_]{2,32}$'), -- external API this runner needs, if any
  manifest_hash   text,
  updated_at      timestamptz not null default now()
);
alter table public.runners enable row level security;
revoke all on public.runners from anon, authenticated;
create policy runners_read on public.runners for select to anon, authenticated using (true);
grant select on public.runners to anon, authenticated;

-- ----------------------------------------------------------------------------
-- user_api_keys: "bring your own key"
-- Encrypted in the Next.js server (AES-256-GCM, key in an env var) BEFORE it
-- reaches the database. The browser role cannot read the ciphertext columns at
-- all (column-level grants), and can only see provider + last 4 characters.
-- ----------------------------------------------------------------------------
create table public.user_api_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  ciphertext  bytea not null check (octet_length(ciphertext) <= 1024),
  nonce       bytea not null check (octet_length(nonce) = 12),
  key_version smallint not null default 1,          -- which encryption key was used (rotation)
  last4       text not null check (char_length(last4) <= 4),
  created_at  timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.user_api_keys enable row level security;
revoke all on public.user_api_keys from anon, authenticated;
create policy user_api_keys_select_own on public.user_api_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_api_keys_delete_own on public.user_api_keys
  for delete to authenticated using (user_id = (select auth.uid()));
grant select (id, user_id, provider, last4, created_at) on public.user_api_keys to authenticated;
grant delete on public.user_api_keys to authenticated;
-- insert/update: service_role only (the server route that encrypts).

-- ----------------------------------------------------------------------------
-- schedules: "run this daily"
-- ----------------------------------------------------------------------------
create table public.schedules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  runner_slug text not null references public.runners (slug) on update cascade on delete cascade,
  params      jsonb not null default '{}'
              check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 16384),
  cadence     text not null default 'daily' check (cadence in ('daily')),
  run_at      time not null default '06:00',
  timezone    text not null default 'Europe/Berlin',
  enabled     boolean not null default true,
  next_run_at timestamptz not null,
  last_error  text check (char_length(last_error) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index schedules_due_idx on public.schedules (next_run_at) where enabled;
create index schedules_user_idx on public.schedules (user_id);
alter table public.schedules enable row level security;
revoke all on public.schedules from anon, authenticated;
create policy schedules_select_own on public.schedules
  for select to authenticated using (user_id = (select auth.uid()));
create policy schedules_update_own on public.schedules
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy schedules_delete_own on public.schedules
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.schedules to authenticated;
grant update (enabled) on public.schedules to authenticated;   -- pause/resume only; create via RPC
create trigger schedules_updated_at before update on public.schedules
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- jobs: the queue
-- ----------------------------------------------------------------------------
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled');
create type public.job_kind   as enum ('demo', 'user', 'scheduled');

create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade,   -- null = guest demo
  runner_slug     text not null references public.runners (slug) on update cascade,
  kind            public.job_kind not null,
  status          public.job_status not null default 'queued',
  params          jsonb not null default '{}'
                  check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 16384),
  uses_own_key    boolean not null default false,
  schedule_id     uuid references public.schedules (id) on delete set null,
  priority        smallint not null default 0,
  attempts        smallint not null default 0,
  max_attempts    smallint not null,
  timeout_seconds int not null,
  run_after       timestamptz not null default now(),
  locked_by       text,
  locked_at       timestamptz,
  heartbeat_at    timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,
  error           text check (char_length(error) <= 2000),
  demo_token_hash text,               -- guests fetch their demo result with an unguessable token
  created_at      timestamptz not null default now(),
  check ((kind = 'demo') = (user_id is null))
);
-- The index the worker's claim query walks: only queued rows, already in claim order.
create index jobs_claim_idx on public.jobs (priority desc, created_at) where status = 'queued';
create index jobs_user_idx  on public.jobs (user_id, created_at desc);
create index jobs_running_idx on public.jobs (heartbeat_at) where status = 'running';

alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
create policy jobs_select_own on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));
create policy jobs_delete_own on public.jobs
  for delete to authenticated
  using (user_id = (select auth.uid()) and status not in ('queued', 'running'));
grant select, delete on public.jobs to authenticated;

create table public.job_results (
  job_id     uuid primary key references public.jobs (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete cascade,
  summary    jsonb not null default '{}',   -- headline numbers for stat tiles
  series     jsonb not null default '[]',   -- chart series
  tables     jsonb not null default '[]',   -- tabular output
  created_at timestamptz not null default now(),
  check (pg_column_size(summary) + pg_column_size(series) + pg_column_size(tables) <= 1048576)
);
create index job_results_user_idx on public.job_results (user_id, created_at desc);
alter table public.job_results enable row level security;
revoke all on public.job_results from anon, authenticated;
create policy job_results_select_own on public.job_results
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.job_results to authenticated;

create table public.job_logs (
  id      bigint generated always as identity primary key,
  job_id  uuid not null references public.jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  ts      timestamptz not null default now(),
  level   text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  message text not null check (char_length(message) <= 2000)
);
create index job_logs_job_idx on public.job_logs (job_id, id);
alter table public.job_logs enable row level security;
revoke all on public.job_logs from anon, authenticated;
create policy job_logs_select_own on public.job_logs
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.job_logs to authenticated;

-- ----------------------------------------------------------------------------
-- usage_daily: the quota counter (one row per user per UTC day)
-- ----------------------------------------------------------------------------
create table public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  runs    int not null default 0 check (runs >= 0),
  primary key (user_id, day)
);
alter table public.usage_daily enable row level security;
revoke all on public.usage_daily from anon, authenticated;
create policy usage_daily_select_own on public.usage_daily
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.usage_daily to authenticated;

-- ----------------------------------------------------------------------------
-- Enqueue: the ONLY way a user job enters the queue
-- ----------------------------------------------------------------------------
create function private.daily_limit(p_user uuid, p_has_key boolean) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select daily_run_limit from public.profiles where id = p_user),
    case when p_has_key then private.setting_int('byok_daily_runs')
         else private.setting_int('free_daily_runs') end)
$$;

create function private.enqueue_user_job(
  p_user uuid, p_runner text, p_params jsonb, p_kind public.job_kind, p_schedule uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_runner  public.runners%rowtype;
  v_has_key boolean := false;
  v_limit   int;
  v_runs    int;
  v_active  int;
  v_day     date := (now() at time zone 'utc')::date;
  v_job     uuid;
begin
  if p_params is null or jsonb_typeof(p_params) <> 'object' then
    raise exception 'invalid_params' using errcode = 'P0001';
  end if;

  select * into v_runner from public.runners where slug = p_runner and enabled;
  if not found then
    raise exception 'runner_unavailable' using errcode = 'P0001';
  end if;

  if v_runner.key_provider is not null then
    v_has_key := exists (
      select 1 from public.user_api_keys
       where user_id = p_user and provider = v_runner.key_provider);
  end if;

  v_limit := private.daily_limit(p_user, v_has_key);
  if v_limit is null or v_limit <= 0 then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  -- Atomic check-and-increment. The row lock taken here also serialises
  -- concurrent enqueues by the same user, so two tabs cannot both slip through.
  insert into public.usage_daily as u (user_id, day, runs)
  values (p_user, v_day, 1)
  on conflict (user_id, day) do update set runs = u.runs + 1 where u.runs < v_limit
  returning runs into v_runs;
  if v_runs is null then
    raise exception 'quota_exceeded' using errcode = 'P0001',
      detail = format('daily limit of %s runs reached', v_limit);
  end if;

  select count(*) into v_active from public.jobs
   where user_id = p_user and status in ('queued', 'running');
  if v_active >= private.setting_int('max_active_jobs') then
    -- raising rolls back the quota increment above
    raise exception 'too_many_active_jobs' using errcode = 'P0001';
  end if;

  insert into public.jobs (user_id, runner_slug, kind, params, uses_own_key, schedule_id,
                           max_attempts, timeout_seconds)
  values (p_user, p_runner, p_kind, p_params, v_has_key, p_schedule,
          v_runner.max_attempts, v_runner.timeout_seconds)
  returning id into v_job;
  return v_job;
end $$;

create function public.enqueue_job(p_runner text, p_params jsonb default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return private.enqueue_user_job(v_user, p_runner, p_params, 'user', null);
end $$;
grant execute on function public.enqueue_job(text, jsonb) to authenticated;

create function public.cancel_job(p_job uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs
     set status = 'cancelled', finished_at = now(), locked_by = null
   where id = p_job and user_id = (select auth.uid()) and status in ('queued', 'running');
  return found;
end $$;
grant execute on function public.cancel_job(uuid) to authenticated;

-- Today's usage for the Runs app: { used, limit, has_key }
create function public.my_quota(p_runner text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_has_key boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v_has_key := exists (
    select 1 from public.user_api_keys k join public.runners r on r.key_provider = k.provider
     where k.user_id = v_user and r.slug = p_runner);
  return jsonb_build_object(
    'used', coalesce((select runs from public.usage_daily
                       where user_id = v_user and day = (now() at time zone 'utc')::date), 0),
    'limit', private.daily_limit(v_user, v_has_key),
    'has_key', v_has_key);
end $$;
grant execute on function public.my_quota(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Schedules
-- ----------------------------------------------------------------------------
create function private.next_daily_run(p_run_at time, p_tz text, p_after timestamptz)
returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when (((p_after at time zone p_tz)::date + p_run_at) at time zone p_tz) > p_after
      then (((p_after at time zone p_tz)::date + p_run_at) at time zone p_tz)
    else (((p_after at time zone p_tz)::date + 1 + p_run_at) at time zone p_tz)
  end
$$;

create function public.create_schedule(
  p_runner text, p_params jsonb, p_run_at time default '06:00', p_timezone text default 'Europe/Berlin'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.runners where slug = p_runner and enabled) then
    raise exception 'runner_unavailable' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone' using errcode = 'P0001';
  end if;
  -- lock the user's profile row so concurrent calls cannot exceed the cap
  perform 1 from public.profiles where id = v_user for update;
  if (select count(*) from public.schedules where user_id = v_user)
       >= private.setting_int('max_schedules') then
    raise exception 'too_many_schedules' using errcode = 'P0001';
  end if;
  insert into public.schedules (user_id, runner_slug, params, run_at, timezone, next_run_at)
  values (v_user, p_runner, coalesce(p_params, '{}'), p_run_at, p_timezone,
          private.next_daily_run(p_run_at, p_timezone, now()))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_schedule(text, jsonb, time, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Worker API (schema `queue`): callable by app_worker and service_role only
-- ----------------------------------------------------------------------------

-- Claim one job. FOR UPDATE SKIP LOCKED lets many workers poll at once: each
-- locks a different row and nobody waits or double-runs a job.
create function queue.claim_job(p_worker text) returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.jobs j
     set status = 'running', locked_by = p_worker, locked_at = now(), heartbeat_at = now(),
         started_at = coalesce(j.started_at, now()), attempts = j.attempts + 1
   where j.id = (
           select id from public.jobs
            where status = 'queued' and run_after <= now()
            order by priority desc, created_at
            for update skip locked
            limit 1)
  returning j.*;
end $$;

-- Returns false when the worker no longer owns the job (cancelled or reaped):
-- the worker must then stop working on it.
create function queue.heartbeat(p_job uuid, p_worker text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set heartbeat_at = now()
   where id = p_job and locked_by = p_worker and status = 'running';
  return found;
end $$;

create function queue.append_log(p_job uuid, p_worker text, p_level text, p_message text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_logs (job_id, user_id, level, message)
  select j.id, j.user_id, p_level, left(p_message, 2000)
    from public.jobs j
   where j.id = p_job and j.locked_by = p_worker and j.status = 'running';
end $$;

create function queue.complete_job(
  p_job uuid, p_worker text, p_summary jsonb, p_series jsonb, p_tables jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  update public.jobs
     set status = 'succeeded', finished_at = now(), error = null
   where id = p_job and locked_by = p_worker and status = 'running'
  returning user_id into v_user;
  if not found then
    return false;
  end if;
  insert into public.job_results (job_id, user_id, summary, series, tables)
  values (p_job, v_user, coalesce(p_summary, '{}'), coalesce(p_series, '[]'), coalesce(p_tables, '[]'));
  return true;
end $$;

-- Retryable failures go back to the queue with exponential backoff (30s, 60s, ...).
create function queue.fail_job(p_job uuid, p_worker text, p_error text, p_retryable boolean)
returns public.job_status
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.job_status;
begin
  update public.jobs j
     set status = case when p_retryable and j.attempts < j.max_attempts
                       then 'queued'::public.job_status else 'failed'::public.job_status end,
         run_after = case when p_retryable and j.attempts < j.max_attempts
                          then now() + make_interval(secs => 30 * power(2, j.attempts - 1))
                          else j.run_after end,
         finished_at = case when p_retryable and j.attempts < j.max_attempts then null else now() end,
         error = left(p_error, 2000),
         locked_by = null, locked_at = null
   where j.id = p_job and j.locked_by = p_worker and j.status = 'running'
  returning j.status into v_status;
  return v_status;
end $$;

-- Recover jobs whose worker died (no heartbeat for 90s) or that ran past their timeout.
create function queue.reap_stale() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  with stale as (
    select id from public.jobs
     where status = 'running'
       and (heartbeat_at < now() - interval '90 seconds'
            or started_at < now() - make_interval(secs => timeout_seconds * max_attempts + 120))
     for update skip locked
  )
  update public.jobs j
     set status = case when j.attempts < j.max_attempts
                       then 'queued'::public.job_status else 'timed_out'::public.job_status end,
         finished_at = case when j.attempts < j.max_attempts then null else now() end,
         error = 'worker stopped responding',
         locked_by = null, locked_at = null
    from stale where j.id = stale.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Turn due schedules into jobs. Goes through the same quota check as manual runs.
create function queue.enqueue_due_schedules() returns int
language plpgsql security definer set search_path = '' as $$
declare
  s       record;
  v_count int := 0;
  v_err   text;
begin
  for s in
    select * from public.schedules
     where enabled and next_run_at <= now()
     order by next_run_at
     for update skip locked
     limit 50
  loop
    v_err := null;
    begin
      perform private.enqueue_user_job(s.user_id, s.runner_slug, s.params, 'scheduled', s.id);
      v_count := v_count + 1;
    exception when others then
      v_err := left(sqlerrm, 200);     -- e.g. quota_exceeded: skip today, try tomorrow
    end;
    update public.schedules
       set next_run_at = private.next_daily_run(s.run_at, s.timezone, now()), last_error = v_err
     where id = s.id;
  end loop;
  return v_count;
end $$;

-- The worker decrypts a user's API key only for a job it currently holds.
create function queue.get_job_api_key(p_job uuid, p_worker text)
returns table (ciphertext bytea, nonce bytea, key_version smallint)
language sql stable security definer set search_path = '' as $$
  select k.ciphertext, k.nonce, k.key_version
    from public.jobs j
    join public.runners r on r.slug = j.runner_slug
    join public.user_api_keys k on k.user_id = j.user_id and k.provider = r.key_provider
   where j.id = p_job and j.locked_by = p_worker and j.status = 'running' and j.uses_own_key
$$;

-- Guest demo runs: enqueued by the Next.js server (after an IP rate-limit check).
-- Fixed params from the runner row; the result is deleted within the hour.
create function queue.enqueue_demo(p_runner text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_runner public.runners%rowtype;
  v_job    uuid;
begin
  select * into v_runner from public.runners where slug = p_runner and enabled and demo_enabled;
  if not found then
    raise exception 'runner_unavailable' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('demo_enqueue'));
  if (select count(*) from public.jobs where kind = 'demo' and status in ('queued', 'running'))
       >= private.setting_int('demo_max_active') then
    raise exception 'demo_busy' using errcode = 'P0001';
  end if;
  insert into public.jobs (user_id, runner_slug, kind, params, priority, max_attempts,
                           timeout_seconds, demo_token_hash)
  values (null, p_runner, 'demo', v_runner.demo_params, -1, 1,
          least(v_runner.timeout_seconds, 60), p_token_hash)
  returning id into v_job;
  return v_job;
end $$;

create function queue.get_demo(p_job uuid, p_token_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'status', j.status, 'error', j.error,
           'summary', r.summary, 'series', r.series, 'tables', r.tables)
    from public.jobs j
    left join public.job_results r on r.job_id = j.id
   where j.id = p_job and j.kind = 'demo' and j.demo_token_hash = p_token_hash
$$;

-- Housekeeping, called by the worker every few minutes.
create function queue.purge() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.jobs where kind = 'demo' and created_at < now() - interval '1 hour';
  delete from public.jobs where status in ('succeeded', 'failed', 'timed_out', 'cancelled')
     and finished_at < now() - interval '180 days';
  delete from public.job_logs where ts < now() - interval '30 days';
  delete from private.rate_limits where window_start < now() - interval '1 day';
  delete from public.bot_heartbeats where ts < now() - interval '90 days';
  delete from public.external_cache where expires_at < now() - interval '7 days';
  delete from public.usage_daily where day < (now() at time zone 'utc')::date - 90;
end $$;

-- ----------------------------------------------------------------------------
-- Shared data cache: a ticker is fetched once and reused by every user
-- ----------------------------------------------------------------------------
create table public.price_bars (
  symbol    text not null check (symbol ~ '^[A-Z0-9.\-^=]{1,16}$'),
  day       date not null,
  open      numeric(18, 6),
  high      numeric(18, 6),
  low       numeric(18, 6),
  close     numeric(18, 6) not null,
  adj_close numeric(18, 6),
  volume    bigint,
  source    text not null,
  primary key (symbol, day)
);

-- Generic cache for anything else (flight prices later): key -> JSON with expiry.
create table public.external_cache (
  namespace  text not null check (namespace ~ '^[a-z0-9_]{2,32}$'),
  key        text not null check (char_length(key) <= 200),
  payload    jsonb not null check (pg_column_size(payload) <= 2097152),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (namespace, key)
);

alter table public.price_bars     enable row level security;
alter table public.external_cache enable row level security;
revoke all on public.price_bars, public.external_cache from anon, authenticated;
create policy price_bars_worker on public.price_bars
  for all to app_worker using (true) with check (true);
create policy external_cache_worker on public.external_cache
  for all to app_worker using (true) with check (true);
grant select, insert, update on public.price_bars to app_worker;
grant select, insert, update, delete on public.external_cache to app_worker;

-- ----------------------------------------------------------------------------
-- Bots: read-only status pages. The bot writes, the public page reads.
-- `summary` is shown publicly: it must never contain personal data or secrets.
-- ----------------------------------------------------------------------------
create table public.bot_status (
  bot_slug      text primary key check (bot_slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  state         text not null default 'unknown' check (state in ('ok', 'degraded', 'down', 'unknown')),
  last_check_at timestamptz,
  last_ok_at    timestamptz,
  summary       jsonb not null default '{}' check (pg_column_size(summary) <= 8192),
  updated_at    timestamptz not null default now()
);

create table public.bot_heartbeats (
  id         bigint generated always as identity primary key,
  bot_slug   text not null references public.bot_status (bot_slug) on delete cascade,
  ts         timestamptz not null default now(),
  ok         boolean not null,
  latency_ms int check (latency_ms >= 0)
);
create index bot_heartbeats_slug_ts_idx on public.bot_heartbeats (bot_slug, ts desc);

alter table public.bot_status     enable row level security;
alter table public.bot_heartbeats enable row level security;
revoke all on public.bot_status, public.bot_heartbeats from anon, authenticated;
create policy bot_status_read on public.bot_status for select to anon, authenticated using (true);
create policy bot_heartbeats_read on public.bot_heartbeats for select to anon, authenticated using (true);
grant select on public.bot_status, public.bot_heartbeats to anon, authenticated;

create function queue.bot_report(p_bot text, p_ok boolean, p_summary jsonb, p_latency_ms int default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bot_status as b (bot_slug, state, last_check_at, last_ok_at, summary, updated_at)
  values (p_bot, case when p_ok then 'ok' else 'down' end, now(),
          case when p_ok then now() end, coalesce(p_summary, '{}'), now())
  on conflict (bot_slug) do update
     set state = excluded.state, last_check_at = now(),
         last_ok_at = coalesce(excluded.last_ok_at, b.last_ok_at),
         summary = excluded.summary, updated_at = now();
  insert into public.bot_heartbeats (bot_slug, ok, latency_ms) values (p_bot, p_ok, p_latency_ms);
end $$;

-- Daily uptime for the status page heatmap.
create function public.bot_uptime(p_bot text, p_days int default 30)
returns table (day date, checks bigint, ok_checks bigint)
language sql stable set search_path = '' as $$
  select (ts at time zone 'utc')::date, count(*), count(*) filter (where ok)
    from public.bot_heartbeats
   where bot_slug = p_bot and ts >= now() - make_interval(days => least(greatest(p_days, 1), 90))
   group by 1 order by 1
$$;
grant execute on function public.bot_uptime(text, int) to anon, authenticated, service_role;

-- Public homepage numbers. Aggregates only; exposes no rows.
create function public.site_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'runs_7d', (select count(*) from public.jobs
                 where status = 'succeeded' and finished_at >= now() - interval '7 days'),
    'runners_live', (select count(*) from public.runners where enabled))
$$;
grant execute on function public.site_stats() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Grants for the queue schema
-- ----------------------------------------------------------------------------
revoke all on all functions in schema queue from public, anon, authenticated;
grant execute on function
  queue.claim_job(text), queue.heartbeat(uuid, text), queue.append_log(uuid, text, text, text),
  queue.complete_job(uuid, text, jsonb, jsonb, jsonb), queue.fail_job(uuid, text, text, boolean),
  queue.reap_stale(), queue.enqueue_due_schedules(), queue.get_job_api_key(uuid, text),
  queue.purge(), queue.bot_report(text, boolean, jsonb, int)
  to app_worker, service_role;
grant execute on function queue.enqueue_demo(text, text), queue.get_demo(uuid, text) to service_role;

-- Live job status in the browser (RLS applies: users only receive their own rows).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs;
  end if;
end $$;
