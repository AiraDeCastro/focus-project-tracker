# Focus Trail: Tasks

Build in milestone order. Finish one milestone before starting the next. This app is its own first Focus Project. See `PLANNING.md` for the stack and `CLAUDE.md` for the rules.

## Milestone 0: Setup

- [x] Answer the open questions: Turso or Supabase, private repos or public only, reminder channel, what "finished" means (decided: Turso, public and private repos, email via Resend, Deployed or marked Finished)
- [x] Run `git init` and create a GitHub repo for the project (private repo: https://github.com/AiraDeCastro/focus-project-tracker)
- [x] Scaffold Next.js (App Router) with TypeScript strict mode (Next 16.4, React 19.3, `src/` layout, CSS modules, no Tailwind)
- [x] Replace the default Next.js starter page and assets with a blank shell (starter `page.tsx`, `page.module.css`, `public/*.svg`)
- [x] Make `tsc --noEmit` work on a fresh clone: `LayoutProps` types come from `next typegen`, so run `next typegen` before the type check (`npm run typecheck` does this)
- [ ] Review `npm audit` (high severity in `braces`, dev-only via `eslint-config-next`); do not run `npm audit fix --force`, it downgrades Next tooling
- [x] Add ESLint, Prettier, Vitest and the `tsc --noEmit` script (`npm run check` runs type check, lint and tests)
- [x] Add CSS tokens (sage palette, light and dark themes) and the Outfit and Nunito fonts from `mockup.html`
- [x] Build the app shell: icon sidebar, top bar with search, card grid, theme toggle (the full mockup dashboard is ported, on fixture data)
- [x] Create the data-access layer interface and a fixture mode that serves the example data from `mockup.html`
- [x] Add `.env.example` with placeholder values only
- [x] Set up the Vercel project and the database account (Vercel and Turso both done 2026-10-08; Vercel deploys every push to main at https://focus-project-tracker.vercel.app)

**Done when:** the app runs locally on fixture data and looks like the mockup.

## Milestone 1: MVP (GitHub sign-in, graph, Focus Project)

- [x] Add pre-commit standards: lint-staged, dependency check, security audit with reviewed allow-list, type check, lint with zero warnings, tests, build (Husky)
- [x] Enforce Conventional Commits with commitlint
- [ ] Re-review the `braces` audit exception before 2026-11-30 (no patched release exists as of 2026-10-08); remove it from `audit-allowlist.json` once a fix ships
- [x] Add a GitHub Actions workflow that runs the same checks on every push and pull request, so the same gate protects `main` even if hooks are skipped (`.github/workflows/ci.yml`)
- [x] Confirm the first CI run passes on GitHub, then turn on branch protection for `main` requiring the `verify` check (CI passed; the repo was made public because branch protection on a private repo needs GitHub Pro; protection applied 2026-10-08)
- [ ] Decide whether to enforce branch protection for admins too. It is off so the owner can still push straight to `main`; turning it on means every change goes through a pull request that passes `verify`

- [x] Add a short setup note to the README for getting a GitHub OAuth App, Turso database and Resend key
- [x] Register a GitHub OAuth App and add the client id and secret to environment variables (done 2026-10-08: production OAuth App "Focus Trail Project Tracker", callback https://focus-project-tracker.vercel.app/api/auth/callback/github; the client id and secret are in Vercel only)
- [x] Set up Auth.js with the GitHub provider, read-only scope, and an allow-list for the owner's login (code, allow-list tests and sign-in page done; live sign-in is untested until the OAuth App exists; the `repo` scope is not read-only, see the GitHub App task)
- [x] Create the database schema: Project, Milestone snapshot, Focus log, Done checklist item, Settings (Drizzle + libsql; `npm run db:generate`, `npm run db:migrate`)
- [x] Add a database constraint so at most one project has status `focus` (partial unique index, tested)
- [x] Build the GitHub client with Octokit: repos, milestones, issues, with response caching
- [x] Hide forks and archived repos by default, as a setting (settings flags; `listVisibleProjects`)
- [x] Build the progress service: percent complete, current milestone, implicit milestone for repos without milestones
- [x] Write unit tests for the progress calculation
- [x] Sync repos into Project rows on first sign-in, with default status `backlog` (the GitHub data source runs `syncProjects` on every dashboard load)
- [x] Wire the milestone progress line graph to real data (hand-written SVG, not Recharts): date axis, percent axis, due-date markers, endpoint tag
- [x] Add the repo tabs that switch the graph
- [x] Build the focus ring card with percent complete, current milestone and last-closed date
- [x] Build the milestone ladder
- [x] Build the other-projects cards with mini rings and status pills (built and tested with a fake GitHub; the live check waits for the OAuth App)
- [x] Let the owner pick the first Focus Project (focus service `setFocus`, picker card, owner-only `setFocusAction`; with no focus project, "Make focus" needs no reason)
- [x] Add high priority projects: a star on every project marks it high priority (saved in the database; example data keeps it in memory), high priority projects get their own section above the rest, and switching focus away from a high priority project warns you
- [x] When picking the first Focus Project, list high priority projects first and suggest the top one (the picker card suggests the high priority project closest to done)
- [x] Make the focus switch persist: write the status change and a focus log row in one database transaction, then reload the dashboard (one batch; the log entry is closed with the reason)
- [ ] Test the focus picker and the two server actions against the real app once the OAuth App exists (the service is tested; the signed-in path has not been run)
- [ ] Show the focus log (which projects had focus and why you left them) somewhere in the app
- [x] Turn each job-search project's TASKS.md into GitHub milestones and issues (`npm run tasks:sync`; crm, project-gantt-chart, Jordyns-Bakes, Set-It-Up, Gunita-Photo-Album; done 2026-10-08)
- [ ] Create a TASKS.md with milestones for `learn-french-with-aira` (it is third on the owner's priority list and has none, so it shows no progress)
- [x] Show only high priority projects (plus the focus project) in the Milestone progress card (done 2026-10-08)
- [ ] Rank the high priority projects, not just star them: the owner's order is crm, project-gantt-chart, learn-french-with-aira, Jordyns-Bakes, Set-It-Up, Gunita-Photo-Album, but a star cannot say which comes first; the focus picker should suggest the top-ranked one
- [ ] Decide whether `clone-wars-quotes` and `focus-project-tracker` should stay starred (they were left off the owner's priority list)
- [ ] Re-run `npm run tasks:sync` for each project when its TASKS.md changes, or schedule it (ticked tasks close their issues; new tasks open new ones)
- [ ] Test Mark finished, Reopen, the star and the type selector against the live site while signed in (the services are tested; the signed-in path has not been run)
- [ ] Let the owner set the real finished date when marking a project done (today it uses the day it was marked)
- [x] Keep practice and school repos out of the focus (a Project, Practice or School type on every repo; practice and school work can never take focus; done 2026-10-08)
- [ ] Link each Today task to its GitHub issue (`openIssues` already returns the URL; the dashboard drops it)
- [ ] Replace the decorative mini charts in the issue-count card with real data, or remove them
- [ ] Handle repos with many milestones in the ladder (it assumes a handful; add scrolling or a cap)
- [ ] Use the owner's timezone for "today" and the week boundaries (the data source uses UTC)
- [ ] Show a clear message when the database has not been migrated (`npm run db:migrate`) or GitHub rate-limits us, instead of a generic error page
- [ ] Choose how to get read-only GitHub access: keep the OAuth App (`repo` scope, can write but the app never does) or switch to a GitHub App with read-only Issues and Metadata permissions
- [x] Build the `github` data source: require sign-in, run `syncProjects`, read milestones and last-closed dates, build the `Dashboard` object, and select it with `DATA_SOURCE=github` (built and tested with a fake GitHub; the live check waits for the OAuth App); an unsigned visit redirects to /sign-in (checked in the browser)
- [x] Record a milestone snapshot for every repo each time the dashboard syncs, so graph history starts on day one (one row per repo, milestone and day; reloads replace the same day)
- [x] Let `ProgressGraph` and the data model handle weeks with no snapshot yet (missing points), since real history starts at the first sync
- [x] Make the UI safe for a project with no milestones or no issues (ladder, focus ring and other-project cards)
- [x] Add the `finished` status to the UI types, labels and colors (it already exists in the database)
- [ ] Run `npm run db:migrate` against Turso as part of the deploy
- [x] Deploy to Vercel (example data is live at https://focus-project-tracker.vercel.app; auto-deploys on every push to main)
- [x] Create the Turso database in the dashboard (libSQL engine, not `--tursodb`), put `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in `.env.local`, and run `npm run db:migrate` (done 2026-10-08: database `focus-project-tracker` in aws-us-east-1; all 5 tables, the one-focus index and `high_priority` verified)
- [x] Add the environment variables in Vercel and redeploy (done 2026-10-08; the database values should be marked Sensitive)
- [x] Register the production OAuth App and run `npm run db:migrate` against Turso (done 2026-10-08)
- [x] Sign in on the deployed site (owner confirmed 2026-10-08: sign-in works)
- [ ] Check the real data against GitHub on the deployed site (owner to check: all repos appear, percentages match GitHub, first focus pick and stars save and survive a reload)
- [x] Name the app Focus Trail and add the logo (page title, sign-in page, dashboard header, tab icon; light and dark themes; done 2026-10-08)
- [ ] Rename the OAuth App on GitHub to "Focus Trail" (cosmetic; it is currently "Focus Trail Project Tracker"; the name shows on GitHub's authorize page)
- [ ] Consider setting `AUTH_URL=https://focus-project-tracker.vercel.app` in Vercel so sign-in always uses the real domain, even from a one-off deployment address

**Done when:** you can sign in, see all repos with their graphs, and set one Focus Project.

## Milestone 2: Accountability

- [ ] Build the daily snapshot job and its protected cron route (`CRON_SECRET`)
- [ ] Build the first-run backfill from issue `closed_at` dates
- [ ] Write unit tests for snapshot and backfill logic
- [ ] Build the Today list: next 1 to 3 open issues of the current milestone, each linking to GitHub
- [ ] Build stalled detection (no closed issue in 7 days, configurable) and overdue detection (milestone past due)
- [ ] Add an Away mode: the owner sets a return date and stalled alerts pause until then (no working-weekday schedule, since the owner has no usual work days)
- [ ] Write unit tests for stalled and overdue rules, including Away mode
- [ ] Add a "since your last visit" summary card for returning after several days away
- [ ] Show alerts on the dashboard
- [ ] Build the switch-focus modal with a required reason of at least 5 characters
- [ ] Write the focus service: swap statuses, write the focus log, reject switches without a reason
- [ ] Write unit tests for the one-focus rule and the switch reason rule
- [ ] Build the calendar card: closed-task days and milestone due dates
- [ ] Build the issues-closed-this-week bar chart
- [ ] Build the issue counts and repos-by-status cards
- [ ] Add a settings page for the stall threshold and repo filters

**Done when:** the graph has real history, alerts fire, and switching focus asks why.

## Milestone 3: Finish line

- [ ] Add the definition-of-done checklist per project (optional aid now; no longer required to finish a project)
- [x] Add the deployed URL field (stored on the project, shown as a Visit site link)
- [x] Mark a project Deployed (superseded 2026-10-08: the owner chose a simple confirmation instead of a checklist gate; a valid live address is still required)
- [x] Add the Deployed and Finished states, with the finished date (Mark finished button, dialog, Finished and deployed section, Reopen)
- [x] Let a project be marked Finished without a deployed URL (libraries, CLIs, scripts, practice projects)
- [ ] Use Resend as the email channel for the daily notification (decided in Milestone 0)
- [ ] Prompt to choose the next Focus Project after a project ships
- [x] Write unit tests for the Deployed rule (`src/lib/done.test.ts`)
- [ ] Build the daily notification of the Today list through the chosen channel
- [ ] Add a notification setting (email, browser, or none)
- [ ] Add one end-to-end test with Playwright: sign in with a test account, view the dashboard, switch focus with a reason

**Done when:** a project can be marked Deployed and the next day's reminder arrives.

## Milestone 4: Polish (optional)

- [ ] Add the ideal-pace dotted line to the graph for the Focus Project
- [ ] Add a weekly streak counter: consecutive weeks with at least one closed issue (Away weeks do not break it)
- [ ] Add a weekly review summary
- [ ] Add deploy-status integration (Vercel or Netlify API)
- [ ] Check accessibility: focus states, accessible names, contrast in both themes
- [ ] Check the layout at 400 px wide with no horizontal scroll
- [ ] Add loading and empty states for every card
- [ ] Add error handling for GitHub rate limits and sign-in expiry

**Done when:** you are happy to use it every day.

## Before each commit

- [ ] Type check, lint and tests pass
- [ ] The change was checked in the browser against `mockup.html`
- [ ] No secrets in the diff
