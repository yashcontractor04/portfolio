from datetime import UTC, datetime, timedelta

from news.article import Page
from news.feeds import build_feeds
from news.llm import Budget, ProviderError, load_llm_config

CONFIG = load_llm_config()
NOW = datetime(2026, 11, 16, 12, 0, tzinfo=UTC)


class FakeDb:
    def __init__(self, fetched_at):
        self.user = {
            "user_id": "u1",
            "topics": ["markets"],
            "interests": "",
            "feed_size": 20,
            "prefs_updated_at": NOW - timedelta(days=2),
        }
        self.articles = [
            {
                "id": f"a{i}",
                "title": f"Story {i}",
                "source": "S",
                "snippet": "text",
                "url": f"https://example.com/{i}",
                "fetched_at": fetched_at,
            }
            for i in range(15)
        ]
        self.feed, self.summaries = [], []

    def users_to_rank(self):
        return [self.user]

    def candidates(self, user_id, hours, limit):
        return self.articles

    def write_feed(self, user_id, items):
        self.feed = items

    def unsummarised(self, limit):
        done = {row["id"] for row in self.summaries}
        shown = {row["article_id"] for row in self.feed}
        return [dict(a) for a in self.articles if a["id"] in shown and a["id"] not in done][:limit]

    def save_summaries(self, items):
        self.summaries += items
        return len(items)


class FakeProvider:
    def __init__(self):
        self.calls, self.prompts = 0, []

    def generate_json(self, model, prompt):
        self.calls += 1
        self.prompts.append(prompt)
        if "select news" in prompt:
            return {"items": [{"id": i, "score": 1 - i / 100, "why": "w"} for i in range(15)]}
        return {"items": [{"id": i, "intro": "i", "summary": "s"} for i in range(5)]}


def run(db, allow=True, last_run=NOW - timedelta(minutes=15), read_page=None):
    provider = FakeProvider()
    budget = Budget(provider, CONFIG, lambda model, cap: allow, sleep=lambda s: None)
    return build_feeds(db, budget, CONFIG, last_run, read_page), provider


def test_new_articles_are_ranked_and_n_is_capped_by_the_budget():
    db = FakeDb(fetched_at=NOW)
    counts, provider = run(db)
    assert len(db.feed) == CONFIG.max_n  # the user asked for 20
    # 10 shown, 5 per summary request, 2 summary requests per run: all 10 in one run
    assert counts == {"ranked_users": 1, "summarised": 10, "limited": False, "error": None}
    assert provider.calls == 1 + CONFIG.summary_requests_per_run


def test_nothing_new_costs_no_request():
    db = FakeDb(fetched_at=NOW - timedelta(hours=3))
    counts, provider = run(db)
    assert provider.calls == 0 and counts["ranked_users"] == 0


def test_limit_is_reported_not_raised():
    db = FakeDb(fetched_at=NOW)
    counts, provider = run(db, allow=False)
    assert counts["limited"] is True and provider.calls == 0 and db.feed == []


def test_page_text_goes_into_the_prompt_and_the_image_is_kept():
    db = FakeDb(fetched_at=NOW)
    page = Page(text="Full article body. " * 40, image_url="https://example.com/og.jpg")
    counts, provider = run(db, read_page=lambda url: page)
    summary_prompt = provider.prompts[1]
    assert '"kind": "article"' in summary_prompt and "Full article body." in summary_prompt
    assert {row["image_url"] for row in db.summaries} == {"https://example.com/og.jpg"}


def test_unreadable_page_falls_back_to_the_teaser():
    db = FakeDb(fetched_at=NOW)
    counts, provider = run(db, read_page=lambda url: Page())
    assert '"kind": "teaser"' in provider.prompts[1] and '"kind": "article"' not in provider.prompts[1]


def test_a_provider_error_is_reported_not_raised():
    class Refusing:
        def generate_json(self, model, prompt):
            raise ProviderError(400)

    db = FakeDb(fetched_at=NOW)
    budget = Budget(Refusing(), CONFIG, lambda model, cap: True, sleep=lambda s: None)
    counts = build_feeds(db, budget, CONFIG, NOW - timedelta(minutes=15))
    assert counts["error"] == 400 and db.feed == []
