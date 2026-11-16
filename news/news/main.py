"""One pipeline run. Started by .github/workflows/news.yml or by hand:

    python -m news --dry-run     fetch and print counts; no database, no secrets needed
    python -m news               full run; needs NEWS_DATABASE_URL

Stages (ranking and summaries, steps 3 and 4, come with the LLM step):
    1 fetch -> 2 de-duplicate + store -> 5 purge
Every stage can be repeated safely, so a late, doubled or half-finished run does no harm.
Logs are public (public repo): counts and source names only, never user data.
"""

from __future__ import annotations

import argparse
import logging
import os

from .config import load_sources
from .db import NewsDb
from .fetch import fetch_all

log = logging.getLogger("news")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="news")
    parser.add_argument("--dry-run", action="store_true", help="fetch only, do not touch the database")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)

    config = load_sources()
    articles, stats = fetch_all(config)
    log.info(
        "fetched %d articles from %d sources (%d failed)", stats.fetched, stats.sources, len(stats.failed)
    )
    if args.dry_run:
        for name in stats.failed:
            log.info("failed: %s", name)
        return 0

    database_url = os.environ.get("NEWS_DATABASE_URL")
    if not database_url:
        log.error("NEWS_DATABASE_URL is not set")
        return 2
    db = NewsDb(database_url)
    run_id = db.start_run()
    counts = {"fetched": stats.fetched, "new_articles": 0}
    try:
        db.sync_topics(
            [{"slug": t.slug, "label": t.label, "position": i} for i, t in enumerate(config.topics)]
        )
        counts["new_articles"] = db.upsert_articles([a.as_row() for a in articles])
        db.purge()
        note = f"{len(stats.failed)} of {stats.sources} sources failed" if stats.failed else None
        db.finish_run(run_id, "ok", counts, note)
        log.info("stored %d new articles", counts["new_articles"])
        return 0
    except Exception as error:
        # Record the failure for the UI, without details that could leak data into a public log.
        log.error("run failed: %s", type(error).__name__)
        try:
            db.finish_run(run_id, "failed", counts, "pipeline error")
        except Exception:  # noqa: BLE001, S110 - the database itself may be the problem
            pass
        return 1
    finally:
        db.close()
