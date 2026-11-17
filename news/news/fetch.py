"""Step 1 of the pipeline: read every source in the config and return clean articles.

Nothing here talks to the database or to an LLM. Each source is fetched on its own:
one broken feed is counted and skipped, the rest still arrive.
"""

from __future__ import annotations

import calendar
import html
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import feedparser
import httpx

from .config import SourcesConfig
from .urls import canonical_url, https_or_none

log = logging.getLogger("news.fetch")

MAX_FEED_BYTES = 3_000_000  # a feed larger than this is not a feed we want
HN_API = "https://hacker-news.firebaseio.com/v0"
TAG = re.compile(r"<[^>]+>")
SPACE = re.compile(r"\s+")


@dataclass
class Article:
    url: str
    title: str
    source: str
    lang: str
    topics: set[str]
    published_at: datetime
    snippet: str | None = None
    image_url: str | None = None

    def as_row(self) -> dict:
        """The shape news.upsert_articles() expects."""
        return {
            "url": self.url,
            "title": self.title,
            "source": self.source,
            "lang": self.lang,
            "topics": sorted(self.topics),
            "published_at": self.published_at.isoformat(),
            "snippet": self.snippet,
            "image_url": self.image_url,
        }


@dataclass
class FetchStats:
    sources: int = 0
    failed: list[str] = field(default_factory=list)
    fetched: int = 0


def plain_text(value: str | None, limit: int) -> str | None:
    """Feed text is untrusted HTML: strip the tags, keep plain text, cut to length."""
    if not value:
        return None
    text = SPACE.sub(" ", html.unescape(TAG.sub(" ", value))).strip()
    return text[:limit] or None


def _entry_time(entry: dict) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    return datetime.fromtimestamp(calendar.timegm(parsed), UTC) if parsed else None


def _entry_image(entry: dict) -> str | None:
    for key in ("media_thumbnail", "media_content"):
        for media in entry.get(key) or []:
            if url := https_or_none(media.get("url")):
                return url
    for link in entry.get("links") or []:
        if link.get("rel") == "enclosure" and str(link.get("type", "")).startswith("image/"):
            if url := https_or_none(link.get("href")):
                return url
    return None


def parse_feed(
    body: bytes,
    *,
    source: str,
    lang: str,
    topic: str,
    cutoff: datetime,
    limit: int,
    google_news: bool = False,
) -> list[Article]:
    """Turn RSS/Atom bytes into articles newer than `cutoff`. Undated entries are skipped:
    without a date we cannot tell fresh news from an old page that is still in the feed."""
    articles: list[Article] = []
    for entry in feedparser.parse(body).entries:
        url = canonical_url(entry.get("link") or "")
        title = plain_text(entry.get("title"), 500)
        published = _entry_time(entry)
        if not url or not title or not published or published < cutoff:
            continue
        name = source
        if google_news:
            # Google News titles look like "Headline - Publisher"; keep them apart.
            publisher = plain_text((entry.get("source") or {}).get("title"), 120)
            if publisher:
                name = publisher
                title = title.removesuffix(f" - {publisher}").strip() or title
        articles.append(
            Article(
                url=url,
                title=title,
                source=name,
                lang=lang,
                topics={topic},
                published_at=min(published, datetime.now(UTC)),
                snippet=None if google_news else plain_text(entry.get("summary"), 500),
                image_url=_entry_image(entry),
            )
        )
    articles.sort(key=lambda a: a.published_at, reverse=True)
    return articles[:limit]


def _get(client: httpx.Client, url: str) -> bytes:
    with client.stream("GET", url) as response:
        response.raise_for_status()
        chunks, size = [], 0
        for chunk in response.iter_bytes():
            size += len(chunk)
            if size > MAX_FEED_BYTES:
                raise ValueError("response too large")
            chunks.append(chunk)
        return b"".join(chunks)


RETRY_STATUS = {429, 500, 502, 503}


def _get_politely(
    client: httpx.Client, url: str, lock: threading.Lock, pause: float, retry_wait: float, sleep
) -> bytes:
    """For a host that rate-limits us (Google News): one request at a time, a short
    pause before each, and one more try after a longer wait if the answer is 429 or 5xx."""
    with lock:
        sleep(pause)
        try:
            return _get(client, url)
        except httpx.HTTPStatusError as error:
            if error.response.status_code not in RETRY_STATUS:
                raise
            sleep(retry_wait)
            return _get(client, url)


def google_news_url(query: str, hl: str, gl: str, ceid: str) -> str:
    return "https://news.google.com/rss/search?" + urlencode(
        {"q": f"{query} when:1d", "hl": hl, "gl": gl, "ceid": ceid}
    )


def fetch_hacker_news(
    client: httpx.Client, *, topic: str, min_score: int, max_items: int, cutoff: datetime
) -> list[Article]:
    ids = client.get(f"{HN_API}/topstories.json").raise_for_status().json()[:max_items]
    articles: list[Article] = []
    for story_id in ids:
        item = client.get(f"{HN_API}/item/{int(story_id)}.json").raise_for_status().json() or {}
        url = canonical_url(item.get("url") or "")  # "Ask HN" posts have no link: skipped
        title = plain_text(item.get("title"), 500)
        published = datetime.fromtimestamp(int(item.get("time") or 0), UTC)
        if not url or not title or int(item.get("score") or 0) < min_score or published < cutoff:
            continue
        articles.append(
            Article(
                url=url, title=title, source="Hacker News", lang="en", topics={topic}, published_at=published
            )
        )
    return articles


def merge(articles: list[Article]) -> list[Article]:
    """One article per URL. Found under two topics, it keeps both."""
    by_url: dict[str, Article] = {}
    for article in articles:
        known = by_url.get(article.url)
        if known:
            known.topics |= article.topics
            known.snippet = known.snippet or article.snippet
            known.image_url = known.image_url or article.image_url
        else:
            by_url[article.url] = article
    return list(by_url.values())


def fetch_all(
    config: SourcesConfig, client: httpx.Client | None = None, now: datetime | None = None, sleep=time.sleep
) -> tuple[list[Article], FetchStats]:
    settings = config.settings
    cutoff = (now or datetime.now(UTC)) - timedelta(hours=settings.max_age_hours)
    limit = settings.max_items_per_source
    own_client = client is None
    client = client or httpx.Client(
        timeout=settings.timeout_seconds,
        follow_redirects=True,
        max_redirects=5,
        headers={"User-Agent": settings.user_agent},
    )

    google_lock = threading.Lock()  # shared by all Google News searches: they run one by one

    # One small job per source: (name for the log, function that returns articles).
    jobs: list[tuple[str, object]] = []
    for topic in config.topics:
        for feed in topic.feeds:
            jobs.append(
                (
                    feed.name,
                    lambda f=feed, t=topic: parse_feed(
                        _get(client, str(f.url)),
                        source=f.name,
                        lang=f.lang,
                        topic=t.slug,
                        cutoff=cutoff,
                        limit=limit,
                    ),
                )
            )
        for search in topic.google_news:
            jobs.append(
                (
                    f"Google News: {search.query}",
                    lambda s=search, t=topic: parse_feed(
                        _get_politely(
                            client,
                            google_news_url(s.query, s.hl, s.gl, s.ceid),
                            google_lock,
                            settings.google_news_pause_seconds,
                            settings.google_news_retry_seconds,
                            sleep,
                        ),
                        source="Google News",
                        lang=s.lang,
                        topic=t.slug,
                        cutoff=cutoff,
                        limit=limit,
                        google_news=True,
                    ),
                )
            )
        if topic.hacker_news:
            jobs.append(
                (
                    "Hacker News",
                    lambda h=topic.hacker_news, t=topic: fetch_hacker_news(
                        client, topic=t.slug, min_score=h.min_score, max_items=h.max_items, cutoff=cutoff
                    ),
                )
            )

    stats = FetchStats(sources=len(jobs))
    found: list[Article] = []

    def run(job: tuple[str, object]) -> list[Article]:
        name, work = job
        try:
            return work()  # type: ignore[operator]
        except Exception as error:  # noqa: BLE001 - one bad source must not stop the run
            status = error.response.status_code if isinstance(error, httpx.HTTPStatusError) else ""
            log.warning("source failed: %s (%s %s)", name, type(error).__name__, status)
            stats.failed.append(name)
            return []

    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for result in pool.map(run, jobs):
                found.extend(result)
    finally:
        if own_client:
            client.close()
    merged = merge(found)
    stats.fetched = len(merged)
    return merged, stats
