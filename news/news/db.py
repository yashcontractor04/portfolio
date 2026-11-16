"""The only file that talks to Postgres. It calls functions in the `news` schema and
nothing else: the role `app_news` has no table access (see the migration)."""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb


class NewsDb:
    def __init__(self, database_url: str) -> None:
        # autocommit: every call below is its own transaction, so a crash between two
        # stages leaves the finished stages saved and nothing half-written.
        self.conn = psycopg.connect(database_url, autocommit=True, connect_timeout=15)

    def close(self) -> None:
        self.conn.close()

    def _one(self, sql: str, *params: object) -> object:
        row = self.conn.execute(sql, params).fetchone()
        return row[0] if row else None

    def start_run(self) -> int:
        return int(self._one("select news.start_run()"))  # type: ignore[arg-type]

    def finish_run(self, run_id: int, status: str, counts: dict, note: str | None = None) -> None:
        self._one("select news.finish_run(%s, %s, %s, %s)", run_id, status, Jsonb(counts), note)

    def sync_topics(self, topics: list[dict]) -> None:
        self._one("select news.sync_topics(%s)", Jsonb(topics))

    def upsert_articles(self, rows: list[dict]) -> int:
        return int(self._one("select news.upsert_articles(%s)", Jsonb(rows))) if rows else 0  # type: ignore[arg-type]

    def purge(self) -> None:
        self._one("select news.purge()")
