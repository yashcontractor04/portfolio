from datetime import UTC, datetime, timedelta

from news.feeds import build_feeds
from news.llm import Budget, load_llm_config

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
            {"id": f"a{i}", "title": f"Story {i}", "source": "S", "snippet": "text", "fetched_at": fetched_at}
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
        return self.articles[:limit] if self.feed else []

    def save_summaries(self, items):
        self.summaries = items
        return len(items)


class FakeProvider:
    def __init__(self):
        self.calls = 0

    def generate_json(self, model, prompt):
        self.calls += 1
        if "select news" in prompt:
            return {"items": [{"id": i, "score": 1 - i / 100, "why": "w"} for i in range(15)]}
        return {"items": [{"id": 0, "intro": "i", "summary": "s"}]}


def run(db, allow=True, last_run=NOW - timedelta(minutes=15)):
    provider = FakeProvider()
    budget = Budget(provider, CONFIG, lambda model, cap: allow, sleep=lambda s: None)
    return build_feeds(db, budget, CONFIG, last_run), provider


def test_new_articles_are_ranked_and_n_is_capped_by_the_budget():
    db = FakeDb(fetched_at=NOW)
    counts, provider = run(db)
    assert len(db.feed) == CONFIG.max_n  # the user asked for 20
    assert counts == {"ranked_users": 1, "summarised": 1, "limited": False}
    assert provider.calls == 2  # users + 1


def test_nothing_new_costs_no_request():
    db = FakeDb(fetched_at=NOW - timedelta(hours=3))
    counts, provider = run(db)
    assert provider.calls == 0 and counts["ranked_users"] == 0


def test_limit_is_reported_not_raised():
    db = FakeDb(fetched_at=NOW)
    counts, provider = run(db, allow=False)
    assert counts["limited"] is True and provider.calls == 0 and db.feed == []
