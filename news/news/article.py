"""Reads an article page in memory so the summary can use the real text.

The text is passed to the summary prompt and then forgotten: it is never stored.
Rules, in the order they are checked:
  * Google News links are skipped: they are opaque redirects, not the article.
  * Only http(s) to public internet addresses. Every redirect is checked again, so a
    feed cannot send us to 127.0.0.1, the 10.x network or a cloud metadata address
    (server-side request forgery). Known gap: DNS could change between our check
    and the request (rebinding); acceptable on a throwaway GitHub runner.
  * robots.txt is respected. If it cannot be read (5xx, timeout) we stay away; if it
    does not exist (4xx) everything is allowed, as the robots.txt standard says.
  * HTML only, 2 MB at most, 10 s timeout.
  * A page that yields little text (paywall, cookie wall) counts as unreadable; the
    summary then uses the feed's teaser or just the headline.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
import threading
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx
import trafilatura

from .urls import https_or_none

log = logging.getLogger("news.article")

MAX_PAGE_BYTES = 2_000_000
MIN_TEXT_CHARS = 400
MAX_REDIRECTS = 4
SKIP_HOSTS = {"news.google.com"}


@dataclass
class Page:
    text: str | None = None
    image_url: str | None = None
    # Why there is no text, for the (public) log: a fixed word, never page content.
    reason: str | None = None


def is_public_host(host: str) -> bool:
    """True only if every address the name resolves to is on the public internet."""
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError):
        return False
    for info in infos:
        address = ipaddress.ip_address(str(info[4][0]).split("%")[0])
        if not address.is_global:
            return False
    return bool(infos)


class ArticleReader:
    def __init__(
        self,
        user_agent: str,
        timeout: float = 10,
        max_chars: int = 6000,
        client: httpx.Client | None = None,
        is_public=is_public_host,
    ) -> None:
        self.user_agent = user_agent
        self.max_chars = max_chars
        self.is_public = is_public
        # Redirects are followed by hand (see _get) so each hop is checked.
        self.client = client or httpx.Client(
            timeout=timeout, follow_redirects=False, headers={"User-Agent": user_agent}
        )
        self._robots: dict[str, RobotFileParser] = {}
        self._lock = threading.Lock()

    def _get(self, url: str) -> tuple[int, str, bytes, str] | None:
        """(status, content type, body, final url), or None when we must not go there."""
        for _ in range(MAX_REDIRECTS + 1):
            parts = urlsplit(url)
            if (
                parts.scheme not in ("http", "https")
                or not parts.hostname
                or not self.is_public(parts.hostname)
            ):
                return None
            with self.client.stream("GET", url) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        return None
                    url = urljoin(url, location)
                    continue
                body, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_PAGE_BYTES:
                        return None
                    body.append(chunk)
                return response.status_code, response.headers.get("content-type", ""), b"".join(body), url
        return None

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        with self._lock:
            parser = self._robots.get(origin)
        if parser is None:
            parser = RobotFileParser()
            try:
                got = self._get(origin + "/robots.txt")
            except httpx.HTTPError:
                got = None
            if got is None or got[0] >= 500:
                parser.disallow_all = True
            elif got[0] >= 400:
                parser.allow_all = True
            else:
                parser.parse(got[2].decode("utf-8", "replace").splitlines())
            with self._lock:
                self._robots[origin] = parser
        return parser.can_fetch(self.user_agent, url)

    def read(self, url: str) -> Page:
        if (urlsplit(url).hostname or "") in SKIP_HOSTS:
            return Page(reason="google-news-link")
        try:
            if not self.allowed(url):
                return Page(reason="robots.txt")
            got = self._get(url)
        except httpx.TimeoutException:
            return Page(reason="timeout")
        except (httpx.HTTPError, ValueError):
            return Page(reason="network-error")
        if not got:
            return Page(reason="blocked-or-too-big")
        if got[0] != 200:
            return Page(reason=f"http-{got[0]}")
        if "html" not in got[1].lower():
            return Page(reason="not-html")
        _, _, body, final_url = got
        try:
            # Third-party parser on untrusted HTML: any failure just means "unreadable".
            text = trafilatura.extract(
                body, include_comments=False, include_tables=False, favor_precision=True
            )
            meta = trafilatura.extract_metadata(body.decode("utf-8", "replace"), default_url=final_url)
        except Exception:  # noqa: BLE001
            return Page(reason="parse-error")
        image = https_or_none(urljoin(final_url, meta.image)) if meta is not None and meta.image else None
        if not text or len(text) < MIN_TEXT_CHARS:
            return Page(image_url=image, reason="too-little-text")  # paywall or cookie wall
        return Page(text=text[: self.max_chars], image_url=image)
