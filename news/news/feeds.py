"""Steps 3 and 4 glued to the database: rank per user, then summarise the winners.

Costs at most one ranking request per user plus `summary_requests_per_run`, and none
when nothing changed since the last run. Only articles in someone's current top N are
summarised; their pages are read in memory first (news/article.py). When the budget
or the provider says stop, what is already written stays and the run is reported as
"limited".
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from .llm import Budget, LimitReached, LlmConfig, ProviderError
from .rank import rank_user, summarise

log = logging.getLogger("news.feeds")  # counts only: these logs are public


def build_feeds(db, budget: Budget, config: LlmConfig, last_run, read_page=None) -> dict:
    counts = {"ranked_users": 0, "summarised": 0, "limited": False, "error": None}
    try:
        for user in db.users_to_rank():
            n = min(user["feed_size"], config.max_n)  # the budget caps N, whatever the user picked
            found = db.candidates(user["user_id"], config.window_hours, config.candidates_per_user)
            if len(found) < n:
                found = db.candidates(user["user_id"], config.wide_window_hours, config.candidates_per_user)
            # Only spend a request when there is something new for this user.
            changed = last_run is None or user["prefs_updated_at"] > last_run
            if not found or not (changed or any(c["fetched_at"] > last_run for c in found)):
                continue
            picked = rank_user(budget.call, user, found, n)
            db.write_feed(user["user_id"], picked)
            counts["ranked_users"] += 1
            # 0 picked from many candidates means the model's answer was unusable.
            log.info("ranking: %d candidates, %d picked", len(found), len(picked))
        for _ in range(config.summary_requests_per_run):
            todo = db.unsummarised(config.summaries_per_request)
            if not todo:
                break
            images: dict[str, str | None] = {}
            if read_page and config.read_full_articles:
                with ThreadPoolExecutor(max_workers=5) as pool:
                    pages = list(pool.map(read_page, [a["url"] for a in todo]))
                for article, page in zip(todo, pages, strict=True):
                    article["text"] = page.text
                    images[str(article["id"])] = page.image_url
            rows = summarise(budget.call, todo, config.article_text_chars)
            for row in rows:
                row["image_url"] = images.get(row["id"])
            saved = db.save_summaries(rows)
            readable = sum(1 for a in todo if a.get("text"))
            log.info("summaries: %d wanted, %d pages readable, %d saved", len(todo), readable, saved)
            counts["summarised"] += saved
            if not saved:
                break  # same articles would come back; try again next run
    except LimitReached:
        counts["limited"] = True
    except ProviderError as error:
        # The provider refused the request. Keep what is stored, report it, do not crash.
        log.error("the LLM provider answered HTTP %d", error.status)
        counts["error"] = error.status
    return counts
