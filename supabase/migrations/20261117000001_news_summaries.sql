-- =============================================================================
-- 0006 news: longer summaries, summarise only what a user will actually see
-- =============================================================================
-- 1. Summaries are now about 500 words (Yash's request), so the column allows
--    8000 characters instead of 4000.
-- 2. news.unsummarised() used to return every ranked article without a summary.
--    Because each run adds new feed items, that backlog grew all day and wasted
--    requests on cards nobody would reach. Now it returns only articles that are in
--    some user's current top N (the same rule as public.news_feed()).
-- =============================================================================

alter table public.news_articles drop constraint news_articles_summary_check;
alter table public.news_articles
  add constraint news_articles_summary_check check (char_length(summary) <= 8000);

create or replace function news.save_summaries(p_items jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  update public.news_articles a
     set intro = left(i.intro, 300), summary = left(i.summary, 8000), summarised_at = now(),
         image_url = coalesce(a.image_url, i.image_url)
    from jsonb_to_recordset(p_items) as i (id uuid, intro text, summary text, image_url text)
   where a.id = i.id and a.summary is null
     and (i.image_url is null or i.image_url ~ '^https://');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Articles in some user's current top N (unread, last 24 hours) that have no summary.
create or replace function news.unsummarised(p_limit int) returns table (
  id uuid, url text, title text, snippet text, source text, lang text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.url, a.title, a.snippet, a.source, a.lang
    from public.news_articles a
   where a.summary is null
     and a.id in (
       select top.article_id
         from public.news_prefs p
         cross join lateral (
           select f.article_id
             from public.news_feed_items f
             join public.news_articles x on x.id = f.article_id
             left join public.news_feedback fb on fb.user_id = f.user_id and fb.article_id = f.article_id
            where f.user_id = p.user_id
              and fb.read_at is null
              and f.created_at > now() - interval '24 hours'
            order by f.score desc, coalesce(x.published_at, x.fetched_at) desc
            limit p.feed_size
         ) top
     )
   order by a.fetched_at desc
   limit least(p_limit, 50)
$$;
