# Focus Trail: Planning

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

| Entity                 | Key fields                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                | repo id, name, status (focus, backlog, paused, deployed), deployed URL, started date, finished date                                                                                                |
| Milestone snapshot     | repo id, milestone id, date, open count, closed count, percent complete                                                                                                                            |
| Focus log              | project id, from date, to date, switch reason                                                                                                                                                      |
| Done checklist item    | project id, label, checked                                                                                                                                                                         |
| Project link (Phase 5) | `github_project_number` and `github_project_id` on Project: the repo's GitHub Project, both null until the repo is onboarded. No task data is stored                                               |
| Project type           | `kind` on Project: `project` (default), `practice` or `school`. Only a project can take focus or be suggested; practice and school work is tracked in its own section                              |
| Project priority       | `high_priority` flag on Project, set by the owner with a star; high priority projects are listed first and suggested first when picking a focus project. It never lets a second project take focus |
| Settings               | stall threshold in days (default 7), Away until date, notification channel                                                                                                                         |

Invariant: at most one project has status `focus`, enforced in the database as well as in code.

### GitHub Project as the source of truth (planned, Phase 5)

Planned 2026-10-21 and revised the same day at the owner's request; nothing here is built. Today the app reads each repo's milestones and issues directly and cannot add tasks, and the owner runs `npm run tasks:sync` by hand to turn a `TASKS.md` into issues. Because the app is to gain "add a task" and "add a milestone", the owner chose **the repo's GitHub Project as the source of truth**. Two masters that both accept edits would drift apart, so after onboarding there is exactly one: the Project.

```
              onboarding (once)                         every change after
TASKS.md  ------------------------>  GitHub Project  <----------------  web app (add task, add milestone)
   ^        + added lines (import)   (issues, milestones, Status)  <----  GitHub itself, gh, the sync command
   |                                        |
   +------------ generated copy <-----------+      the dashboard reads the Project
```

**Roles after onboarding**

- **GitHub Project (with its issues and milestones): the truth.** Title, Status, milestone and order are whatever the Project says. The app stores no copy of any task.
- **`TASKS.md`: a generated copy**, so a Claude session can read the plan cold, offline, with no token. It carries a header saying it is generated and how to add a task. Sections that are not milestones (Ongoing, "Before each commit") are kept exactly as they are.
- **The app** can add a task or a milestone (creates the issue or milestone on GitHub, adds the issue to the Project). It cannot edit, reorder or delete tasks; that stays on GitHub. This is a deliberate change to product rule 4, which said not to build task editing; the app still keeps no task data of its own.

**Conflict rules** (written as pure code in `src/lib/truth.ts`, tested)

1. The Project wins on title, Status, milestone and order.
2. A task line added to `TASKS.md` that the Project does not have is **imported** (additions only). This is what lets a Claude session that cannot reach the network still add work: it writes a new line under "Discovered during work", and the next sync creates the issue. This is how the repo's AI rule respects what the app adds, and the app respects what the AI adds.
3. A tick, rename or removal made by editing `TASKS.md` is **ignored**: the next generation puts the Project's version back, and the daily job reports it as drift. To finish a task, close the issue (or move it to Done in the Project).
4. Nothing is ever deleted from GitHub and nothing is reopened by the sync.

**Moving data**

- **Onboarding (once per repo):** find the repo's Project by title and repo; if there is none, create it (named after the repo, linked to it, Status Todo, In progress, Done); import the existing `TASKS.md` (milestones and issues, ticked tasks closed and Done); remember the Project on the app's side. A dry run comes first and the owner confirms.
- **Project to `TASKS.md`:** an exporter writes the milestone sections in the format `src/lib/tasks-md.ts` already parses, so a round trip returns the same tasks. Delivery is open until the spike: a scheduled workflow plus a "Sync now" button that starts it, or the app opening a pull request. It never pushes straight to a protected branch.
- **`TASKS.md` to Project (additions):** a workflow on every push that touches `TASKS.md`, and the same code behind the app's "Sync now".
- **Dashboard:** an onboarded repo reads progress from the Project's items; a repo with no Project keeps reading its issues, so repos are onboarded one at a time without breaking anything.

**Rules for onboarded repos** live in `docs/onboarding-repos.md` (to paste into each repo's `CLAUDE.md`) with the workflow templates. The app checks daily for drift and shows it on the repo card.

**Permissions (the hard part).** Projects are GraphQL only and need the `read:project` and `project` scopes (see the spike findings below). Writing also ends the promise that the app only reads. **Decision (forced by the spike, 2026-10-23): add `project` to the OAuth App scope.** A GitHub App cannot be given access to a personal account's Projects, and an App only becomes an option if the boards move into a GitHub organization. The workflows use a personal access token stored as a repo secret. Guard rails: the app never writes without a confirm step showing the exact change, never edits or deletes tasks, and keeps the token server-only.

**Spike findings (2026-10-23).** Researched from GitHub's own documentation (the copy in the `github/docs` repository, read 2026-10-23); nothing was run against a real Project, because this session has no access to the owner's token. What is solid, and what still needs a live check:

- **Scopes (documented).** Reading a Project through GraphQL needs the `read:project` scope; creating or editing needs `project`. A token without them is refused. The current sign-in asks for `read:user repo`, so it has neither: Phase 5 means asking for new scopes, and the owner must sign out and back in once to grant them.
- **GitHub Apps do not fit a personal account (documented).** The docs say a GitHub App is the recommended way to reach an _organization_ project and a personal access token the recommended way to reach a _user_ project, and the App permission that matters is "organization projects" (repository-project permission "will not be sufficient"). There is no App permission for a personal account's Projects. **So option (b) is effectively closed for this owner's Projects**, unless the boards move into a GitHub organization. Not verified with a real App; the probe below can confirm it.
- **Actions cannot reach Projects with the default token (documented).** "`GITHUB_TOKEN` is scoped to the repository level and cannot access Projects." The workflows need a personal access token with the `project` scope stored as a repository secret (`FOCUS_TRAIL_PROJECT_TOKEN`). Whether a fine-grained token can reach a user Project was not verified; plan on a classic token.
- **No workflow trigger for Projects (documented).** The current list of events that trigger workflows has no Projects event. The `projects_v2_item` webhook event exists, but its availability for personal Projects could not be confirmed (the webhook documentation was not reachable from the sandbox; it is believed to be organization-only). **Design consequence: do not depend on an event.** A scheduled workflow plus a manual run, started by the app's "Sync now" button through the API, covers it. Starting a workflow run needs write access to the repo's Actions, which the existing `repo` scope covers.
- **Creating a Project linked to a repo (documented).** `createProjectV2` takes the owner's node id (user or organization) and an optional repository id. The owner's own node id comes from `user(login:)`.
- **Milestones.** A Project has no milestones of its own: the milestone is the issue's own milestone, shown as a built-in field. Adding a milestone from the app is the existing repo-level REST call (covered by `repo`); adding a task is "create the issue, then add it to the Project".
- **Writes are slow (from experience, not from the docs).** The first `tasks:sync` took about 20 minutes per 1,000 writes because of GitHub's limits on creating content; the importer must resume and the app must not run it inside a page request.
- **Still to confirm live (owner, one-off, read-only):** that the current token is refused for Projects as expected, that a token with `read:project` can list the owner's Projects and read a Project's items, issue state, milestone and Status, and what a fresh Project's Status field offers. Commands are in `docs/onboarding-repos.md` under "Probe".

**Risks:** there is no event for a change to a personal Project, so `TASKS.md` refreshes on a schedule or on "Sync now", not instantly; a Project edited by hand can drift (the daily check reports it); GitHub's write rate limit makes a first import of about 100 items take minutes (the importer must resume); Project fields use GraphQL node ids, so more calls; a Claude session that edits a tick into `TASKS.md` will see it reverted (the rules tell it to close the issue instead).

### Key decisions

| Decision                                                | Choice                                                                                       | Why                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Source of truth for tasks                               | GitHub                                                                                       | Avoids a second task system to keep in sync              |
| Progress history                                        | Own daily snapshots plus backfill                                                            | GitHub only gives current counts                         |
| Users                                                   | Single user                                                                                  | Keeps auth and data simple                               |
| Rendering                                               | Server-side data fetching, client charts                                                     | Token never reaches the browser                          |
| Repos without milestones                                | One implicit milestone of all issues                                                         | Every repo still gets a graph                            |
| Source of truth for tasks (Phase 5, decided 2026-10-21) | The repo's GitHub Project; `TASKS.md` becomes a generated copy that also accepts added lines | The app adds tasks, so there must be one master, not two |

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

| Step | Outcome                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `git init`, scaffold Next.js, tokens and fonts from the mockup, fixture mode with example data                                                        |
| 1    | GitHub sign-in, repo list, milestone graph per repo, set Focus Project (Phase 1)                                                                      |
| 2    | Today list, stall and overdue alerts, switch-focus reason, history backfill (Phase 2)                                                                 |
| 3    | Done checklist, Deployed status and URL, daily notification (Phase 3)                                                                                 |
| 4    | Ideal-pace line, streaks, weekly review, deploy status (Phase 4, optional)                                                                            |
| 5    | GitHub Project as the source of truth: onboard a repo, add tasks and milestones from the app, generate `TASKS.md` from the Project (Phase 5, planned) |

Rule from the PRD: this app is its own first Focus Project. Finish each phase before starting the next.

## 6. Risks

- Repos without milestones show no graph. Fallback: one implicit milestone.
- Strict focus can feel annoying and get ignored. Keep the override, log the reason.
- GitHub rate limit (5,000 requests per hour) is fine for one user if responses are cached.
- Graph history starts at first run unless backfilled; backfill on first sync.

## 7. Open questions

- Phase 5 shape: one Project per repo (default) or one shared board? Should `TASKS.md` changes reach the Project by import of added lines (default) or not at all? (Permissions are settled: the spike found a GitHub App cannot reach a personal account's Projects, so the app asks for the `project` scope.) One Project per repo (default) or one shared board? Should `TASKS.md` changes reach the Project by import of added lines (default) or not at all? (open; defaults are in the plan above)
- Are tasks already GitHub Issues with Milestones, or should the app help create them? (still open)

Answered: database (Turso), repo access (public and private), reminders (email via Resend), meaning of finished (Deployed or marked Finished).
