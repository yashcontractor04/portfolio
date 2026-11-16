# Roadmap

Work top to bottom. An item is done only when its acceptance criteria pass. Tick the box and
add the date when you finish one. If you change scope, change this file in the same commit.

## Where we left off (2026-11-15)

**Live and confirmed by Yash on the real site:** homepage (EN/DE), project pages, the three
in-browser games, CV download, login with invite code, Workspace, Board (including two-tab sync
and undo), ⌘K palette, contact form (email arrives).

**Running but worth one more check:** the worker connects to Supabase from Docker on Yash's Mac.
Yash reported the demo-run setup as done; confirm once that Monte Carlo Pi → Run demo reaches
"finished" on the live site.

**Current setup, so nobody has to rediscover it:**
- Vercel project `portfolio`, root directory `web/`, auto-deploys from `main`. No custom domain yet.
- Vercel env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `IP_HASH_SECRET`, `RESEND_API_KEY`, `CONTACT_TO_EMAIL`.
- Supabase project ref `gxcqkezblanqpdvxevmo` (Frankfurt). All four migrations and
  `supabase/seed/runners.sql` are applied by hand. `app_worker` has a login. Yash's account is admin.
- Worker: `docker compose -f infra/docker-compose.yml up -d` on Yash's Mac, settings in the
  git-ignored `infra/.env`. Demo runs only work while it is running.
- Email: Resend without a domain, so mail only reaches Yash's own address. Signup confirmation
  mails use Supabase's built-in sender (also only Yash's address).

**Stock simulator, new setup (2026-11-16):** the simulator moved to its own repo,
`github.com/yashcontractor04/stock-simulator` (own Postgres, own API, written by Yash). In this
repo: its frontend is built on sample data (Dashboard tab + demo run), the snapshot table
migration is written, and `stock_sim.py` is an adapter skeleton. See ARCHITECTURE.md section 4a.
**Yash still has to apply** `supabase/migrations/20261116000001_sim_snapshots.sql` and the new
`supabase/seed/runners.sql` in the SQL editor. The worker does not need a rebuild for any of this
until the adapter is written.

**Next up, in order:**
1. Yash builds the simulator in its own repo, then writes the adapter here (item 19).
2. Run UI for logged-in users and the Runs app (item 20).
3. Oracle VM for the worker (item 23).
4. GitHub contribution heatmap on the homepage (item 4; needs a read-only `GITHUB_TOKEN` in Vercel).
5. Before inviting anyone else: privacy policy + Impressum (item 17), server-side rate limits on
   login/signup (item 11), admin panel for invites (item 12), review `npm audit` findings.
6. Focus, Habits, Stash (item 16); board labels and select fields (item 15).
7. Domain, then Resend domain verification so mail reaches other people (item 28).
8. Phase 4.

**Small things noticed, not yet done:** test the games in Safari and Firefox; Yash to proofread
both CV PDFs; undo on the Board does not cover deleting a column or board, and there is no redo;
unknown project URLs return status 200 with the not-found page.

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
   Dock, StatTile, bento tile, chips, cursor spotlight are built. CommandPalette (cmdk) added 2026-11-15. Still open:
   Sparkline and StatusDot as components, contrast audit.)
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
   Still open: GitHub heatmap (item 8), "runs this week" tile (needs Supabase).)
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
8. [x] 2026-11-15 **Contact form** (`web/src/app/api/contact/route.ts`; honeypot, time trap, rate limit,
   Resend REST API). Yash confirmed on the live site that the email arrives. Original scope:: server action, zod validation, honeypot + time trap, rate limit via
   `check_rate_limit`, sends through Resend to Yash. Needs Supabase + Resend env vars.
9. [x] 2026-11-13 **Deploy** to Vercel (root directory `web/`), env vars set in Vercel, never in git.

## Phase 2: accounts and private apps

10. [x] 2026-11-14 **Supabase project** (`app_worker` login set 2026-11-15) (EU region) created, migrations applied, `app_worker` login set.
11. [ ] **Auth** (2026-11-14: sign up with invite code, log in, log out, reset and update password are
    built as client-side Supabase Auth calls; Yash tested sign up, confirm, log in and log out on the live site. Still open:
    server-side rate limits via `check_rate_limit`, Resend as SMTP, redirect
    of logged-out users away from nothing-to-see pages.) Original scope: sign up with invite code, verify email, log in, reset password, log out.
    Rate limits on all auth routes. Accept: signup without a valid code fails with a clear message.
12. [ ] **Admin panel** (`/admin`, admin only): invites, users, quotas (`app_settings`,
    `profiles.daily_run_limit`), job queue + logs, bot status. Every action writes `audit_log`.
13. [x] 2026-11-14 **Demo/personal switch** (`web/src/apps/useStore.ts`): each app renders from sample data for guests and from the
    database after login, through one data-access interface per app.
14. [x] 2026-11-14 **Workspace** (confirmed by Yash on the live site: save, reload, nested delete.
    Still open: reorder/move pages, archive instead of delete.): BlockNote, nested pages, autosave (debounced), 1 MB document limit handled.
15. [ ] **Board** (2026-11-14: confirmed by Yash on the live site incl. two-tab sync; undo added
    2026-11-14. Built: drag and drop, optimistic updates,
    columns add/rename/colour/WIP/move/delete, custom fields, templates, card dialog. Still open: labels UI,
    select-type fields, dragging columns, undo for column/board deletion, redo.): dnd-kit, optimistic updates, Realtime sync across tabs, columns/labels/fields
    editable, WIP limits, templates (Uni assignments, Job applications, Blank).
    Accept: dragging in tab A moves the card in tab B within 2 s.
16. [ ] **Focus**, **Habits**, **Stash** (title/favicon fetch must block private IP ranges: SSRF).
17. [ ] **GDPR**: privacy policy, Impressum (after Yash decides the address question), data
    export (JSON download of every table) and account deletion.

## Phase 3: runner system

18. [x] 2026-11-15 **Worker** (`worker/`): loop over `queue.claim_job`, pydantic validation, per-job
    timeout in a child process, heartbeat, logs, retries; Dockerfile (non-root, read-only
    filesystem) + `infra/docker-compose.yml`. Tested end to end against a local Postgres with the
    `app_worker` role. 2026-11-15: the Docker image builds and connects to Supabase on Yash's Mac.
    Still open: the "kill the worker mid-job, job is re-queued" acceptance test on real infra.
19. [ ] **Stock simulator: connect the separate backend.** The simulator itself is built in
    `github.com/yashcontractor04/stock-simulator` and follows that repo's `docs/07-roadmap.md`.
    **Yash writes the adapter himself. Do not write it for him unless he asks.**
    - [x] 2026-11-16 Manifest with the new inputs (capital, risk level, time span, industries,
      themes), `dashboard: sim-snapshot`, repo link.
    - [x] 2026-11-16 Dashboard tab and demo run on sample data generated from the simulator's
      `openapi.yaml` (`web/scripts/gen-sim-mock.mjs`); EN + DE; switch `SIM_DATA`.
    - [x] 2026-11-16 Migration `sim_snapshots` + `sim.publish_snapshot()` + role `sim_publisher`,
      with tests. `price_bars` dropped. Not applied to the real project yet (Yash, by hand).
    - [ ] Yash: set a login password for `sim_publisher` when the simulator is ready to publish
      (`alter role sim_publisher login password '<long random>';`).
    - [ ] Yash: write the adapter in `worker/worker/runners/stock_sim.py` (steps in its
      docstring; simulator roadmap milestone M5) with tests using a fake HTTP transport.
    - [ ] Yash: on the VM, `docker network create sim-net`, start the worker with
      `infra/docker-compose.sim.yml`, set `SIM_API_URL` and `SIM_SERVICE_TOKEN` in `infra/.env`.
    - [ ] Go live: `status: live` in the manifest, `python scripts/sync_runners.py`, apply the
      SQL, set `SIM_DATA=live` in Vercel and redeploy.
    - Accept: the dashboard shows the simulator's real snapshot with yesterday's date; a guest
      demo run reaches "finished" with a real result; with the simulator stopped, a run fails
      with a clear message and the dashboard still loads.
    - Later, not planned in detail: admin pages that send "admin command" jobs through the
      same queue; warning texts translated by code instead of shown in English.
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

## Known gaps to keep in mind

- Migrations and `supabase/seed/runners.sql` must be applied by hand in the Supabase SQL editor
  (there is no automated migration deploy yet). Waiting: `20261116000001_sim_snapshots.sql`.
- The stock simulator pages show sample data (labelled on the page) until `SIM_DATA=live`.
- Simulator warnings on the dashboard are shown in English in the German version too.
- `npm audit` reports 8 moderate findings in web dependencies; not yet reviewed.

- Unknown project URLs render the not-found page with `noindex` but HTTP status 200 (a side
  effect of Cache Components streaming). Fix in Phase 4 with SEO work.
- CSP allows inline scripts (`'unsafe-inline'`) because static pages cannot carry nonces.
- Prettier is not set up yet; ESLint is.

- A job that fails for a system reason still consumes one run of the user's quota.
- `usage_daily` uses UTC days.
- No analytics yet. If added: cookieless and free only.
