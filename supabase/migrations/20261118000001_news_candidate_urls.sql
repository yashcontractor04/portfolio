-- =============================================================================
-- 0007 news: candidates carry their link
-- =============================================================================
-- The ranking step needs to know which candidates can be read in full. A Google
-- News link is an opaque redirect, so its card can only get a headline summary;
-- given the choice, the ranking should prefer a direct link to the same story.
-- Adding a column to the result type means the function is dropped and re-created
-- (CREATE OR REPLACE cannot change a return type), so the grant is repeated.
-- =============================================================================

drop function news.candidates(uuid, int, int);

create function news.candidates(p_user uuid, p_hours int, p_limit int) returns table (
  id uuid, url text, title text, snippet text, source text, topics text[], seen_at timestamptz, fetched_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.url, a.title, a.snippet, a.source, a.topics, coalesce(a.published_at, a.fetched_at), a.fetched_at
    from public.news_articles a
   where a.topics && (select p.topics from public.news_prefs p where p.user_id = p_user)
     and coalesce(a.published_at, a.fetched_at) > now() - make_interval(hours => least(p_hours, 72))
     and not exists (select 1 from public.news_feed_items f
                      where f.user_id = p_user and f.article_id = a.id)
   order by coalesce(a.published_at, a.fetched_at) desc
   limit least(p_limit, 200)
$$;

revoke all on function news.candidates(uuid, int, int) from public, anon, authenticated;
grant execute on function news.candidates(uuid, int, int) to app_news, service_role;
