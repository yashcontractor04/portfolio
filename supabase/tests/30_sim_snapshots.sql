-- Simulator snapshot tests: public read, single write path, least-privilege role.
begin;

create temp table snap as select jsonb_build_object(
  'schema_version', 1,
  'as_of', '2026-11-13',
  'portfolios', jsonb_build_array(
    jsonb_build_object('risk_level', 'low'),
    jsonb_build_object('risk_level', 'medium'),
    jsonb_build_object('risk_level', 'high'))) as doc;
grant select on snap to public;

-- ------------------------------------------------------------- price_bars ---
select t.is(to_regclass('public.price_bars') is null, true, 'price_bars is gone');

-- --------------------------------------------------------------- publisher ---
set local role sim_publisher;
select t.is(sim.publish_snapshot((select doc from snap)), date '2026-11-13', 'the simulator can publish a snapshot');
select t.throws($$insert into public.sim_snapshots (as_of, schema_version, payload) values ('2026-11-12', 1, '{}')$$,
                'permission denied', 'the simulator cannot insert rows directly');
select t.throws($$delete from public.sim_snapshots$$, 'permission denied', 'the simulator cannot delete rows');
select t.throws($$select * from public.sim_snapshots$$, 'permission denied', 'the simulator cannot even read the table');
select t.throws($$select * from public.profiles$$, 'permission denied', 'the simulator cannot read user data');
select t.throws($$select * from public.jobs$$, 'permission denied', 'the simulator cannot read the job queue');

select t.throws($$select sim.publish_snapshot('[1,2]')$$, 'invalid_snapshot', 'payload must be an object');
select t.throws($$select sim.publish_snapshot('{"schema_version":1,"as_of":"2026-11-13"}')$$,
                'invalid_snapshot', 'portfolios are required');
select t.throws($$select sim.publish_snapshot('{"schema_version":1,"as_of":"2026-11-13","portfolios":[{}]}')$$,
                'exactly 3 portfolios', 'exactly three portfolios are required');
select t.throws($$select sim.publish_snapshot('{"schema_version":1,"as_of":"soon","portfolios":[{},{},{}]}')$$,
                'not a date', 'as_of must be a date');
select t.throws($$select sim.publish_snapshot('{"schema_version":1,"as_of":"2099-01-01","portfolios":[{},{},{}]}')$$,
                'out of range', 'a date in the future is rejected');
select t.throws(format($$select sim.publish_snapshot('{"schema_version":1,"as_of":"2026-11-13","portfolios":[{},{},{}],"big":"%s"}')$$,
                       (select string_agg(md5(i::text), '') from generate_series(1, 12000) i)),
                'larger than 256 KB', 'an oversized payload is rejected');

-- publishing the same day again replaces it (safe to re-run)
select sim.publish_snapshot((select doc || '{"notes":["second run"]}' from snap));
reset role;
select t.is((select count(*)::int from public.sim_snapshots), 1, 'the same day is stored once');
select t.is((select payload -> 'notes' ->> 0 from public.sim_snapshots), 'second run', 'the newer document wins');

-- only the newest 30 days are kept
select sim.publish_snapshot((select doc from snap) || jsonb_build_object('as_of', (date '2026-06-01' + d)::text))
  from generate_series(0, 39) d;
select t.is((select count(*)::int from public.sim_snapshots), 30, 'only 30 days are kept');
select t.is((select max(as_of) from public.sim_snapshots), date '2026-11-13', 'the newest day survives the clean-up');

-- ------------------------------------------------------------------ guests ---
select t.guest();
select t.is((select (payload ->> 'schema_version')::int from public.sim_snapshots order by as_of desc limit 1),
            1, 'guests can read the latest snapshot');
select t.throws($$insert into public.sim_snapshots (as_of, schema_version, payload) values ('2026-11-14', 1, '{}')$$,
                'permission denied', 'guests cannot insert');
select t.throws($$update public.sim_snapshots set payload = '{}'$$, 'permission denied', 'guests cannot update');
select t.throws($$delete from public.sim_snapshots$$, 'permission denied', 'guests cannot delete');
select t.throws($$select sim.publish_snapshot('{}')$$, 'permission denied', 'guests cannot publish');

-- ----------------------------------------------------------- logged-in user ---
select t.server();
select private.create_invite('sim', interval '1 day', null) as code \gset
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000c1', 'sim@example.com', jsonb_build_object('invite_code', :'code'));
select t.login('00000000-0000-0000-0000-0000000000c1');
select t.is((select count(*)::int from public.sim_snapshots), 30, 'logged-in users can read');
select t.throws($$select sim.publish_snapshot('{}')$$, 'permission denied', 'logged-in users cannot publish');
select t.throws($$delete from public.sim_snapshots$$, 'permission denied', 'logged-in users cannot delete');

-- ------------------------------------------------------------------ worker ---
select t.server();
set local role app_worker;
select t.throws($$select sim.publish_snapshot('{}')$$, 'permission denied', 'the portfolio worker cannot publish');

rollback;
