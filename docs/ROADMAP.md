# Roadmap

Work top to bottom. An item is done only when its acceptance criteria pass. Tick the box and
add the date when you finish one. If you change scope, change this file in the same commit.

## Done

- [x] 2026-11-13 Database schema for all phases, with RLS, quota and queue functions
      (`supabase/migrations`). 84 SQL tests pass (`supabase/tests/run.sh`).
- [x] 2026-11-13 Project manifest format (`projects/project.schema.json`) + validator.
- [x] 2026-11-13 `content/cv.yaml` (EN + DE) from Yash's German CV.
- [x] 2026-11-13 CI: SQL tests + manifest validation on every push.

- [x] 2026-11-13 Manifests for the first projects: `stock-sim`, `badminton-monitor`, `hangman`,
      `blackjack`, `coffee-machine`, `stock-news-alert`, `flight-club`.

## Phase 1: public site (target: live on a vercel.app URL)

1. [ ] **Design tokens + base components.** Direction chosen 2026-11-13: "Ledger" base with
   "Console" details (see CONVENTIONS.md, Design system).
   - Tokens as CSS variables in `web/src/styles/tokens.css`; themes `multicolor` and `mono`
     switchable via `data-theme`; dark only.
   - Components: Window (traffic-light chrome), MenuBar, Dock, StatTile, BentoTile, Chip,
     Sparkline, StatusDot, CommandPalette (cmdk), cursor spotlight.
   - Accept: keyboard reachable, visible focus ring, contrast ≥ 4.5:1 for text,
     `prefers-reduced-motion` disables spotlight and lift.
2. [ ] **Next.js scaffold in `web/`**: App Router, TS strict, Tailwind, shadcn/ui, next-intl
   with `/en` and `/de`, ESLint + Prettier, security headers (CSP, HSTS, frame-ancestors,
   Referrer-Policy, Permissions-Policy).
   - Accept: `npm run lint && npm run typecheck && npm run build` pass in CI.
3. [ ] **Manifest loader** (`web/src/lib/projects.ts`): reads `projects/*/project.yaml`, validates
   with zod (mirror of the JSON schema), unit tests for valid and invalid manifests.
4. [ ] **Homepage**: hero from `cv.yaml` + stat tiles, bento project grid with filters, skills
   chips, footer with GitHub heatmap (GitHub API, cached 1 day), Download CV, credit line.
   - Accept: statically generated; Lighthouse performance ≥ 90 on mobile.
5. [ ] **Project pages** with tabs Overview (README from GitHub, sanitised, revalidated hourly),
   Run, Results, How it works. `static` type renders MDX.
6. [ ] **In-browser runner**: Pyodide in a Web Worker + xterm.js, working `input()`.
   Projects: `hangman`, `blackjack`, `coffee-machine` (manifests exist, pinned by commit SHA).
   Set their status to `live` once they run.
   - Accept: an interactive game is playable; the page stays responsive during a busy loop;
     a Stop button terminates the worker.
7. [ ] **CV pipeline**: Typst template in `content/cv/`, GitHub Action builds `cv-en.pdf` and
   `cv-de.pdf` from `cv.yaml` and publishes them to `web/public/cv/`.
   - Accept: editing `cv.yaml` and pushing updates both PDFs and the homepage.
8. [ ] **Contact form**: server action, zod validation, honeypot + time trap, rate limit via
   `check_rate_limit`, sends through Resend to Yash. Needs Supabase + Resend env vars.
9. [ ] **Deploy** to Vercel (root directory `web/`), env vars set in Vercel, never in git.

## Phase 2: accounts and private apps

10. [ ] **Supabase project** (EU region) created, migrations applied, `app_worker` login set.
11. [ ] **Auth**: sign up with invite code, verify email, log in, reset password, log out.
    Rate limits on all auth routes. Accept: signup without a valid code fails with a clear message.
12. [ ] **Admin panel** (`/admin`, admin only): invites, users, quotas (`app_settings`,
    `profiles.daily_run_limit`), job queue + logs, bot status. Every action writes `audit_log`.
13. [ ] **Demo/personal switch**: each app renders from sample data for guests and from the
    database after login, through one data-access interface per app.
14. [ ] **Workspace**: BlockNote, nested pages, autosave (debounced), 1 MB document limit handled.
15. [ ] **Board**: dnd-kit, optimistic updates, Realtime sync across tabs, columns/labels/fields
    editable, WIP limits, templates (Uni assignments, Job applications, Blank).
    Accept: dragging in tab A moves the card in tab B within 2 s.
16. [ ] **Focus**, **Habits**, **Stash** (title/favicon fetch must block private IP ranges: SSRF).
17. [ ] **GDPR**: privacy policy, Impressum (after Yash decides the address question), data
    export (JSON download of every table) and account deletion.

## Phase 3: runner system

18. [ ] **Worker** (`worker/`): loop over `queue.claim_job`, pydantic validation, per-job timeout
    in a subprocess, heartbeat thread, logs, retries; Dockerfile (non-root user, read-only
    filesystem) + `infra/docker-compose.yml`.
    Accept: kill the worker mid-job and the job is re-queued and finishes on restart.
19. [ ] **Stock simulator v1** as runner `stock-sim`: fixed allocation, periodic rebalancing,
    benchmark, results as summary + series + table. Prices cached in `price_bars`.
    Decide the free data source with Yash (check its terms for redistribution).
20. [ ] **Run UI**: form generated from the manifest, live status via Realtime, results page
    with charts, quota display, "not financial advice" note, schedules, bring-your-own-key.
21. [ ] **Demo run** end to end for guests, rate-limited per IP.
22. [ ] **`scripts/sync-runners`** in the deploy workflow.
23. [ ] **Oracle VM**: deploy via GitHub Actions + SSH, auto-restart, firewall closed inbound.
24. [ ] **Badminton monitor** status page, bot reports through `queue.bot_report`.
25. [ ] **Backups**: weekly `pg_dump` GitHub Action, encrypted artifact; keep-alive workflow.

## Phase 4

26. [ ] Flight tracker runner.
27. [ ] Optional end-to-end encryption for Workspace (`workspace_keys`, `content_cipher`).
28. [ ] SEO, Open Graph images, custom domain, Resend domain verification.

## Known gaps to keep in mind

- A job that fails for a system reason still consumes one run of the user's quota.
- `usage_daily` uses UTC days.
- No analytics yet. If added: cookieless and free only.
