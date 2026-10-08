# Focus Project Tracker: Planning

Companion to `CLAUDE.md` (rules for Claude Code) and the PRD (requirements). This file explains why the app exists, how it is put together, and what is needed to build it. Stack choices are proposals until the owner confirms them.

## 1. Vision

**One line.** A personal dashboard that pulls every GitHub repo, shows milestone progress as a line graph, and keeps you on a single Focus Project until it is deployed.

**Problem.** Many repos get started and few get shipped. GitHub shows issues and milestones per repo, but it does not say which project to work on, or that one has gone quiet for nine days.

**Who it is for.** One person: a solo developer who tends to start new projects before finishing old ones. No teams, no sharing.

**What success looks like.**

| Measure                                               | Target                                         |
| ----------------------------------------------------- | ---------------------------------------------- |
| Projects marked Deployed or Finished                  | 1 per quarter                                  |
| Longest gap with no closed issue on the Focus Project | Under 7 days, excluding Away time              |
| Focus switches without a logged reason                | 0                                              |
| Weeks with at least one closed issue                  | Most weeks, not every day (no fixed work days) |

**Design principles.**

1. Focus first. The Focus Project owns the top of the screen; everything else is quiet.
2. GitHub stays the source of truth. The app adds accountability, not another task manager.
3. Friction on purpose. Switching focus costs a typed reason.
4. Done means deployed. A project ships when its checklist is ticked and its URL is set.

## 2. Architecture

### System overview

```
Browser (Next.js UI)
   |  server components + route handlers
   v
Next.js server (Vercel)  ---- Octokit ---->  GitHub REST API
   |                                          (repos, milestones, issues)
   v
Database (SQLite/Turso or Supabase Postgres)
   ^
   |  daily cron (Vercel Cron)  -> snapshot job
   |  optional webhook          -> refresh on issue/milestone events
```

### Components

| Component            | Responsibility                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| UI (React, Recharts) | Focus banner, progress graph, Today list, milestone ladder, calendar, other-project cards, switch-focus modal |
| Auth                 | GitHub OAuth sign-in; a single allowed GitHub user; session cookie                                            |
| GitHub client        | Fetch repos, milestones and issues with Octokit; cache responses; respect rate limits                         |
| Progress service     | Compute percent complete and current milestone; detect stalled and overdue states                             |
| Snapshot job         | Once a day, store open and closed counts per repo and milestone so the graph has history                      |
| Backfill job         | On first sync, rebuild past progress from issue `closed_at` dates                                             |
| Focus service        | Enforce one Focus Project; require and log a reason on every switch                                           |
| Notifier (phase 3)   | Daily Today-list message by the chosen channel                                                                |
| Data layer           | Small repository interface so a fixture mode can run the UI without network                                   |

### Data flow

1. Sign in with GitHub; store the token server-side only.
2. On page load, the server reads cached GitHub data, refreshing if stale.
3. The progress service turns issue counts into percent complete and milestone state.
4. The UI renders the Focus Project first; the graph reads stored snapshots plus today's live value.
5. Nightly cron writes a snapshot row per repo and milestone.
6. A focus switch posts a reason, the focus service updates statuses, and the change is logged.

### Data model

| Entity              | Key fields                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project             | repo id, name, status (focus, backlog, paused, deployed), deployed URL, started date, finished date                                                                                                |
| Milestone snapshot  | repo id, milestone id, date, open count, closed count, percent complete                                                                                                                            |
| Focus log           | project id, from date, to date, switch reason                                                                                                                                                      |
| Done checklist item | project id, label, checked                                                                                                                                                                         |
| Project priority    | `high_priority` flag on Project, set by the owner with a star; high priority projects are listed first and suggested first when picking a focus project. It never lets a second project take focus |
| Settings            | stall threshold in days (default 7), Away until date, notification channel                                                                                                                         |

Invariant: at most one project has status `focus`, enforced in the database as well as in code.

### Key decisions

| Decision                  | Choice                                   | Why                                         |
| ------------------------- | ---------------------------------------- | ------------------------------------------- |
| Source of truth for tasks | GitHub                                   | Avoids a second task system to keep in sync |
| Progress history          | Own daily snapshots plus backfill        | GitHub only gives current counts            |
| Users                     | Single user                              | Keeps auth and data simple                  |
| Rendering                 | Server-side data fetching, client charts | Token never reaches the browser             |
| Repos without milestones  | One implicit milestone of all issues     | Every repo still gets a graph               |

### Security

- GitHub scope: `read:user repo`, or `public_repo` if only public repos are needed. OAuth Apps cannot be read-only for private repos; the app only reads. A GitHub App with read-only permissions is the stricter alternative (open decision).
- Token and secrets in environment variables; never in the repo, client bundle or logs.
- Restrict sign-in to the owner's GitHub account.
- Validate and length-limit the switch reason input.

## 3. Technology stack

| Layer                   | Choice                                                           | Notes                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework               | Next.js (App Router) + TypeScript strict                         | One codebase for UI and server routes                                                                                                                           |
| GitHub API              | Octokit                                                          | REST endpoints `/user/repos`, `/repos/{owner}/{repo}/milestones`, `/repos/{owner}/{repo}/issues`                                                                |
| Auth                    | Auth.js with the GitHub provider                                 | Allow-list the owner's login                                                                                                                                    |
| Database                | SQLite (Turso) or Supabase Postgres                              | Small, relational, one user; pick one                                                                                                                           |
| ORM                     | Drizzle                                                          | Typed queries and migrations                                                                                                                                    |
| Charts                  | Hand-written SVG (`ProgressGraph`, `Ring`)                       | Replaces Recharts. The mockup's smooth graph, due markers and endpoint tag were simpler to draw directly than to bend a chart library into; no extra dependency |
| Styling                 | CSS variables for tokens, plus CSS modules (no Tailwind)         | Sage palette, light and dark themes, from `mockup.html`                                                                                                         |
| Fonts                   | Outfit (headings, numbers), Nunito (body)                        | Google Fonts                                                                                                                                                    |
| Hosting                 | Vercel                                                           | Includes Cron for the daily snapshot                                                                                                                            |
| Notifications (phase 3) | Resend for email, or Web Push                                    | Owner chooses; may be none                                                                                                                                      |
| Testing                 | Vitest, Playwright                                               | Unit tests for core logic, one end-to-end flow                                                                                                                  |
| Quality                 | ESLint, Prettier, `tsc --noEmit`, Husky, lint-staged, commitlint | Pre-commit hook runs dependency check, audit, type check, lint, tests and build; commit messages follow Conventional Commits                                    |

**Decided (Milestone 0):** database is Turso (SQLite); the app reads public and private repos (`repo` read scope); reminders go by email through Resend; a project can finish as Deployed, or be marked Finished without a URL when it has nothing to deploy.

## 4. Required tools

### To build

| Tool                                  | Purpose                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Node.js (current LTS) and npm or pnpm | Run and build the app                                                          |
| Git                                   | Version control; the project folder is not a repository yet, so run `git init` |
| GitHub account                        | Hosts the code; owns the repos the app reads                                   |
| GitHub OAuth App                      | Client id and secret for sign-in (set up in GitHub developer settings)         |
| Code editor and Claude Code           | Development                                                                    |
| A modern browser                      | Check every UI change against `mockup.html`                                    |

### Services and accounts

| Service                                | Needed for                | Phase |
| -------------------------------------- | ------------------------- | ----- |
| Vercel account                         | Hosting and cron          | 1     |
| Turso or Supabase account              | Database                  | 1     |
| Resend account (optional)              | Email reminders           | 3     |
| Vercel or Netlify API token (optional) | Deploy-status integration | 4     |

### Environment variables

Provide `.env.example` with placeholders only.

| Variable                                   | Purpose                          |
| ------------------------------------------ | -------------------------------- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth sign-in                    |
| `AUTH_SECRET`                              | Session signing                  |
| `ALLOWED_GITHUB_LOGIN`                     | The one user allowed to sign in  |
| `DATABASE_URL`                             | Database connection              |
| `CRON_SECRET`                              | Protect the daily snapshot route |
| `RESEND_API_KEY`                           | Email, phase 3 only              |

## 5. Build order

| Step | Outcome                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------- |
| 0    | `git init`, scaffold Next.js, tokens and fonts from the mockup, fixture mode with example data |
| 1    | GitHub sign-in, repo list, milestone graph per repo, set Focus Project (Phase 1)               |
| 2    | Today list, stall and overdue alerts, switch-focus reason, history backfill (Phase 2)          |
| 3    | Done checklist, Deployed status and URL, daily notification (Phase 3)                          |
| 4    | Ideal-pace line, streaks, weekly review, deploy status (Phase 4, optional)                     |

Rule from the PRD: this app is its own first Focus Project. Finish each phase before starting the next.

## 6. Risks

- Repos without milestones show no graph. Fallback: one implicit milestone.
- Strict focus can feel annoying and get ignored. Keep the override, log the reason.
- GitHub rate limit (5,000 requests per hour) is fine for one user if responses are cached.
- Graph history starts at first run unless backfilled; backfill on first sync.

## 7. Open questions

- Are tasks already GitHub Issues with Milestones, or should the app help create them? (still open)

Answered: database (Turso), repo access (public and private), reminders (email via Resend), meaning of finished (Deployed or marked Finished).
