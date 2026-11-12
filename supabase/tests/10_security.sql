-- Security tests: invite-only signup, row-level security, privilege lockdown.
-- Everything runs in one transaction and is rolled back.
begin;

-- ---------------------------------------------------------------- invites ---
select t.throws($$insert into auth.users (email) values ('nocode@example.com')$$,
                'invite_required', 'signup without a code is rejected');
select t.throws($$insert into auth.users (email, raw_user_meta_data)
                  values ('bad@example.com', '{"invite_code":"WRONGCODE"}')$$,
                'invite_invalid', 'signup with an unknown code is rejected');

create temp table codes as
  select private.create_invite('alice', interval '1 day', null) as alice,
         private.create_invite('bob',   interval '1 day', null) as bob,
         private.create_invite('old',   interval '-1 day', null) as expired;
grant select on codes to public;

insert into auth.users (id, email, raw_user_meta_data)
select '00000000-0000-0000-0000-00000000000a', 'alice@example.com',
       jsonb_build_object('invite_code', lower(alice), 'locale', 'de') from codes;
insert into auth.users (id, email, raw_user_meta_data)
select '00000000-0000-0000-0000-00000000000b', 'bob@example.com',
       jsonb_build_object('invite_code', bob) from codes;

select t.is((select count(*)::int from public.profiles), 2, 'valid codes create users with profiles');
select t.is((select locale from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
            'de', 'locale is taken from signup metadata');
select t.is((select raw_user_meta_data ? 'invite_code' from auth.users
              where id = '00000000-0000-0000-0000-00000000000a'),
            false, 'invite code is stripped from user metadata');
select t.is((select count(*)::int from public.invites where code_hash = (select alice from codes)),
            0, 'codes are stored hashed, never in plaintext');
select t.throws(format($$insert into auth.users (email, raw_user_meta_data)
                         values ('again@example.com', '{"invite_code":"%s"}')$$, (select alice from codes)),
                'invite_invalid', 'a code cannot be used twice');
select t.throws(format($$insert into auth.users (email, raw_user_meta_data)
                         values ('late@example.com', '{"invite_code":"%s"}')$$, (select expired from codes)),
                'invite_invalid', 'an expired code is rejected');

-- ------------------------------------------------- every table has RLS on ---
select t.is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'every table in public has row-level security enabled');

-- anon may read only the deliberately public tables
select t.is(
  (select coalesce(string_agg(distinct table_name, ',' order by table_name), '')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  'bot_heartbeats,bot_status,runners', 'guests can only reach the three public tables');
select t.is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and privilege_type <> 'SELECT'),
  0, 'guests have no write privilege anywhere');

-- ------------------------------------------------------------ RLS: alice ---
select t.login('00000000-0000-0000-0000-00000000000a');
insert into public.workspace_pages (id, title, content)
values ('10000000-0000-0000-0000-000000000001', 'Alice private note', '[]');
insert into public.boards (id, name) values ('20000000-0000-0000-0000-000000000001', 'Alice board');
insert into public.board_columns (id, board_id, name, position)
values ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'To do', 'a0');
insert into public.board_cards (id, board_id, column_id, title, position)
values ('22000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        '21000000-0000-0000-0000-000000000001', 'Alice card', 'a0');
insert into public.habits (id, name) values ('30000000-0000-0000-0000-000000000001', 'Read');
insert into public.habit_checkins (habit_id, day) values ('30000000-0000-0000-0000-000000000001', current_date);
select t.throws($$insert into public.habit_checkins (habit_id, day)
                  values ('30000000-0000-0000-0000-000000000001', current_date)$$,
                'duplicate key', 'a habit cannot be checked in twice on one day');
select t.throws($$update public.profiles set role = 'admin' where id = auth.uid()$$,
                'permission denied', 'a user cannot make themselves admin');
select t.throws($$update public.profiles set daily_run_limit = 999 where id = auth.uid()$$,
                'permission denied', 'a user cannot raise their own quota');
select t.throws($$select public.create_invite('x')$$, 'forbidden', 'non-admins cannot create invites');
select t.throws($$select * from public.invites$$, 'permission denied', 'users cannot read invites');
select t.throws($$select private.setting_int('free_daily_runs')$$,
                'permission denied', 'the private schema is unreachable');
select t.throws($$select queue.claim_job('evil')$$,
                'permission denied', 'users cannot call worker functions');
select t.throws($$select public.check_rate_limit('x', 'y', 1, 60)$$,
                'permission denied', 'users cannot call the rate limiter');

-- -------------------------------------------------------------- RLS: bob ---
select t.login('00000000-0000-0000-0000-00000000000b');
select t.is((select count(*)::int from public.workspace_pages), 0, 'bob cannot see alice''s notes');
select t.is((select count(*)::int from public.board_cards), 0, 'bob cannot see alice''s cards');
select t.is((select count(*)::int from public.profiles), 1, 'bob sees only his own profile');
update public.workspace_pages set title = 'hacked';
delete from public.board_cards;
select t.throws($$insert into public.workspace_pages (user_id, title)
                  values ('00000000-0000-0000-0000-00000000000a', 'planted')$$,
                'row-level security', 'bob cannot insert rows owned by alice');
select t.throws($$insert into public.workspace_pages (parent_id, title)
                  values ('10000000-0000-0000-0000-000000000001', 'child of alice page')$$,
                'foreign key', 'bob cannot attach a page under alice''s page');
select t.throws($$insert into public.board_columns (board_id, name, position)
                  values ('20000000-0000-0000-0000-000000000001', 'sneaky', 'a1')$$,
                'foreign key', 'bob cannot add a column to alice''s board');
select t.throws($$insert into public.habit_checkins (habit_id, day)
                  values ('30000000-0000-0000-0000-000000000001', current_date - 1)$$,
                'foreign key', 'bob cannot check in alice''s habit');

-- ------------------------------------------------------------ RLS: guest ---
select t.guest();
select t.throws($$select * from public.workspace_pages$$, 'permission denied', 'guests cannot read notes');
select t.throws($$select * from public.profiles$$, 'permission denied', 'guests cannot read profiles');
select t.throws($$select public.enqueue_job('x', '{}')$$, 'permission denied', 'guests cannot enqueue jobs');
select t.is((select (public.site_stats() ->> 'runs_7d')::int), 0, 'guests can read public site stats');

-- ------------------------------------------- alice's data is untouched ---
select t.login('00000000-0000-0000-0000-00000000000a');
select t.is((select title from public.workspace_pages), 'Alice private note', 'bob''s update changed nothing');
select t.is((select count(*)::int from public.board_cards), 1, 'bob''s delete removed nothing');
select t.throws($$delete from public.board_columns$$,
                'foreign key', 'a column that still has cards cannot be deleted');
delete from public.boards;
select t.is((select count(*)::int from public.board_cards), 0, 'deleting a board removes its cards');

-- --------------------------------------- account deletion removes it all ---
select t.server();
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select t.is((select count(*)::int from public.workspace_pages), 0, 'deleting a user deletes their data');
select t.is((select count(*)::int from public.invites where used_at is not null), 2,
            'a deleted user''s invite stays used');

rollback;
