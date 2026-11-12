# portfolio

Personal site of Yash Contractor: a portfolio where the projects actually run, plus an
invite-only area with personal productivity apps. Built in phases; see the roadmap.

| Read this | For |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | diagrams, data flow, key decisions |
| [docs/ROADMAP.md](docs/ROADMAP.md) | what is done and what comes next |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | code, database, security and design rules |

## What works today

- Database schema with row-level security, quota enforcement and a Postgres job queue
  (`supabase/migrations`), covered by SQL tests.
- Project manifest format and validator (`projects/`, `scripts/validate_manifests.py`).
- CV data in one file (`content/cv.yaml`).

## Run the checks locally

```bash
docker run -d --name pg-test -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
pip install pyyaml jsonschema && python scripts/validate_manifests.py
```

Stack: Next.js, Supabase (Postgres, Auth, Realtime), Python workers in Docker, GitHub Actions.
Built with AI assistance.
