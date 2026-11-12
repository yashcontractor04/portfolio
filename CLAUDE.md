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
- Legal choices (Impressum address, privacy wording) are his to make; lay out options.

Before you commit:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
python scripts/validate_manifests.py
# once web/ exists: cd web && npm run lint && npm run typecheck && npm test
```
