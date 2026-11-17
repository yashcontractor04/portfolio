from datetime import UTC, datetime

import httpx

from news.config import load_sources
from news.fetch import fetch_all, merge, parse_feed, plain_text
from news.urls import canonical_url, https_or_none

NOW = datetime(2026, 11, 16, 12, 0, tzinfo=UTC)
CUTOFF = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)

RSS = b"""<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><title>Fresh &amp; new</title><link>https://Example.com/a?utm_source=x&amp;id=1#top</link>
  <pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate>
  <description>&lt;p&gt;Hello &lt;script&gt;alert(1)&lt;/script&gt;world&lt;/p&gt;</description>
  <media:thumbnail url="https://example.com/i.jpg"/></item>
<item><title>Too old</title><link>https://example.com/old</link><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>No date</title><link>https://example.com/nodate</link></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>"""

GOOGLE = b"""<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>DAX hits record - Reuters</title><link>https://news.google.com/rss/articles/abc?oc=5</link>
  <pubDate>Mon, 16 Nov 2026 11:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item>
</channel></rss>"""


def test_canonical_url():
    assert (
        canonical_url("HTTPS://Example.com:443/a?utm_source=x&b=2&a=1#frag")
        == "https://example.com/a?a=1&b=2"
    )
    assert canonical_url("https://example.com") == "https://example.com/"
    assert canonical_url("javascript:alert(1)") is None
    assert canonical_url("ftp://example.com/x") is None
    assert canonical_url("") is None


def test_images_must_be_https():
    assert https_or_none("http://example.com/i.jpg") is None
    assert https_or_none("https://example.com/i.jpg") == "https://example.com/i.jpg"


def test_plain_text_strips_html():
    assert plain_text("<b>Hi</b>&nbsp;&amp; <i>bye</i>", 100) == "Hi & bye"
    assert plain_text("x" * 50, 10) == "x" * 10
    assert plain_text("  ", 10) is None


def test_parse_feed_keeps_only_fresh_valid_entries():
    articles = parse_feed(RSS, source="Example", lang="en", topic="markets", cutoff=CUTOFF, limit=10)
    assert [a.title for a in articles] == ["Fresh & new"]
    article = articles[0]
    assert article.url == "https://example.com/a?id=1"
    assert article.image_url == "https://example.com/i.jpg"
    assert "<" not in (article.snippet or "") and "world" in (article.snippet or "")
    assert article.topics == {"markets"}


def test_google_news_title_and_publisher():
    (article,) = parse_feed(
        GOOGLE, source="Google News", lang="en", topic="markets", cutoff=CUTOFF, limit=10, google_news=True
    )
    assert article.title == "DAX hits record"
    assert article.source == "Reuters"


def test_merge_unions_topics():
    a = parse_feed(RSS, source="A", lang="en", topic="markets", cutoff=CUTOFF, limit=10)
    b = parse_feed(RSS, source="B", lang="en", topic="ai-jobs", cutoff=CUTOFF, limit=10)
    (merged,) = merge(a + b)
    assert merged.topics == {"markets", "ai-jobs"}
    assert merged.as_row()["topics"] == ["ai-jobs", "markets"]


def test_real_config_is_valid():
    config = load_sources()
    assert {t.slug for t in config.topics} == {
        "ai-jobs",
        "germany-berlin",
        "markets",
        "geopolitics",
        "local-politics",
    }


def test_fetch_all_survives_a_broken_source():
    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host == "hacker-news.firebaseio.com":
            if request.url.path.endswith("topstories.json"):
                return httpx.Response(200, json=[1, 2])
            item = {
                "1": {
                    "title": "Big story",
                    "url": "https://hn.example/x",
                    "score": 500,
                    "time": int(NOW.timestamp()) - 60,
                },
                "2": {
                    "title": "Small story",
                    "url": "https://hn.example/y",
                    "score": 3,
                    "time": int(NOW.timestamp()) - 60,
                },
            }
            return httpx.Response(200, json=item[request.url.path.split("/")[-1].removesuffix(".json")])
        if host == "news.google.com":
            return httpx.Response(200, content=GOOGLE)
        if host == "www.tagesschau.de":
            return httpx.Response(500)
        return httpx.Response(200, content=RSS)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    articles, stats = fetch_all(load_sources(), client=client, now=NOW, sleep=lambda seconds: None)
    titles = {a.title for a in articles}
    assert {"Fresh & new", "DAX hits record", "Big story"} <= titles
    assert "Small story" not in titles
    assert set(stats.failed) == {"tagesschau", "tagesschau Inland"}
    fresh = next(a for a in articles if a.title == "Fresh & new")
    assert len(fresh.topics) == 5  # the same URL came back from every topic's feeds


def test_google_news_is_fetched_one_at_a_time_and_retried_once():
    state = {"active": 0, "most_at_once": 0, "calls": {}}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host != "news.google.com":
            return httpx.Response(404)
        state["active"] += 1
        state["most_at_once"] = max(state["most_at_once"], state["active"])
        query = request.url.params["q"]
        state["calls"][query] = state["calls"].get(query, 0) + 1
        try:
            if query.startswith("DAX") and state["calls"][query] == 1:
                return httpx.Response(429)  # first try is rate-limited, the retry works
            if query.startswith("Bundestag"):
                return httpx.Response(503)  # stays broken: counted as failed, not fatal
            return httpx.Response(200, content=GOOGLE)
        finally:
            state["active"] -= 1

    waits = []
    client = httpx.Client(transport=httpx.MockTransport(handler))
    articles, stats = fetch_all(load_sources(), client=client, now=NOW, sleep=waits.append)
    assert state["most_at_once"] == 1
    assert state["calls"]["DAX when:1d"] == 2 and state["calls"]["Bundestag when:1d"] == 2
    assert "Google News: Bundestag" in stats.failed and "Google News: DAX" not in stats.failed
    assert waits.count(8.0) == 2 and "DAX hits record" in {a.title for a in articles}
