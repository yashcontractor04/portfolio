"""The only file that talks to Postgres. It calls functions in the `news` schema and
nothing else: the role `app_news` has no table access (see the migration)."""

from __future__ import annotations

import psycopg
from psycopg.rows import dict_row
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

    def _rows(self, sql: str, *params: object) -> list[dict]:
        with self.conn.cursor(row_factory=dict_row) as cursor:
            return cursor.execute(sql, params).fetchall()

    def last_ok_run(self):
        return self._one("select news.last_ok_run()")

    def users_to_rank(self) -> list[dict]:
        return self._rows("select * from news.users_to_rank()")

    def candidates(self, user_id: object, hours: int, limit: int) -> list[dict]:
        return self._rows("select * from news.candidates(%s, %s, %s)", user_id, hours, limit)

    def write_feed(self, user_id: object, items: list[dict]) -> int:
        return int(self._one("select news.write_feed(%s, %s)", user_id, Jsonb(items))) if items else 0  # type: ignore[arg-type]

    def unsummarised(self, limit: int) -> list[dict]:
        return self._rows("select * from news.unsummarised(%s)", limit)

    def save_summaries(self, items: list[dict]) -> int:
        return int(self._one("select news.save_summaries(%s)", Jsonb(items))) if items else 0  # type: ignore[arg-type]

    def reserve_llm_request(self, model: str, daily_cap: int) -> bool:
        return bool(self._one("select news.reserve_llm_request(%s, %s)", model, daily_cap))
