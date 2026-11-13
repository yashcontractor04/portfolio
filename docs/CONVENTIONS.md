# Conventions

Rules for anyone (human or AI) changing this repo. When a rule and a quick fix disagree, the
rule wins. To change a rule, change this file in the same commit and say why.

## General

- Simple and well known beats clever. Yash must be able to explain every part in an interview.
- €0/month. Never add a paid service or a new third-party service without asking Yash.
- Never commit secrets. Secrets live in environment variables; `.env.example` lists the names.
- Small commits with a clear message. Do not rewrite or squash existing migrations.
- No AI attribution in git: no `Co-Authored-By` trailers, no "Generated with" lines, no
  session links, in commits or pull requests. (The site footer's "AI-assisted" credit stays.)
- After each piece of work, explain to Yash what was built and why, in plain language.

## Security checklist (apply to every change)

- Validate all input on the server: zod in TypeScript, pydantic in Python. Client validation
  is for user experience only.
- The Supabase secret (service-role) key is used only in server code under
  `web/src/lib/supabase/admin.ts` and never imported from a client component.
- Rate-limit every route that sends email, creates accounts, or enqueues work
  (`check_rate_limit`).
- Render untrusted HTML/Markdown (GitHub READMEs, bookmarks) through a sanitiser. Never
  `dangerouslySetInnerHTML` with unsanitised content.
- Server-side fetches of user-supplied URLs must refuse private and link-local addresses.
- No tracking, no third-party scripts, no cookies other than the auth session.
- Log no personal data. Hash IP addresses with a secret (HMAC) before they touch the database.

## Database

- Every schema change is a new file in `supabase/migrations/` named
  `YYYYMMDDHHMMSS_what.sql`. Never edit a migration that has been applied.
- Every new table in `public`:
  1. `alter table ... enable row level security;`
  2. `revoke all on ... from anon, authenticated;` then grant the minimum.
  3. User-owned: `user_id uuid not null default auth.uid() references auth.users (id) on delete cascade`
     and the owner policy `user_id = (select auth.uid())` for `using` and `with check`.
  4. Children reference parents with a composite key `(parent_id, user_id)`.
  5. Length/size `check` constraints on every text and jsonb column users can write.
  6. A row cap trigger (`private.enforce_row_cap`) if users can insert freely.
- Functions: `security definer` only when needed, always with `set search_path = ''` and
  fully qualified names. Grant `execute` explicitly; nothing is public by default.
- Anything a browser must not do directly (cost, quota, queue) goes through a function.
- Every policy and function gets a test in `supabase/tests/`. Run
  `DATABASE_URL=... supabase/tests/run.sh` before committing.
- Ordered lists use `position text collate "C"` with the `fractional-indexing` package.

## Web (Next.js)

- This is Next.js 16 with Cache Components. It differs from older tutorials (`proxy.ts`
  instead of `middleware.ts`, no `dynamicParams`). Read `web/AGENTS.md` and the bundled docs in
  `web/node_modules/next/dist/docs/` before using an API you are not sure about.
- Fonts are self-hosted through `@fontsource-variable/*` (no requests to Google: GDPR).
- Tests use Node's built-in runner: `npm test` runs `src/**/*.test.ts`.

- App Router, TypeScript `strict`, no `any`. Server Components by default; add
  `"use client"` only where interaction needs it.
- Public pages are statically generated. Anything per-user is fetched client-side or in
  dynamic routes under the private area.
- All UI text goes through next-intl in both `en` and `de`. No hard-coded strings.
- Data access for each app sits behind one interface with two implementations: `demo`
  (sample data, guests) and `supabase` (logged in). Components never know which one they use.

## Design system

- Dark mode only. No light theme, no toggle.
- Colours, spacing, radii, type sizes come from tokens (CSS variables). Never write a raw hex
  value or pixel size in a component.
- Two themes from the same tokens: `multicolor` (one accent hue per section/app) and `mono`
  (single accent). Components use `--accent`, never a specific hue.
- Green and red mean gain and loss in charts and numbers. Never use them as decoration or accents.
- Numbers use tabular figures. Charts are thin lines, no gridline clutter.
- Main panels use the Window component (traffic-light chrome). Navigation is the menu bar,
  the dock and the ⌘K palette.
- Motion is subtle and optional: everything respects `prefers-reduced-motion`.
- Every interactive element is keyboard reachable with a visible focus ring.
- Chosen direction (2026-11-13): **"Ledger"** as the base: pure black ground (`#000`), white
  type, Inter for UI and headlines, big tabular numbers, 14 px radii, cursor spotlight + gentle
  lift on cards. Borrowed from the "Console" direction: JetBrains Mono for every number that
  is data (stat tiles, charts, tables), for terminals and for small meta labels; the ⌘K
  palette is a first-class way to navigate; and the `mono` theme's single accent is amber
  (`#F5B83D`). Token values live in `web/src/styles/tokens.css`.

## Python (worker, bots)

- Python 3.12+, type hints everywhere, `ruff` for lint and format, `pytest` for tests.
- One module per runner in `worker/runners/<slug>.py` exposing a pydantic `Params` model and
  `run(params, ctx) -> Result`. The worker never trusts params from the database.
- The worker talks to the database only through `queue.*` functions and the cache tables.
- Containers run as a non-root user, expose no ports, and restart automatically.

## How to add a project

1. Create `projects/<slug>/project.yaml` (see `projects/project.schema.json`; the examples
   in `projects/` cover every type). The folder name becomes the URL.
2. `static`: nothing more needed (the page shows the repo README); optionally add an MDX
   write-up and name it in `static.content`.
   `in-browser`: point `in_browser.source` at a repo path and a full commit SHA.
   `runner`: describe `inputs` and `demo.params`, then add `worker/runners/<slug>.py`.
   `bot-status`: set `bot.bot_slug`; the bot reports with `queue.bot_report`.
3. Run `python scripts/validate_manifests.py`. Push. Nothing else needs editing.

## How to add a private app

1. Migration: tables following the Database rules above, plus tests.
2. `web/src/apps/<name>/`: the data interface with `demo` and `supabase` implementations, UI
   components, and its accent hue token.
3. Register it in the app registry (dock + command palette read from there).
4. Add its tables to data export and confirm account deletion cascades.
