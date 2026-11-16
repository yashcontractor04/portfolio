"""Steps 3 and 4 glued to the database: rank per user, then summarise the winners.

Costs at most `users + 1` LLM requests, and none when nothing changed since the last
run. When the budget or the provider says stop, what is already written stays and
the run is reported as "limited".
"""

from __future__ import annotations

from .llm import Budget, LimitReached, LlmConfig
from .rank import rank_user, summarise


def build_feeds(db, budget: Budget, config: LlmConfig, last_run) -> dict:
    counts = {"ranked_users": 0, "summarised": 0, "limited": False}
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
            db.write_feed(user["user_id"], rank_user(budget.call, user, found, n))
            counts["ranked_users"] += 1
        todo = db.unsummarised(config.summaries_per_request)
        if todo:
            counts["summarised"] = db.save_summaries(summarise(budget.call, todo))
    except LimitReached:
        counts["limited"] = True
    return counts
