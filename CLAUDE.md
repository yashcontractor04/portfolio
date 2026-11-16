# Instructions for AI assistants working in this repo

Read these three files before changing anything, and follow them:

1. `docs/ARCHITECTURE.md`: how the system fits together and why. Do not change a key decision
   without asking Yash.
2. `docs/CONVENTIONS.md`: rules for code, database, security and the design system.
3. `docs/ROADMAP.md`: what to build next, in order, with acceptance criteria. Tick items off
   and update it in the same commit as the work.

How to work with Yash:

- He is a CS student and this site is his talking point with recruiters. He must understand
  the code: after each piece of work, explain what you built and why, and give him a manual
  test checklist and a few interview talking points.
- Ask instead of guessing when something is ambiguous.
- Budget is €0/month. Ask before adding any service, paid or free.
- Take security seriously on every change (checklist in CONVENTIONS.md). Never commit secrets.
- Do not add `Co-Authored-By` trailers, "Generated with ..." lines or session links to commits
  or pull requests.
- The stock simulator is a separate repo (`github.com/yashcontractor04/stock-simulator`) that
  Yash writes himself. Never put simulator code in this repo. Here only its website side
  lives: the pages in `web/src/components/sim/` and `web/src/lib/sim/` (yours to change), the
  snapshot table, and the adapter `worker/worker/runners/stock_sim.py`, which Yash also writes
  himself. Help when he asks; do not implement the adapter for him. See ARCHITECTURE.md 4a.
- The simulator pages must match the simulator's API contract (`docs/openapi.yaml` in that
  repo). If the contract changes, re-run `web/scripts/gen-sim-mock.mjs` and update
  `web/src/lib/sim/schema.ts` in the same commit.
- The worker runs on Yash's machine. Do not stop, restart or rebuild it; say when a change
  needs a rebuild. Migrations are applied by Yash by hand: list exactly what to run.
- Legal choices (Impressum address, privacy wording) are his to make; lay out options.

Before you commit:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
python scripts/validate_manifests.py && python scripts/sync_runners.py --check
cd worker && ruff check . && ruff format --check . && pytest -q && cd ..
cd web && npm run lint && npm test && npm run build && npm run typecheck
```
