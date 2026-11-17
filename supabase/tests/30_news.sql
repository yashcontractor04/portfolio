-- News tests: pipeline API (idempotency, de-duplication, budget), RLS between
-- users, the enable switch, guests, retention.
-- Everything runs in one transaction and is rolled back.
begin;

-- Two users with different topics, plus carol who does not have News enabled.
create temp table codes as
  select private.create_invite('alice', interval '1 day', null) as alice,
         private.create_invite('bob',   interval '1 day', null) as bob,
         private.create_invite('carol', interval '1 day', null) as carol;
insert into auth.users (id, email, raw_user_meta_data)
select '00000000-0000-0000-0000-00000000000a', 'alice@example.com', jsonb_build_object('invite_code', alice) from codes;
insert into auth.users (id, email, raw_user_meta_data)
select '00000000-0000-0000-0000-00000000000b', 'bob@example.com', jsonb_build_object('invite_code', bob) from codes;
insert into auth.users (id, email, raw_user_meta_data)
select '00000000-0000-0000-0000-00000000000c', 'carol@example.com', jsonb_build_object('invite_code', carol) from codes;
update public.profiles set news_enabled = true
 where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

-- ------------------------------------------------------- users: own prefs ---
select t.login('00000000-0000-0000-0000-00000000000a');
insert into public.news_prefs (topics, interests) values ('{markets}', 'ETFs and the DAX');
select t.throws($$update public.news_prefs set feed_size = 50$$, 'check constraint', 'N above 20 is rejected');
select t.throws(format($$update public.news_prefs set interests = '%s'$$, repeat('x', 501)),
                'check constraint', 'the free-text field is length-limited');
select t.throws($$update public.profiles set news_enabled = false where id = auth.uid()$$,
                'permission denied', 'a user cannot switch News on or off for themselves');
select t.throws($$select news.users_to_rank()$$, 'permission denied', 'users cannot call pipeline functions');
select t.throws($$insert into public.news_articles (url, url_hash, title, source)
                  values ('https://evil.example/x', 'h', 'planted', 'evil')$$,
                'permission denied', 'users cannot write to the article pool');
select t.throws($$select * from public.news_llm_usage$$, 'permission denied', 'users cannot read the LLM counter');

select t.login('00000000-0000-0000-0000-00000000000b');
insert into public.news_prefs (topics) values ('{ai-jobs}');

select t.login('00000000-0000-0000-0000-00000000000c');
insert into public.news_prefs (topics) values ('{markets}');

-- ------------------------------------------------ pipeline: least privilege ---
select t.server();
set local role app_news;
select t.throws($$select * from public.news_prefs$$, 'permission denied', 'the pipeline role cannot read tables directly');
select t.throws($$select * from public.workspace_pages$$, 'permission denied', 'the pipeline role cannot read notes');
select t.throws($$select queue.claim_job('x')$$, 'permission denied', 'the pipeline role cannot call worker functions');

-- ------------------------------------------------------ pipeline: one run ---
select news.sync_topics('[{"slug":"markets","label":"Markets & investing","position":1},
                          {"slug":"ai-jobs","label":"AI & CS jobs","position":2},
                          {"slug":"old","label":"Old","position":3}]');
select news.sync_topics('[{"slug":"markets","label":"Markets & investing","position":1},
                          {"slug":"ai-jobs","label":"AI & CS jobs","position":2}]');
select news.start_run() as run \gset

create temp table batch as select '[
  {"url":"https://a.example/dax-record","title":"DAX closes at a record high after ECB decision","source":"A","lang":"en","topics":["markets"],"snippet":"Stocks rose."},
  {"url":"https://b.example/dax","title":"DAX closes at a record high after ECB decision!","source":"B","lang":"en","topics":["markets"]},
  {"url":"https://c.example/ai-hiring","title":"Tech firms slow junior hiring as AI tools spread","source":"C","lang":"en","topics":["ai-jobs"]}
]'::jsonb as j;
grant select on batch to public;

select t.is(news.upsert_articles((select j from batch)), 2, 'near-duplicate headline is stored once');
select t.is(news.upsert_articles((select j from batch)), 0, 'running the same batch again adds nothing (idempotent)');
select news.upsert_articles('[{"url":"https://a.example/dax-record","title":"DAX closes at a record high after ECB decision","source":"A","topics":["ai-jobs"]}]');
select t.throws($$select news.upsert_articles('[{"url":"javascript:alert(1)","title":"A long enough bad title","source":"X"}]')$$,
                'check constraint', 'a non-http link is rejected');

select t.is((select count(*)::int from news.users_to_rank()), 2, 'only enabled users are ranked');
select t.is((select count(*)::int from news.candidates('00000000-0000-0000-0000-00000000000b', 6, 50)), 2,
            'candidates follow the user''s topics (the DAX story gained the ai-jobs topic)');

select id as dax from news.candidates('00000000-0000-0000-0000-00000000000a', 6, 50) limit 1 \gset
select id as ai from news.candidates('00000000-0000-0000-0000-00000000000b', 6, 50) where title like 'Tech%' \gset
select news.write_feed('00000000-0000-0000-0000-00000000000a',
  jsonb_build_array(jsonb_build_object('article_id', :'dax', 'score', 0.9, 'why', 'You follow the DAX.')));
select t.is(news.write_feed('00000000-0000-0000-0000-00000000000a',
  jsonb_build_array(jsonb_build_object('article_id', :'dax', 'score', 0.1, 'why', 'again'))), 0,
  'writing the same feed item twice changes nothing');
select news.write_feed('00000000-0000-0000-0000-00000000000b',
  jsonb_build_array(jsonb_build_object('article_id', :'ai', 'score', 0.8, 'why', 'About junior CS jobs.'),
                    jsonb_build_object('article_id', gen_random_uuid(), 'score', 0.5, 'why', 'unknown id')));
select t.is((select count(*)::int from news.candidates('00000000-0000-0000-0000-00000000000a', 6, 50)), 0,
            'an article already in the feed is not a candidate again');

select t.is((select count(*)::int from news.unsummarised(10)), 2, 'only articles in a feed need a summary');

-- Only a user's current top N is summarised: give alice 6 more, lower-scored items
-- and a feed of 5. Her 6 best are the DAX story plus 4 of these; 2 stay unsummarised.
select t.server();
insert into public.news_articles (url, url_hash, title, source, topics)
select 'https://x.example/' || g, 'topn' || g, 'Filler story number ' || g, 'X', '{markets}'
  from generate_series(1, 6) g;
update public.news_prefs set feed_size = 5 where user_id = '00000000-0000-0000-0000-00000000000a';
select jsonb_agg(jsonb_build_object('article_id', id, 'score', 0.1, 'why', 'filler')) as fillers
  from public.news_articles where url_hash like 'topn%' \gset
set local role app_news;
select news.write_feed('00000000-0000-0000-0000-00000000000a', :'fillers'::jsonb);
select t.is((select count(*)::int from news.unsummarised(50)), 6,
            'only articles in a user''s current top N need a summary (alice 5, bob 1)');
select t.server();
delete from public.news_feed_items where article_id in (select id from public.news_articles where url_hash like 'topn%');
delete from public.news_articles where url_hash like 'topn%';
update public.news_prefs set feed_size = 10 where user_id = '00000000-0000-0000-0000-00000000000a';
set local role app_news;
select news.save_summaries(jsonb_build_array(
  jsonb_build_object('id', :'dax', 'intro', 'Record close.', 'summary', 'First summary.', 'image_url', 'https://a.example/i.jpg')));
select t.is(news.save_summaries(jsonb_build_array(
  jsonb_build_object('id', :'dax', 'intro', 'x', 'summary', 'Second summary.'))), 0, 'a summary is written once');
select t.is(news.save_summaries(jsonb_build_array(
  jsonb_build_object('id', :'ai', 'intro', 'x', 'summary', repeat('word ', 1200), 'image_url', 'javascript:x'))), 0,
  'a summary with a non-https image is refused');
select t.is(news.save_summaries(jsonb_build_array(
  jsonb_build_object('id', :'ai', 'intro', 'x', 'summary', repeat('word ', 1200)))), 1,
  'a 1200-word summary fits (about 500 words is the target)');

-- request budget
select t.is(news.reserve_llm_request('m', 2), true,  'LLM budget: 1st request allowed');
select t.is(news.reserve_llm_request('m', 2), true,  'LLM budget: 2nd request allowed');
select t.is(news.reserve_llm_request('m', 2), false, 'LLM budget: 3rd request refused at the cap');
select t.is(news.reserve_llm_request('other', 2), true, 'LLM budget is counted per model');

select news.finish_run(:run, 'limited', '{"fetched":3,"new_articles":2,"ranked_users":2,"summarised":1,"llm_requests":3}', 'daily cap reached');
select t.is((select news.last_ok_run() is not null), true, 'a limited run still counts as a finished run');

-- ------------------------------------------------------------- RLS: alice ---
select t.server();
select t.login('00000000-0000-0000-0000-00000000000a');
select t.is((select count(*)::int from public.news_feed()), 1, 'alice gets her feed');
select t.is((select title from public.news_feed()), 'DAX closes at a record high after ECB decision', 'alice''s feed is about markets');
select t.is((select summary from public.news_feed()), 'First summary.', 'the feed carries the shared summary');
select t.is((select count(*)::int from public.news_prefs), 1, 'alice sees only her own prefs');
select t.is((select count(*)::int from public.news_feed_items), 1, 'alice sees only her own feed items');
select t.is((select count(*)::int from public.news_topics where active), 2, 'removed presets are switched off');
select t.is((select status from public.news_runs), 'limited', 'the UI can see that the last run was limited');
select t.throws($$update public.news_feed_items set score = 1$$, 'permission denied', 'users cannot change their ranking');
select t.throws($$insert into public.news_feed_items (user_id, article_id, score)
                  select auth.uid(), id, 1 from public.news_articles$$,
                'permission denied', 'users cannot add feed items');

insert into public.news_feedback (article_id, thumb) values (:'dax', 1);
select t.is((select thumb from public.news_feed()), 1::smallint, 'a thumb is stored and returned with the feed');
update public.news_feedback set read_at = now() where article_id = :'dax';
select t.is((select count(*)::int from public.news_feed()), 0, 'a read item leaves the feed');
select t.throws(format($$update public.news_feedback set thumb = 5 where article_id = '%s'$$, :'dax'),
                'check constraint', 'thumb must be -1, 0 or 1');

-- --------------------------------------------------------------- RLS: bob ---
select t.login('00000000-0000-0000-0000-00000000000b');
select t.is((select title from public.news_feed()), 'Tech firms slow junior hiring as AI tools spread',
            'bob, with different topics, gets a different feed');
select t.is((select count(*)::int from public.news_prefs), 1, 'bob cannot read alice''s prefs');
select t.is((select count(*)::int from public.news_feed_items), 1, 'bob cannot read alice''s feed');
select t.is((select count(*)::int from public.news_feedback), 0, 'bob cannot read alice''s feedback');
update public.news_prefs set interests = 'hacked';
delete from public.news_feedback;
select t.throws($$insert into public.news_feedback (user_id, article_id, thumb)
                  select '00000000-0000-0000-0000-00000000000a', id, -1 from public.news_articles limit 1$$,
                'row-level security', 'bob cannot write feedback as alice');

-- ------------------------------------------------ not enabled, and guests ---
select t.login('00000000-0000-0000-0000-00000000000c');
select t.is((select count(*)::int from public.news_articles), 0, 'a user without News enabled sees no articles');
select t.is((select count(*)::int from public.news_feed()), 0, 'a user without News enabled gets no feed');
select t.guest();
select t.throws($$select * from public.news_articles$$, 'permission denied', 'guests cannot read articles');
select t.throws($$select * from public.news_feed()$$, 'permission denied', 'guests cannot call the feed');
select t.throws($$select * from public.news_prefs$$, 'permission denied', 'guests cannot read prefs');

-- ------------------------------------------- alice's data is untouched ---
select t.login('00000000-0000-0000-0000-00000000000a');
select t.is((select interests from public.news_prefs), 'ETFs and the DAX', 'bob''s update changed nothing');
select t.is((select count(*)::int from public.news_feedback), 1, 'bob''s delete removed nothing');

-- ---------------------------------------------------------------- retention ---
select t.server();
update public.news_articles set fetched_at = now() - interval '4 days';
update public.news_feed_items set created_at = now() - interval '4 days';
insert into public.news_runs (started_at) values (now() - interval '1 hour');
set local role app_news;
select news.purge();
select t.server();
select t.is((select count(*)::int from public.news_articles), 1, 'old articles are purged, a rated one is kept');
select t.is((select count(*)::int from public.news_feed_items), 0, 'old feed items are purged');
select t.is((select count(*)::int from public.news_runs where status = 'failed'), 1, 'a run that never finished is marked failed');

-- --------------------------------------- account deletion removes it all ---
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select t.is((select count(*)::int from public.news_prefs), 2, 'deleting a user deletes their prefs');
select t.is((select count(*)::int from public.news_feedback), 0, 'deleting a user deletes their feedback');

rollback;
