-- =============================================================================
-- 0005 news app: shared article pool, per-user feed, feedback, pipeline API
-- =============================================================================
-- How news flows through the database (design: docs/ARCHITECTURE.md, section 7):
--   pipeline --> news.upsert_articles()   shared pool, de-duplicated, one row per article
--   pipeline --> news.users_to_rank() / news.candidates()   who wants what
--   pipeline --> news.write_feed()        per-user ranking + "why it matters"
--   pipeline --> news.save_summaries()    one summary per article, shared by all users
--   browser  --> public.news_feed()       own unread items (RLS applies)
--   browser  --> news_prefs / news_feedback   own rows only (RLS)
-- The pipeline connects as `app_news`. Like `app_worker`, it has NO table access:
-- it can only call the functions in schema `news`.
-- =============================================================================

create schema if not exists news;
revoke all on schema news from public, anon, authenticated;

-- Least-privilege role for the news pipeline (GitHub Actions). Created without
-- login; enable it once by hand: alter role app_news login password '<long random>';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_news') then
    create role app_news nologin noinherit;
  end if;
end $$;
grant usage on schema news to service_role, app_news;

-- ----------------------------------------------------------------------------
-- Who gets a feed. Off by default and only changeable on the server (users have
-- no UPDATE grant on this column), because every enabled user costs LLM requests.
--   update public.profiles set news_enabled = true where id = '<user id>';
-- ----------------------------------------------------------------------------
alter table public.profiles add column news_enabled boolean not null default false;

create function public.news_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and news_enabled
  )
$$;
grant execute on function public.news_enabled() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- news_topics: the preset chips. The source of truth is news/config/sources.yaml;
-- the pipeline mirrors it here on every run (news.sync_topics).
-- ----------------------------------------------------------------------------
create table public.news_topics (
  slug     text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  label    text not null check (char_length(label) between 1 and 80),
  position int  not null default 0,
  active   boolean not null default true
);

-- ----------------------------------------------------------------------------
-- news_articles: the shared pool. Metadata, a link and one generated summary.
-- The article body is never stored.
-- ----------------------------------------------------------------------------
create table public.news_articles (
  id            uuid primary key default gen_random_uuid(),
  url           text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  url_hash      text not null unique,          -- sha256 of the canonical URL: the idempotency key
  title         text not null check (char_length(title) between 1 and 500),
  title_key     text,                          -- normalised title, catches the same story under two URLs
  source        text not null check (char_length(source) between 1 and 120),
  lang          text check (lang ~ '^[a-z]{2}$'),
  snippet       text check (char_length(snippet) <= 1000),   -- the feed's own teaser
  image_url     text check (image_url ~ '^https://' and char_length(image_url) <= 2000),
  topics        text[] not null default '{}' check (cardinality(topics) <= 10),
  published_at  timestamptz,
  fetched_at    timestamptz not null default now(),
  intro         text check (char_length(intro) <= 300),      -- generated, one line
  summary       text check (char_length(summary) <= 4000),   -- generated, about 200-350 words
  summarised_at timestamptz
);
create index news_articles_fetched_idx on public.news_articles (fetched_at desc);
create index news_articles_title_key_idx on public.news_articles (title_key);
create index news_articles_topics_idx on public.news_articles using gin (topics);

-- ----------------------------------------------------------------------------
-- news_prefs: one row per user. Chips, free text, and how many cards (N).
-- `interests` is untrusted text that ends up inside an LLM prompt: keep it short.
-- ----------------------------------------------------------------------------
create table public.news_prefs (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  topics     text[] not null default '{}'
             check (cardinality(topics) <= 20 and char_length(array_to_string(topics, ',')) <= 800),
  interests  text not null default '' check (char_length(interests) <= 500),
  feed_size  int  not null default 10 check (feed_size between 5 and 20),
  updated_at timestamptz not null default now()
);
create trigger news_prefs_updated_at before update on public.news_prefs
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- news_feed_items: the pipeline's ranking for one user. Read-only for the user.
-- ----------------------------------------------------------------------------
create table public.news_feed_items (
  user_id    uuid not null references auth.users (id) on delete cascade,
  article_id uuid not null references public.news_articles (id) on delete cascade,
  score      real not null check (score between 0 and 1),
  why        text not null default '' check (char_length(why) <= 400),
  created_at timestamptz not null default now(),
  primary key (user_id, article_id)
);
create index news_feed_items_article_idx on public.news_feed_items (article_id);

-- ----------------------------------------------------------------------------
-- news_feedback: what the user did with a card. Written by the user only.
-- v1 just stores it. Learning later needs nothing more than a join with
-- news_articles (topics, source), which is why thumbed articles survive the purge.
-- ----------------------------------------------------------------------------
create table public.news_feedback (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  article_id uuid not null references public.news_articles (id) on delete cascade,
  read_at    timestamptz,
  thumb      smallint not null default 0 check (thumb in (-1, 0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, article_id)
);
create index news_feedback_article_idx on public.news_feedback (article_id);
create trigger news_feedback_updated_at before update on public.news_feedback
  for each row execute function private.set_updated_at();
create trigger news_feedback_cap before insert on public.news_feedback
  for each row execute function private.enforce_row_cap('5000');

-- ----------------------------------------------------------------------------
-- news_runs: one row per pipeline run. The UI reads the latest one to show
-- "pipeline hasn't run yet" / "limited, showing older items" / last refresh.
-- `note` is shown to users and appears in public CI logs: never personal data.
-- ----------------------------------------------------------------------------
create table public.news_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'ok', 'limited', 'failed')),
  fetched      int not null default 0,
  new_articles int not null default 0,
  ranked_users int not null default 0,
  summarised   int not null default 0,
  llm_requests int not null default 0,
  note         text check (char_length(note) <= 300)
);

-- LLM request counter, one row per provider day and model. Server-only.
create table public.news_llm_usage (
  day      date not null,
  model    text not null check (char_length(model) <= 80),
  requests int  not null default 0 check (requests >= 0),
  primary key (day, model)
);

-- ----------------------------------------------------------------------------
-- RLS and grants
-- ----------------------------------------------------------------------------
alter table public.news_topics     enable row level security;
alter table public.news_articles   enable row level security;
alter table public.news_prefs      enable row level security;
alter table public.news_feed_items enable row level security;
alter table public.news_feedback   enable row level security;
alter table public.news_runs       enable row level security;
alter table public.news_llm_usage  enable row level security;
revoke all on public.news_topics, public.news_articles, public.news_prefs, public.news_feed_items,
              public.news_feedback, public.news_runs, public.news_llm_usage from anon, authenticated;

-- Shared tables: read-only, and only for logged-in users who have News enabled.
create policy news_topics_read on public.news_topics
  for select to authenticated using ((select public.news_enabled()));
create policy news_articles_read on public.news_articles
  for select to authenticated using ((select public.news_enabled()));
create policy news_runs_read on public.news_runs
  for select to authenticated using ((select public.news_enabled()));
grant select on public.news_topics, public.news_articles, public.news_runs to authenticated;

-- Per-user tables: owner only.
create policy news_prefs_owner on public.news_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.news_prefs to authenticated;
grant update (topics, interests, feed_size) on public.news_prefs to authenticated;

create policy news_feed_items_select_own on public.news_feed_items
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.news_feed_items to authenticated;

create policy news_feedback_owner on public.news_feedback for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.news_feedback to authenticated;
grant update (read_at, thumb) on public.news_feedback to authenticated;
-- news_llm_usage: no policy and no grant, so only the functions below reach it.

-- ----------------------------------------------------------------------------
-- Browser API: the feed. Runs as the caller (no security definer), so the RLS
-- policies above decide what it can see. Top N unread items of the last 24 hours.
-- ----------------------------------------------------------------------------
create function public.news_feed() returns table (
  article_id uuid, url text, title text, source text, image_url text, topics text[],
  published_at timestamptz, intro text, summary text, snippet text,
  why text, score real, thumb smallint
)
language sql stable set search_path = '' as $$
  select a.id, a.url, a.title, a.source, a.image_url, a.topics,
         coalesce(a.published_at, a.fetched_at), a.intro, a.summary, a.snippet,
         f.why, f.score, coalesce(fb.thumb, 0)::smallint
    from public.news_feed_items f
    join public.news_articles a on a.id = f.article_id
    left join public.news_feedback fb on fb.user_id = f.user_id and fb.article_id = f.article_id
   where f.user_id = (select auth.uid())
     and fb.read_at is null
     and f.created_at > now() - interval '24 hours'
   order by f.score desc, coalesce(a.published_at, a.fetched_at) desc
   limit coalesce((select p.feed_size from public.news_prefs p where p.user_id = (select auth.uid())), 10)
$$;
grant execute on function public.news_feed() to authenticated;

-- ----------------------------------------------------------------------------
-- Pipeline API (schema `news`): callable by app_news and service_role only
-- ----------------------------------------------------------------------------

-- "Trump signs AI order - Reuters" and "Trump Signs AI Order" give the same key.
-- Very short keys are useless for matching (and non-Latin titles collapse), so: null.
create function private.news_title_key(p_title text) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(k) >= 16 then k end
    from (select btrim(regexp_replace(lower(p_title), '[^a-z0-9]+', ' ', 'g')) as k) s
$$;

-- Mirror the presets from the config file. Presets that disappeared are switched off.
create function news.sync_topics(p_topics jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.news_topics (slug, label, position, active)
  select t.slug, t.label, coalesce(t.position, 0), true
    from jsonb_to_recordset(p_topics) as t (slug text, label text, position int)
  on conflict (slug) do update set label = excluded.label, position = excluded.position, active = true;
  update public.news_topics set active = false
   where slug not in (select t.slug from jsonb_to_recordset(p_topics) as t (slug text));
end $$;

create function news.start_run() returns bigint
language sql security definer set search_path = '' as $$
  insert into public.news_runs default values returning id
$$;

create function news.finish_run(p_run bigint, p_status text, p_counts jsonb, p_note text default null)
returns void
language sql security definer set search_path = '' as $$
  update public.news_runs
     set finished_at = now(), status = p_status, note = left(p_note, 300),
         fetched      = coalesce((p_counts ->> 'fetched')::int, 0),
         new_articles = coalesce((p_counts ->> 'new_articles')::int, 0),
         ranked_users = coalesce((p_counts ->> 'ranked_users')::int, 0),
         summarised   = coalesce((p_counts ->> 'summarised')::int, 0),
         llm_requests = coalesce((p_counts ->> 'llm_requests')::int, 0)
   where id = p_run
$$;

-- Start of the last run that finished normally: "new" means fetched after this.
create function news.last_ok_run() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(started_at) from public.news_runs where status in ('ok', 'limited')
$$;

-- Add articles to the pool. Safe to call again with the same input (idempotent):
-- a known URL only gains topics, and a known headline is skipped.
-- Returns how many rows were really new.
create function news.upsert_articles(p_articles jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_new int;
begin
  create temporary table incoming on commit drop as
  select distinct on (private.sha256_hex(a.url))
         a.url, private.sha256_hex(a.url) as url_hash, a.title,
         private.news_title_key(a.title) as title_key, a.source, a.lang, a.snippet, a.image_url,
         coalesce(a.topics, '{}') as topics, a.published_at
    from jsonb_to_recordset(p_articles) as a (
           url text, title text, source text, lang text, snippet text, image_url text,
           topics text[], published_at timestamptz)
   order by private.sha256_hex(a.url);

  -- 1. A story we already have (same URL or same headline) found under another
  --    topic: merge the topics, so every interested user can get it.
  update public.news_articles x
     set topics = (select array_agg(distinct s) from unnest(x.topics || i.topics) as s)
    from incoming i
   where (x.url_hash = i.url_hash or x.title_key = i.title_key) and not (x.topics @> i.topics);

  -- 2. Insert what is new. One row per headline within the batch (distinct on),
  --    and nothing whose headline is already in the pool.
  insert into public.news_articles
         (url, url_hash, title, title_key, source, lang, snippet, image_url, topics, published_at)
  select distinct on (coalesce(i.title_key, i.url_hash))
         i.url, i.url_hash, i.title, i.title_key, i.source, i.lang, left(i.snippet, 1000),
         i.image_url, i.topics, i.published_at
    from incoming i
   where not exists (select 1 from public.news_articles x
                      where x.title_key = i.title_key and x.url_hash <> i.url_hash)
   order by coalesce(i.title_key, i.url_hash), i.published_at nulls last, i.url
  on conflict (url_hash) do nothing;
  get diagnostics v_new = row_count;
  drop table incoming;
  return v_new;
end $$;

-- Users the pipeline should build a feed for: enabled, with at least one topic.
create function news.users_to_rank() returns table (
  user_id uuid, topics text[], interests text, feed_size int, prefs_updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.topics, p.interests, p.feed_size, p.updated_at
    from public.news_prefs p
    join public.profiles pr on pr.id = p.user_id
   where pr.news_enabled and cardinality(p.topics) > 0
$$;

-- Articles one user has not been shown yet, matching their topics, newest first.
create function news.candidates(p_user uuid, p_hours int, p_limit int) returns table (
  id uuid, title text, snippet text, source text, topics text[], seen_at timestamptz, fetched_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.title, a.snippet, a.source, a.topics, coalesce(a.published_at, a.fetched_at), a.fetched_at
    from public.news_articles a
   where a.topics && (select p.topics from public.news_prefs p where p.user_id = p_user)
     and coalesce(a.published_at, a.fetched_at) > now() - make_interval(hours => least(p_hours, 72))
     and not exists (select 1 from public.news_feed_items f
                      where f.user_id = p_user and f.article_id = a.id)
   order by coalesce(a.published_at, a.fetched_at) desc
   limit least(p_limit, 200)
$$;

-- Store one user's ranking: [{"article_id": "...", "score": 0.8, "why": "..."}].
-- An item that is already in the feed is left alone, so a re-run changes nothing.
create function news.write_feed(p_user uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  insert into public.news_feed_items (user_id, article_id, score, why)
  select p_user, i.article_id, i.score, left(coalesce(i.why, ''), 400)
    from jsonb_to_recordset(p_items) as i (article_id uuid, score real, why text)
   where exists (select 1 from public.news_articles a where a.id = i.article_id)
  on conflict (user_id, article_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Articles that are in somebody's feed but have no summary yet.
create function news.unsummarised(p_limit int) returns table (
  id uuid, url text, title text, snippet text, source text, lang text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.url, a.title, a.snippet, a.source, a.lang
    from public.news_articles a
   where a.summary is null
     and exists (select 1 from public.news_feed_items f where f.article_id = a.id)
   order by a.fetched_at desc
   limit least(p_limit, 50)
$$;

-- Store summaries: [{"id": "...", "intro": "...", "summary": "...", "image_url": "..."}].
-- A summary is written once and never overwritten.
create function news.save_summaries(p_items jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  update public.news_articles a
     set intro = left(i.intro, 300), summary = left(i.summary, 4000), summarised_at = now(),
         image_url = coalesce(a.image_url, i.image_url)
    from jsonb_to_recordset(p_items) as i (id uuid, intro text, summary text, image_url text)
   where a.id = i.id and a.summary is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- The request budget. Call BEFORE every LLM request: true = go ahead (and it is
-- counted), false = today's cap is reached. One atomic statement, same idea as the
-- run quota: the WHERE clause refuses the increment once the cap is hit.
-- Gemini's daily quota resets at midnight Pacific time, so that is our "day".
create function news.reserve_llm_request(p_model text, p_daily_cap int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'America/Los_Angeles')::date;
  v_requests int;
begin
  if p_daily_cap < 1 then
    return false;
  end if;
  insert into public.news_llm_usage as u (day, model, requests) values (v_day, p_model, 1)
  on conflict (day, model) do update set requests = u.requests + 1
    where u.requests < p_daily_cap
  returning requests into v_requests;
  return v_requests is not null;
end $$;

-- Retention: the pool stays a few days old at most. An article somebody rated is
-- kept for 180 days so that feedback can be learned from later.
create function news.purge() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.news_articles a
   where a.fetched_at < now() - interval '3 days'
     and not exists (select 1 from public.news_feedback fb
                      where fb.article_id = a.id and fb.thumb <> 0);
  delete from public.news_articles where fetched_at < now() - interval '180 days';
  delete from public.news_feed_items where created_at < now() - interval '3 days';
  delete from public.news_runs where started_at < now() - interval '14 days';
  delete from public.news_llm_usage where day < current_date - 90;
  -- A run that never finished (the job was killed) must not look "running" forever.
  update public.news_runs set status = 'failed', finished_at = now(), note = 'did not finish'
   where status = 'running' and started_at < now() - interval '30 minutes';
end $$;

revoke all on all functions in schema news from public, anon, authenticated;
grant execute on all functions in schema news to app_news, service_role;
