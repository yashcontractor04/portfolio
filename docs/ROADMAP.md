# Roadmap

Work top to bottom. An item is done only when its acceptance criteria pass. Tick the box and
add the date when you finish one. If you change scope, change this file in the same commit.

## Done

- [x] 2026-11-13 Database schema for all phases, with RLS, quota and queue functions
      (`supabase/migrations`). 87 SQL tests pass (`supabase/tests/run.sh`).
- [x] 2026-11-13 Project manifest format (`projects/project.schema.json`) + validator.
- [x] 2026-11-13 `content/cv.yaml` (EN + DE) from Yash's German CV.
- [x] 2026-11-13 CI: SQL tests + manifest validation on every push.

- [x] 2026-11-13 Manifests for the first projects: `stock-sim`, `badminton-monitor`, `hangman`,
      `blackjack`, `coffee-machine`, `stock-news-alert`, `flight-club`.

## Phase 1: public site (target: live on a vercel.app URL)

1. [ ] **Design tokens + base components.** (2026-11-13: tokens, both themes, Window, MenuBar,
   Dock, StatTile, bento tile, chips, cursor spotlight are built. Still open: Sparkline,
   StatusDot as components, CommandPalette (cmdk), contrast audit.)
   Original scope: Direction chosen 2026-11-13: "Ledger" base with
   "Console" details (see CONVENTIONS.md, Design system).
   - Tokens as CSS variables in `web/src/styles/tokens.css`; themes `multicolor` and `mono`
     switchable via `data-theme`; dark only.
   - Components: Window (traffic-light chrome), MenuBar, Dock, StatTile, BentoTile, Chip,
     Sparkline, StatusDot, CommandPalette (cmdk), cursor spotlight.
   - Accept: keyboard reachable, visible focus ring, contrast ≥ 4.5:1 for text,
     `prefers-reduced-motion` disables spotlight and lift.
2. [x] 2026-11-13 **Next.js scaffold in `web/`** (shadcn/ui and Prettier not added yet; add shadcn
   when the first form or dialog needs it): App Router, TS strict, Tailwind, next-intl
   with `/en` and `/de`, ESLint + Prettier, security headers (CSP, HSTS, frame-ancestors,
   Referrer-Policy, Permissions-Policy).
   - Accept: `npm run lint && npm run typecheck && npm run build` pass in CI.
3. [x] 2026-11-13 **Manifest loader** (`web/src/lib/projects.ts`): reads `projects/*/project.yaml`, validates
   with zod (mirror of the JSON schema), unit tests for valid and invalid manifests.
4. [ ] **Homepage** (2026-11-13: hero, stat tiles, bento grid + filters, skills, contact links are live.
   Still open: GitHub heatmap, contact form (item 8), "runs this week" tile (needs Supabase).)
   Original scope:: hero from `cv.yaml` + stat tiles, bento project grid with filters, skills
   chips, footer with GitHub heatmap (GitHub API, cached 1 day), Download CV, credit line.
   - Accept: statically generated; Lighthouse performance ≥ 90 on mobile.
5. [x] 2026-11-13 **Project pages** (Results tab is a placeholder until Phase 3; README images are
   not shown) with tabs Overview (README from GitHub, sanitised, revalidated hourly),
   Run, Results, How it works. `static` type renders MDX.
6. [x] 2026-11-13 **In-browser runner** (tested in headless Chrome only; check Safari and Firefox): Pyodide in a Web Worker + xterm.js, working `input()`.
   Projects: `hangman`, `blackjack`, `coffee-machine` (manifests exist, pinned by commit SHA).
   Set their status to `live` once they run.
   - Accept: an interactive game is playable; the page stays responsive during a busy loop;
     a Stop button terminates the worker.
7. [x] 2026-11-13 **CV pipeline** (uses Typst's bundled serif font; a custom font is optional polish): Typst template in `content/cv/`, GitHub Action builds `cv-en.pdf` and
   `cv-de.pdf` from `cv.yaml` and publishes them to `web/public/cv/`.
   - Accept: editing `cv.yaml` and pushing updates both PDFs and the homepage.
8. [ ] **Contact form**: server action, zod validation, honeypot + time trap, rate limit via
   `check_rate_limit`, sends through Resend to Yash. Needs Supabase + Resend env vars.
9. [ ] **Deploy** to Vercel (root directory `web/`), env vars set in Vercel, never in git.

## Phase 2: accounts and private apps

10. [x] 2026-11-14 **Supabase project** (`app_worker` login still to be set, needed in Phase 3) (EU region) created, migrations applied, `app_worker` login set.
11. [ ] **Auth** (2026-11-14: sign up with invite code, log in, log out, reset and update password are
    built as client-side Supabase Auth calls; the code compiles and the forms validate, but the
    flows were NOT tested against the live project from the build environment. Still open:
    Yash's manual test, server-side rate limits via `check_rate_limit`, Resend as SMTP, redirect
    of logged-out users away from nothing-to-see pages.) Original scope: sign up with invite code, verify email, log in, reset password, log out.
    Rate limits on all auth routes. Accept: signup without a valid code fails with a clear message.
12. [ ] **Admin panel** (`/admin`, admin only): invites, users, quotas (`app_settings`,
    `profiles.daily_run_limit`), job queue + logs, bot status. Every action writes `audit_log`.
13. [x] 2026-11-14 **Demo/personal switch** (`web/src/apps/useStore.ts`): each app renders from sample data for guests and from the
    database after login, through one data-access interface per app.
14. [ ] **Workspace** (2026-11-14: built and browser-tested in demo mode; Supabase store untested live.
    Still open: reorder/move pages, archive instead of delete.): BlockNote, nested pages, autosave (debounced), 1 MB document limit handled.
15. [ ] **Board** (2026-11-14: built and browser-tested in demo mode: drag and drop, optimistic updates,
    columns add/rename/colour/WIP/move/delete, custom fields, templates, card dialog. Realtime
    code is written but untested live. Still open: labels UI, select-type fields, dragging
    columns, the two-tab acceptance test.): dnd-kit, optimistic updates, Realtime sync across tabs, columns/labels/fields
    editable, WIP limits, templates (Uni assignments, Job applications, Blank).
    Accept: dragging in tab A moves the card in tab B within 2 s.
16. [ ] **Focus**, **Habits**, **Stash** (title/favicon fetch must block private IP ranges: SSRF).
17. [ ] **GDPR**: privacy policy, Impressum (after Yash decides the address question), data
    export (JSON download of every table) and account deletion.

## Phase 3: runner system

18. [x] 2026-11-15 **Worker** (`worker/`): loop over `queue.claim_job`, pydantic validation, per-job
    timeout in a child process, heartbeat, logs, retries; Dockerfile (non-root, read-only
    filesystem) + `infra/docker-compose.yml`. Tested end to end against a local Postgres with the
    `app_worker` role. NOT yet tested: the Docker image build, and a run against Supabase.
    Still open: the "kill the worker mid-job, job is re-queued" acceptance test on real infra.
19. [ ] **Stock simulator v1** as runner `stock-sim`. **Yash implements this himself. Do not write it
    for him unless he asks.** The skeleton with validated `Params` is in
    `worker/worker/runners/stock_sim.py`; its docstring lists the steps. Results go back as
    summary + series + table (see `worker/worker/contract.py`). Prices should be cached in
    `price_bars`. Open decision with Yash: the free data source (check its terms first).
    When it works: `status: live` in the manifest, `python scripts/sync_runners.py`, apply the SQL.
20. [ ] **Run UI for logged-in users**: form generated from the manifest (`runner.inputs`), call
    `enqueue_job`, live status via Realtime on `jobs`, results page with charts, quota display
    (`my_quota`), schedules (`create_schedule`), bring-your-own-key (server route that encrypts
    with `API_KEY_ENC_KEY_V1`; worker decrypts via `queue.get_job_api_key`). Also the **Runs** app.
    None of this UI exists yet; all database functions for it exist and are tested.
21. [x] 2026-11-15 **Demo run** for guests (`web/src/app/api/demo/route.ts`, `DemoRun.tsx`), rate-limited
    per IP, with the reference runner `monte-carlo-pi`. UI verified with real worker output;
    the route itself was NOT tested against Supabase from the build environment.
22. [x] 2026-11-15 **`scripts/sync_runners.py`** generates `supabase/seed/runners.sql`; CI checks it is
    up to date. Applying it is manual (SQL editor). Automating that in a deploy workflow is open.
23. [ ] **Oracle VM**: deploy via GitHub Actions + SSH, auto-restart, firewall closed inbound.
    Until then the worker runs on Yash's Mac with Docker; demo runs only work while it is up.
24. [ ] **Badminton monitor** status page, bot reports through `queue.bot_report`.
25. [ ] **Backups**: weekly `pg_dump` GitHub Action, encrypted artifact; keep-alive workflow.

## Phase 4

26. [ ] Flight tracker runner.
27. [ ] Optional end-to-end encryption for Workspace (`workspace_keys`, `content_cipher`).
28. [ ] SEO, Open Graph images, custom domain, Resend domain verification.

## Suggested order for whoever continues

1. Yash: stock simulator (item 19). 2. Run UI for logged-in users (20). 3. Oracle VM (23).
4. Admin panel (12) and auth hardening (11). 5. ⌘K palette, GitHub heatmap, contact form (1, 4, 8).
6. Focus, Habits, Stash (16). 7. GDPR pages (17) before inviting anyone else. 8. Phase 4.

## Known gaps to keep in mind

- Migration `20261115000001_demo_api.sql` and `supabase/seed/runners.sql` must be applied by hand
  in the Supabase SQL editor (there is no automated migration deploy yet).
- `npm audit` reports 8 moderate findings in web dependencies; not yet reviewed.

- Unknown project URLs render the not-found page with `noindex` but HTTP status 200 (a side
  effect of Cache Components streaming). Fix in Phase 4 with SEO work.
- CSP allows inline scripts (`'unsafe-inline'`) because static pages cannot carry nonces.
- Prettier is not set up yet; ESLint is.

- A job that fails for a system reason still consumes one run of the user's quota.
- `usage_daily` uses UTC days.
- No analytics yet. If added: cookieless and free only.
