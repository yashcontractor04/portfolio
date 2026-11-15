# portfolio

Personal site of Yash Contractor: a portfolio where the projects actually run, plus an
invite-only area with personal productivity apps. Built in phases; see the roadmap.

| Read this | For |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | diagrams, data flow, key decisions |
| [docs/ROADMAP.md](docs/ROADMAP.md) | what is done and what comes next |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | code, database, security and design rules |

## What works today

- Public site in English and German: homepage from `content/cv.yaml`, one page per project.
- Three Python games running in the browser (Pyodide in a Web Worker, xterm.js).
- CV PDFs built from the same YAML file by GitHub Actions (Typst).
- Invite-only accounts (Supabase Auth) with two private apps: Workspace (notes) and Board (kanban).
  Guests see a demo with sample data.
- Postgres job queue with quotas enforced in the database, a Python worker in Docker, and a
  demo run on the site (Monte Carlo Pi).

## Run the worker

```bash
cp infra/.env.example infra/.env        # fill in WORKER_DATABASE_URL
docker compose -f infra/docker-compose.yml up --build -d
docker compose -f infra/docker-compose.yml logs -f worker
```

## Run the checks locally

```bash
docker run -d --name pg-test -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
pip install pyyaml jsonschema && python scripts/validate_manifests.py
cd worker && pip install -e ".[dev]" && pytest -q && cd ..
cd web && npm ci && npm run lint && npm test && npm run build
```

Stack: Next.js, Supabase (Postgres, Auth, Realtime), Python workers in Docker, GitHub Actions.
Built with AI assistance.
