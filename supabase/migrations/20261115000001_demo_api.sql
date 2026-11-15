-- =============================================================================
-- 0004 demo API: let the Next.js server start and read guest demo runs
-- =============================================================================
-- The real logic lives in queue.enqueue_demo / queue.get_demo. The `queue` schema
-- is not exposed through the REST API (on purpose), so the web server reaches
-- these two functions through thin wrappers in `public`. Only service_role may
-- call them: a browser cannot.
create function public.enqueue_demo(p_runner text, p_token_hash text) returns uuid
language sql security definer set search_path = '' as $$
  select queue.enqueue_demo(p_runner, p_token_hash)
$$;

create function public.get_demo(p_job uuid, p_token_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select queue.get_demo(p_job, p_token_hash)
$$;

revoke all on function public.enqueue_demo(text, text), public.get_demo(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_demo(text, text), public.get_demo(uuid, text) to service_role;
