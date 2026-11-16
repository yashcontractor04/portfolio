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

## Who built what

I want to be clear about this, because the site is meant to show what I can do.

**Most of the code in this repo was written by an AI model (Claude), not by me.** That
includes the Next.js frontend, the database schema with its security rules, the job queue,
the worker and the tests. I do not know TypeScript well yet.

What I did:

- The idea and the scope: what the site is for, which apps it has, what it should feel like.
- The decisions. For each bigger choice (stack, design direction, security model, budget of
  €0) I reviewed options with their trade-offs and picked one. They are written down in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), each with what I gave up.
- The content: my CV, the project texts, and all of the Python projects that run on the site.
- Setting it up and running it: the accounts, applying the database migrations by hand,
  running the worker, testing each feature in the browser.
- Reading the code afterwards until I can explain how it works. That is still in progress.

So this repo shows how I plan, decide and work with an AI model on a real, deployed system.
It does not show how I write a web app from scratch.

For code I write myself, look at
[stock-simulator](https://github.com/yashcontractor04/stock-simulator) (the backend is mine,
its README says which parts are not) and
[100-days-of-python](https://github.com/yashcontractor04/100-days-of-python).
