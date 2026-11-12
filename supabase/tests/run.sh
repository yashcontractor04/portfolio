#!/usr/bin/env bash
# Runs all migrations and SQL tests against a throwaway database.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
# The target must be an EMPTY scratch Postgres (>= 15). Never point this at production.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to a scratch Postgres}"
here="$(cd "$(dirname "$0")" && pwd)"
db="portfolio_test_$$"
base="${DATABASE_URL%/*}"

psql "$DATABASE_URL" -qc "create database $db"
trap 'psql "$DATABASE_URL" -qc "drop database if exists $db with (force)" >/dev/null' EXIT

run() { psql "$base/$db" -v ON_ERROR_STOP=1 -q -f "$1" 2>&1; }

run "$here/00_supabase_stubs.sql" >/dev/null
for f in "$here"/../migrations/*.sql; do
  echo "migrate $(basename "$f")"
  run "$f" >/dev/null
done
for f in "$here"/[1-9]*.sql; do
  echo "test    $(basename "$f")"
  run "$f" | grep -E 'ok   -|FAIL|ERROR' | sed 's/^psql:[^ ]* NOTICE:  //'
done
echo "all tests passed"
