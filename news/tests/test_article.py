import httpx

from news.article import ArticleReader, is_public_host

UA = "yash-portfolio-news/1.0"
SENTENCES = [
    "The European Central Bank kept interest rates unchanged on Thursday.",
    "President Lagarde said inflation is falling faster than expected across the euro area.",
    "Several economists now expect the first cut in the spring of next year.",
    "Markets reacted calmly, with the DAX closing slightly higher than on Wednesday.",
    "German exporters welcomed the decision but warned about weak demand from China.",
    "The bank will publish new forecasts at its next meeting in December.",
]
# Varied sentences: the extractor drops repeated text, as a real article has none.
BODY = "".join(f"<p>{s} {SENTENCES[(i + 1) % 6]}</p>" for i, s in enumerate(SENTENCES * 2))
ARTICLE = (
    "<html><head><title>Rates</title><meta property='og:image' content='/img/hero.jpg'></head>"
    "<body><article><h1>Rates unchanged</h1>" + BODY + "</article></body></html>"
).encode()
PAYWALL = b"<html><body><article><p>Subscribe to read this article.</p></article></body></html>"


def reader(routes: dict, is_public=lambda host: host != "internal.example"):
    def handler(request: httpx.Request) -> httpx.Response:
        key = f"{request.url.host}{request.url.path}"
        status, headers, body = routes.get(key, (404, {}, b""))
        return httpx.Response(status, headers=headers, content=body)

    return ArticleReader(UA, client=httpx.Client(transport=httpx.MockTransport(handler)), is_public=is_public)


HTML = {"content-type": "text/html; charset=utf-8"}


def test_private_addresses_are_refused():
    for host in ("127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "localhost", "no-such-host.invalid"):
        assert is_public_host(host) is False


def test_reads_text_and_image():
    page = reader({"news.example/a": (200, HTML, ARTICLE)}).read("https://news.example/a")
    assert page.text and "kept interest rates unchanged" in page.text
    assert page.image_url == "https://news.example/img/hero.jpg"


def test_text_is_cut_to_the_limit():
    r = reader({"news.example/a": (200, HTML, ARTICLE)})
    r.max_chars = 100
    assert len(r.read("https://news.example/a").text) == 100


def test_robots_txt_is_respected():
    robots = (200, {"content-type": "text/plain"}, b"User-agent: *\nDisallow: /private/\n")
    r = reader({"news.example/robots.txt": robots, "news.example/private/a": (200, HTML, ARTICLE)})
    assert r.read("https://news.example/private/a").text is None


def test_unreadable_robots_txt_means_stay_away():
    r = reader({"news.example/robots.txt": (503, {}, b""), "news.example/a": (200, HTML, ARTICLE)})
    assert r.read("https://news.example/a").text is None


def test_redirect_to_an_internal_host_is_refused():
    r = reader(
        {
            "news.example/a": (302, {"location": "https://internal.example/secret"}, b""),
            "internal.example/secret": (200, HTML, ARTICLE),
        }
    )
    assert r.read("https://news.example/a").text is None


def test_paywall_and_non_html_count_as_unreadable():
    r = reader(
        {
            "news.example/paywall": (200, HTML, PAYWALL),
            "news.example/file.pdf": (200, {"content-type": "application/pdf"}, b"%PDF"),
        }
    )
    assert r.read("https://news.example/paywall").text is None
    assert r.read("https://news.example/file.pdf").text is None


def test_google_news_links_are_skipped():
    r = reader({})
    assert r.read("https://news.google.com/rss/articles/abc").text is None
