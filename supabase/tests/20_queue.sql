-- Runner tests: quota enforcement, job queue, API key privacy, demo runs.
begin;

select private.create_invite('alice', interval '1 day', null) as code \gset
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com',
        jsonb_build_object('invite_code', :'code'));
insert into public.runners (slug, key_provider, demo_params, max_attempts)
values ('stock-sim', 'alphavantage', '{"demo": true}', 2);
update public.app_settings set value = '100' where key = 'max_active_jobs';

-- ------------------------------------------------------------------ quota ---
select t.login('00000000-0000-0000-0000-00000000000a');
select t.throws($$insert into public.jobs (user_id, runner_slug, kind, max_attempts, timeout_seconds)
                  values (auth.uid(), 'stock-sim', 'user', 1, 10)$$,
                'permission denied', 'users cannot insert jobs directly (must use enqueue_job)');
select t.throws($$select public.enqueue_job('nope', '{}')$$, 'runner_unavailable', 'unknown runner is rejected');
select t.throws($$select public.enqueue_job('stock-sim', '[1,2]')$$, 'invalid_params', 'params must be an object');

select public.enqueue_job('stock-sim', '{"n": 1}') from generate_series(1, 5);
select t.is((public.my_quota('stock-sim') ->> 'used')::int, 5, '5 free runs are accepted');
select t.throws($$select public.enqueue_job('stock-sim', '{}')$$, 'quota_exceeded', 'the 6th run of the day is rejected');
select t.throws($$update public.usage_daily set runs = 0$$, 'permission denied', 'users cannot reset their usage');

-- bring your own key -> 25/day
select t.server();
insert into public.user_api_keys (user_id, provider, ciphertext, nonce, last4)
values ('00000000-0000-0000-0000-00000000000a', 'alphavantage', '\xdeadbeef', '\x000102030405060708090a0b', 'WXYZ');
select t.login('00000000-0000-0000-0000-00000000000a');
select t.is((public.my_quota('stock-sim') ->> 'limit')::int, 25, 'own API key raises the limit to 25');
select public.enqueue_job('stock-sim', '{}') from generate_series(1, 20);
select t.throws($$select public.enqueue_job('stock-sim', '{}')$$, 'quota_exceeded', 'the 26th run is rejected');
select t.is((select last4 from public.user_api_keys), 'WXYZ', 'user sees the last 4 characters of a key');
select t.throws($$select ciphertext from public.user_api_keys$$,
                'permission denied', 'the browser role can never read the encrypted key');
select t.throws($$select * from public.user_api_keys$$,
                'permission denied', 'select * on keys is refused');

-- too many active jobs: raising must also roll back the quota increment
select t.server();
update public.app_settings set value = '3' where key = 'max_active_jobs';
update public.usage_daily set runs = 0;
select t.login('00000000-0000-0000-0000-00000000000a');
select t.throws($$select public.enqueue_job('stock-sim', '{}')$$, 'too_many_active_jobs', 'active job cap is enforced');
select t.is((public.my_quota('stock-sim') ->> 'used')::int, 0, 'a rejected run does not consume quota');

-- ------------------------------------------------------------------ queue ---
select t.server();
delete from public.jobs;
update public.usage_daily set runs = 0;
select t.login('00000000-0000-0000-0000-00000000000a');
select public.enqueue_job('stock-sim', '{"order": 1}') as job1 \gset
select public.enqueue_job('stock-sim', '{"order": 2}') as job2 \gset

select t.server();
set local role app_worker;
select t.throws($$select * from public.jobs$$, 'permission denied', 'the worker role cannot read tables directly');
select t.throws($$select * from public.workspace_pages$$, 'permission denied', 'the worker role cannot read notes');
select id as claimed1 from queue.claim_job('w1') \gset
select id as claimed2 from queue.claim_job('w2') \gset
select t.is(:'claimed1'::uuid, :'job1'::uuid, 'oldest job is claimed first');
select t.is(:'claimed2'::uuid, :'job2'::uuid, 'second worker gets a different job');
select t.is((select count(*)::int from queue.claim_job('w3')), 0, 'empty queue returns nothing');
select t.is(queue.heartbeat(:'job1', 'w2'), false, 'a worker cannot heartbeat another worker''s job');
select t.is(queue.complete_job(:'job1', 'w2', '{}', '[]', '[]'), false, 'a worker cannot complete another worker''s job');
select t.is((select count(*)::int from queue.get_job_api_key(:'job1', 'w1')), 1, 'worker gets the key for a job it holds');
select t.is((select count(*)::int from queue.get_job_api_key(:'job1', 'w2')), 0, 'worker gets no key for someone else''s job');
select queue.append_log(:'job1', 'w1', 'info', 'starting');
select t.is(queue.complete_job(:'job1', 'w1', '{"cagr": 0.07}', '[]', '[]'), true, 'owner worker completes the job');
select t.is(queue.fail_job(:'job2', 'w2', 'api timeout', true), 'queued'::public.job_status,
            'retryable failure goes back to the queue');
select t.is((select count(*)::int from queue.claim_job('w2')), 0, 'retried job waits for its backoff');

select t.server();
update public.jobs set run_after = now() where id = :'job2';
set local role app_worker;
select id as claimed3 from queue.claim_job('w2') \gset
select t.is(queue.fail_job(:'job2', 'w2', 'api timeout', true), 'failed'::public.job_status,
            'job fails for good after max attempts');

-- reaper: a worker that stops sending heartbeats loses its job
select t.server();
select t.login('00000000-0000-0000-0000-00000000000a');
select public.enqueue_job('stock-sim', '{"order": 3}') as job3 \gset
select t.server();
select id as claimed4 from queue.claim_job('w1') \gset
update public.jobs set heartbeat_at = now() - interval '5 minutes' where id = :'job3';
select t.is(queue.reap_stale(), 1, 'stale job is reaped');
select t.is((select status from public.jobs where id = :'job3'), 'queued'::public.job_status,
            'reaped job is re-queued for another attempt');
select t.is(queue.heartbeat(:'job3', 'w1'), false, 'the dead worker is told it lost the job');

-- user sees result and logs, and can cancel
select t.login('00000000-0000-0000-0000-00000000000a');
select t.is((select (summary ->> 'cagr')::numeric from public.job_results where job_id = :'job1'),
            0.07, 'user can read their result');
select t.is((select count(*)::int from public.job_logs where job_id = :'job1'), 1, 'user can read their logs');
select t.is(public.cancel_job(:'job3'), true, 'user can cancel a queued job');

-- -------------------------------------------------------------- schedules ---
select public.create_schedule('stock-sim', '{"s": 1}', '06:00', 'Europe/Berlin') as sched \gset
select t.throws($$select public.create_schedule('stock-sim', '{}', '06:00', 'Mars/Olympus')$$,
                'invalid_timezone', 'invalid timezone is rejected');
select t.is((select next_run_at > now() from public.schedules), true, 'next run is in the future');
select t.server();
update public.schedules set next_run_at = now() - interval '1 minute';
select t.is(queue.enqueue_due_schedules(), 1, 'a due schedule creates a job');
select t.is((select count(*)::int from public.jobs where kind = 'scheduled'), 1, 'scheduled job exists');
select t.is((select next_run_at > now() from public.schedules), true, 'schedule advanced to tomorrow');
select t.is(private.next_daily_run('06:00', 'Europe/Berlin', '2026-03-28 12:00+01'),
            '2026-03-29 06:00+02'::timestamptz, 'daily schedule keeps local time across the DST change');

-- ------------------------------------------------------------------- demo ---
select queue.enqueue_demo('stock-sim', 'tokenhash') as demo \gset
select t.is((select params from public.jobs where id = :'demo'), '{"demo": true}'::jsonb,
            'demo runs always use the fixed demo params');
select t.is(queue.get_demo(:'demo', 'wrong') is null, true, 'demo result needs the right token');
select t.is(queue.get_demo(:'demo', 'tokenhash') ->> 'status', 'queued', 'demo status is readable with the token');
select t.login('00000000-0000-0000-0000-00000000000a');
select t.is((select count(*)::int from public.jobs where kind = 'demo'), 0, 'demo jobs are invisible to users');
select t.server();
update public.jobs set created_at = now() - interval '2 hours' where id = :'demo';
select queue.purge();
select t.is((select count(*)::int from public.jobs where kind = 'demo'), 0, 'demo runs are purged within the hour');

-- ------------------------------------------------------------- rate limit ---
select t.is(public.check_rate_limit('contact', 'ip-hmac', 2, 3600), true,  'rate limit: 1st hit allowed');
select t.is(public.check_rate_limit('contact', 'ip-hmac', 2, 3600), true,  'rate limit: 2nd hit allowed');
select t.is(public.check_rate_limit('contact', 'ip-hmac', 2, 3600), false, 'rate limit: 3rd hit blocked');

-- ------------------------------------------------------------------- bots ---
set local role app_worker;
select queue.bot_report('badminton-monitor', true, '{"slots_free": 2}', 340);
select t.guest();
select t.is((select state from public.bot_status), 'ok', 'guests can read bot status');
select t.throws($$update public.bot_status set state = 'down'$$, 'permission denied', 'guests cannot write bot status');

rollback;
