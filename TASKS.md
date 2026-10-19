# Focus Trail: Tasks

Build in milestone order. Finish one milestone before starting the next. This app is its own first Focus Project. See `PLANNING.md` for the stack and `CLAUDE.md` for the rules.

## Milestone 0: Setup

- [x] Answer the open questions: Turso or Supabase, private repos or public only, reminder channel, what "finished" means (decided: Turso, public and private repos, email via Resend, Deployed or marked Finished)
- [x] Run `git init` and create a GitHub repo for the project (private repo: https://github.com/AiraDeCastro/focus-project-tracker)
- [x] Scaffold Next.js (App Router) with TypeScript strict mode (Next 16.4, React 19.3, `src/` layout, CSS modules, no Tailwind)
- [x] Replace the default Next.js starter page and assets with a blank shell (starter `page.tsx`, `page.module.css`, `public/*.svg`)
- [x] Make `tsc --noEmit` work on a fresh clone: `LayoutProps` types come from `next typegen`, so run `next typegen` before the type check (`npm run typecheck` does this)
- [x] Review `npm audit` (high severity in `braces`, dev-only via `eslint-config-next`); do not run `npm audit fix --force`, it downgrades Next tooling (REVIEWED 2026-10-13: `npm audit --omit=dev` finds 0 vulnerabilities, so the deployed app is clean; the only finding is `braces` (GHSA-vfj7-8cjw-p6xm, a denial of service on deeply nested patterns), reached only through `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob` -> `micromatch`, which lint our own files on a developer machine and in CI. npm still lists braces 3.0.3 as the latest release, so there is nothing to upgrade to, and `npm audit fix --force` would only downgrade eslint-config-next to 14.x, so it was not run. Kept as a reviewed exception in `audit-allowlist.json`; it expires 2026-11-30, see the re-review task below)
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
- [ ] Re-review the `braces` audit exception before 2026-11-30 (no patched release exists as of 2026-10-08); remove it from `audit-allowlist.json` once a fix ships (a one-time reminder is scheduled for 2026-11-23 and will ask the owner before opening any pull request)
- [x] Add a GitHub Actions workflow that runs the same checks on every push and pull request, so the same gate protects `main` even if hooks are skipped (`.github/workflows/ci.yml`)
- [x] Confirm the first CI run passes on GitHub, then turn on branch protection for `main` requiring the `verify` check (CI passed; the repo was made public because branch protection on a private repo needs GitHub Pro; protection applied 2026-10-08)
- [x] Decide whether to enforce branch protection for admins too. It is off so the owner can still push straight to `main`; turning it on means every change goes through a pull request that passes `verify` (DONE 2026-10-13: the owner turned on "Do not allow bypassing the above settings"; read back from GitHub: enforce_admins is true and the other rules are unchanged. Claude cannot change branch protection from the cloud session, so this had to be done by the owner)

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
- [x] Show the focus log (which projects had focus and why you left them) somewhere in the app (a "Focus log" card below the weekly review: the newest 10 stretches, with dates in the owner's timezone, how long each lasted, and the reason for leaving; `src/lib/focus-log.ts`. Checked in the browser with example data in both themes and at 400 px, axe clean; not seen on real data signed in)
- [x] Turn each job-search project's TASKS.md into GitHub milestones and issues (`npm run tasks:sync`; crm, project-gantt-chart, Jordyns-Bakes, Set-It-Up, Gunita-Photo-Album; done 2026-10-08)
- [ ] Create a TASKS.md with milestones for `learn-french-with-aira` (it is third on the owner's priority list and has none, so it shows no progress)
- [x] Show only high priority projects (plus the focus project) in the Milestone progress card (done 2026-10-08)
- [x] Rank the high priority projects, not just star them (up and down buttons on each starred card, "#1 of 3"; a newly starred project goes to the bottom; the focus picker suggests the top-ranked one, even one with no issues yet. The rank lives in the existing `projects.high_priority` column (0 = not starred, 1 or more = place) so there is NO migration and the live site cannot break on a missing column; `drizzle-kit generate` reports no schema changes. Rules in `src/lib/priority-rules.ts`. Projects starred before this all hold 1 and are ordered by repo id until the first move settles them. The owner still has to set the order crm, project-gantt-chart, learn-french-with-aira, Jordyns-Bakes, Set-It-Up, Gunita-Photo-Album with the buttons. Checked in the browser with example data only)
- [ ] Decide whether `clone-wars-quotes` and `focus-project-tracker` should stay starred (they were left off the owner's priority list)
- [ ] Re-run `npm run tasks:sync` for each project when its TASKS.md changes, or schedule it (done once for this repo on 2026-10-18: 5 milestones and 110 issues, the focus card shows 84%; every task ticked in `TASKS.md` since then shows on the dashboard only after the next run; the script needs `gh` signed in on the computer it runs on) (ticked tasks close their issues; new tasks open new ones)
- [ ] Test Mark finished, Reopen, the star and the type selector against the live site while signed in (the services are tested; the signed-in path has not been run)
- [x] Let the owner set the real finished date when marking a project done (the "Mark as done" dialog asks "When did it finish?", defaulting to today, never in the future; a done card shows "Finished Sep 2" with a "Change date" link for projects already marked, so the five marked on 2026-10-08 can be corrected. A chosen day is stored as the date alone; today keeps the exact moment. If the focus project is finished on an earlier day, its focus-log entry ends that day, never before it began. `src/lib/done.ts` `markDone`/`setFinishedDate`, rules in `done-rules.ts`. Checked in the browser with example data in both themes, axe clean; the signed-in actions have not been run)
- [x] Keep practice and school repos out of the focus (a Project, Practice or School type on every repo; practice and school work can never take focus; done 2026-10-08)
- [x] Link each Today task to its GitHub issue (`openIssues` already returns the URL; the dashboard drops it) (done in #9 `feat/today-links`; ticked 2026-10-13 when the summary was updated)
- [x] Replace the decorative mini charts in the issue-count card with real data (each count now has a thin trend line from the daily snapshots, weekly points for the last ten weeks ending on today's live number, a marked current point, a native tooltip per point and a plain sentence such as "Up 18 since Aug 13"; `src/components/IssueTrend.tsx`, `src/lib/issue-trend.ts`, `loadCountHistory`, `countSeriesFromHistory`. With fewer than two weeks of snapshots it shows "Trend starts after a few weekly snapshots" instead of a line. Real data needs snapshots from before; the daily job and each dashboard load create them. Checked in the browser with example data in both themes, axe clean; not seen on real data signed in)
- [x] Handle repos with many milestones in the ladder (it assumes a handful; add scrolling or a cap) (the ladder scrolls inside its card; ticked 2026-10-13 when the summary was updated)
- [x] Use the owner's timezone for "today" and the week boundaries (the browser reports its timezone in an `ft_tz` cookie; the server dates "today", the week, the streak, the weekly review, the calendar and stall counts by it. The daily jobs have no browser, so they use `APP_TIMEZONE`, else UTC. `src/lib/timezone.ts`. Verified in the browser with example data only: the cookie is set once and the page refreshes once. Not checked on real data signed in. Away dates, the Away return-date check and the snapshot dates use the owner's day too)
- [ ] Owner (optional): add `APP_TIMEZONE` in Vercel (your IANA name, for example `America/Toronto`) so the 06:00 and 12:00 UTC daily jobs date snapshots and the email by your day; without it they use UTC. Browsing needs nothing: the browser reports it
- [x] Show a clear message when the database has not been migrated (`npm run db:migrate`) or GitHub rate-limits us, instead of a generic error page (rate limits and an expired sign-in since #19; now "The database needs updating" with the command and the missing table or column, and "Focus Trail cannot reach its database" for a bad address or refused token, on the dashboard and the settings page. `src/lib/db-errors.ts`, tested against the errors the real libsql and Drizzle throw. Checked in the browser with a temporary switch, both notices, light and dark, axe clean. Server actions that fail on the database still show their generic "Could not save")
- [ ] Choose how to get read-only GitHub access: keep the OAuth App (`repo` scope, can write but the app never does) or switch to a GitHub App with read-only Issues and Metadata permissions
- [x] Build the `github` data source: require sign-in, run `syncProjects`, read milestones and last-closed dates, build the `Dashboard` object, and select it with `DATA_SOURCE=github` (built and tested with a fake GitHub; the live check waits for the OAuth App); an unsigned visit redirects to /sign-in (checked in the browser)
- [x] Record a milestone snapshot for every repo each time the dashboard syncs, so graph history starts on day one (one row per repo, milestone and day; reloads replace the same day)
- [x] Let `ProgressGraph` and the data model handle weeks with no snapshot yet (missing points), since real history starts at the first sync
- [x] Make the UI safe for a project with no milestones or no issues (ladder, focus ring and other-project cards)
- [x] Add the `finished` status to the UI types, labels and colors (it already exists in the database)
- [x] Run `npm run db:migrate` against Turso as part of the deploy (done by the owner on 2026-10-18 for migration 0003, `history_backfilled_on`; run it again, from the branch that holds the new file, before merging any pull request that adds a migration, because the live site shows "The database needs updating" until it is applied)
- [x] Deploy to Vercel (example data is live at https://focus-project-tracker.vercel.app; auto-deploys on every push to main)
- [x] Create the Turso database in the dashboard (libSQL engine, not `--tursodb`), put `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in `.env.local`, and run `npm run db:migrate` (done 2026-10-08: database `focus-project-tracker` in aws-us-east-1; all 5 tables, the one-focus index and `high_priority` verified)
- [x] Add the environment variables in Vercel and redeploy (done 2026-10-08; the database values should be marked Sensitive)
- [x] Register the production OAuth App and run `npm run db:migrate` against Turso (done 2026-10-08)
- [x] Sign in on the deployed site (owner confirmed 2026-10-08: sign-in works)
- [ ] Check the real data against GitHub on the deployed site (owner to check: all repos appear, percentages match GitHub, first focus pick and stars save and survive a reload)
- [x] Name the app Focus Trail and add the logo (page title, sign-in page, dashboard header, tab icon; light and dark themes; done 2026-10-08)
- [ ] Rename the OAuth App on GitHub to "Focus Trail" (cosmetic; it is currently "Focus Trail Project Tracker"; the name shows on GitHub's authorize page)
- [x] Set `AUTH_URL=https://focus-project-tracker.vercel.app` in Vercel (plain variable, not secret) so sign-in always uses the real domain (done 2026-10-10: it fixed GitHub's "redirect_uri is not associated with this application" error)

**Done when:** you can sign in, see all repos with their graphs, and set one Focus Project.

## Milestone 2: Accountability

- [x] Build the daily snapshot job and its protected cron route (`CRON_SECRET`) (`runDailySnapshot` in `src/lib/snapshot-job.ts`, route `/api/cron/snapshot`, schedule in `vercel.json` at 06:00 UTC; tested)
- [ ] Owner, BEFORE merging the backfill pull request: run `npm run db:migrate` against Turso (applies `0003_add_history_backfilled_on`). The new code reads that column, so deploying first would break the dashboard until it is migrated
- [ ] Owner: make the daily job work in production (the cron has no signed-in session, so it needs its own GitHub token). In Vercel add `CRON_SECRET` (any long random value, Sensitive) and `GITHUB_CRON_TOKEN` (a GitHub personal access token that can read your repos, Sensitive), then redeploy. Decision for the owner: a classic token needs the `repo` scope for private repos, the same as sign-in; a fine-grained read-only token is stricter but must be given access to each repo
- [ ] Owner: renew `GITHUB_CRON_TOKEN` before it expires on 2027-01-11 (GitHub fine-grained token "Focus Trail daily jobs", created with a 90-day life, Issues read-only on all repositories). When it expires the daily snapshot and email jobs fail quietly. Renew with Regenerate token on GitHub, then replace the value in Vercel and redeploy. A reminder is scheduled for 2027-01-04. Do this only after the token has been created and added in Vercel; the dates above assume it was made on 2026-10-13
- [x] Build the first-run backfill from issue `closed_at` dates (`src/lib/backfill.ts`: rebuilds up to 84 days of past counts from issue created and closed dates, once per repo, never overwrites real snapshots; runs on the first dashboard load and in the daily job; a repo is marked in `projects.history_backfilled_on`; migration `0003`)
- [x] Write unit tests for snapshot and backfill logic (done with the two tasks above)
- [x] Build stalled detection (no closed issue in 7 days, configurable) and overdue detection (milestone past due) (`stallState` and `overdueMilestones` in `src/lib/alerts.ts`; not yet shown or fed real data, see "Show alerts on the dashboard")
- [x] Build the Today list: next 1 to 3 open issues of the current milestone, each linking to GitHub (real data shows each task as a link that opens the issue, because issues are closed on GitHub; example data keeps its checkboxes)
- [x] Add an Away mode: the owner sets a return date and stalled alerts pause until then (no working-weekday schedule, since the owner has no usual work days) (`src/lib/away.ts`, `setAwayAction`, a control in the Today card; the return date must be after today and within a year; verified in the browser with example data only, the signed-in server action has not been run)
- [x] Write unit tests for stalled and overdue rules, including Away mode (`src/lib/alerts.test.ts`; the Away rules are tested, the Away setting itself is not built yet)
- [x] Add a "since your last visit" summary card for returning after several days away (`src/lib/last-visit.ts`, `VisitTracker`; DECISION made without the owner: the last visit is remembered in a browser cookie, per device, so it needs no database migration. A visit is 6 hours apart; the card shows only when the last visit was at least a day ago, with issues closed and the progress change for the focus project. Verified in the browser with example data only)
- [x] Show alerts on the dashboard (focus project only: stalled, overdue milestones, and a calm on-track or Away note, in the Today card; reads the stall threshold and Away date from settings, which have no screen yet, so they stay at 7 days and not away until "Add a settings page" and the Away task are done)
- [x] Build the switch-focus modal with a required reason of at least 5 characters (built in Milestone 1; `DashboardView.tsx`, reason limits in `focus-rules.ts`)
- [x] Write the focus service: swap statuses, write the focus log, reject switches without a reason (`setFocus` in `src/lib/focus.ts`)
- [x] Write unit tests for the one-focus rule and the switch reason rule (`src/lib/focus.test.ts`, plus the one-focus index test in the database tests)
- [x] Build the calendar card: closed-task days and milestone due dates (built in Milestone 1; shows real data)
- [x] Build the issues-closed-this-week bar chart (built in Milestone 1; shows real data)
- [x] Build the issue counts and repos-by-status cards (built in Milestone 1; shows real data)
- [x] Add a settings page for the stall threshold and repo filters (`/settings`: stall threshold 1 to 90 days, hide forks, hide archived; `src/lib/settings.ts`, `saveSettingsAction`; Away mode stays on the dashboard; verified in the browser with example data only, the signed-in save has not been run)

**Done when:** the graph has real history, alerts fire, and switching focus asks why.

## Milestone 3: Finish line

Started 2026-10-10 at the owner's request while two Milestone 2 items still wait on the owner (the cron secrets and the migration for the backfill).

- [x] Add the definition-of-done checklist per project (optional aid now; no longer required to finish a project) (card for the focus project: add, tick, remove, and a suggested starter set; never blocks finishing; `src/lib/checklist.ts`, uses the existing table so no migration; verified in the browser with example data only, the signed-in actions have not been run)
- [x] Add the deployed URL field (stored on the project, shown as a Visit site link)
- [x] Mark a project Deployed (superseded 2026-10-08: the owner chose a simple confirmation instead of a checklist gate; a valid live address is still required)
- [x] Add the Deployed and Finished states, with the finished date (Mark finished button, dialog, Finished and deployed section, Reopen)
- [x] Let a project be marked Finished without a deployed URL (libraries, CLIs, scripts, practice projects)
- [x] Use Resend as the email channel for the daily notification (decided in Milestone 0) (`createResendSender` in `src/lib/email/resend.ts`: plain HTTP, no SDK, the key is only sent as a header and never put in an error; tested with a fake `fetch`, not yet run against real Resend)
- [x] Prompt to choose the next Focus Project after a project ships (finishing or deploying the focus project turns the pick-a-focus card into "Nice work. Next up: <suggestion>" with a pill saying what shipped, a toast, and keyboard focus on the button; the card was already shown when no project has focus; verified in the browser with example data. After a page reload the generic "No focus yet" card shows, because the app does not store which project shipped last)
- [x] Write unit tests for the Deployed rule (`src/lib/done.test.ts`)
- [x] Build the daily notification of the Today list through the chosen channel (`/api/cron/daily-email` at 12:00 UTC, `runDailyReminder`, `buildDailyEmail`; skips when turned off, Away, no recipient or no focus project; tested with fakes, never sent for real)
- [x] Add a notification setting (email, browser, or none) (Settings page: email or none. A browser notification was not built: it would need a service worker and push permission for little gain over email; say so if you want it)
- [ ] Owner: turn on the daily email. In Vercel add `RESEND_API_KEY` and `REMINDER_EMAIL_TO` (plus `CRON_SECRET` and `GITHUB_CRON_TOKEN` from the snapshot task), then redeploy; steps in `README.md`. With only Resend's test sender, the email can go only to your own Resend account address
- [ ] Add one end-to-end test with Playwright: sign in with a test account, view the dashboard, switch focus with a reason (SKIPPED for now at the owner's request, 2026-10-10; it needs a decision on how a test can sign in without GitHub's login)

**Done when:** a project can be marked Deployed and the next day's reminder arrives.

## Milestone 4: Polish (optional)

- [x] Add the ideal-pace dotted line to the graph for the Focus Project (built earlier; `idealEndIndex` and the legend; ticked 2026-10-10)
- [x] Add a weekly streak counter: consecutive weeks with at least one closed issue (Away weeks do not break it) (`src/lib/streak.ts`: weeks run Monday to Sunday; an empty current week is not held against the owner; counts the starred projects plus the focus project; shown under the greeting only when there is one, never as zero; while Away mode is on the streak is paused instead of broken. Limit: only the current Away period is known, because past Away periods are not stored, so an old Away week that is already over does break the streak; storing them would need a migration. Verified in the browser with example data only)
- [x] Add a weekly review summary (`src/lib/weekly-review.ts`: a card below the main grid reviewing the last full week, Monday to Sunday, for the starred projects plus the focus project: issues closed, per project, against the week before. A quiet week is worded gently, never as a failure. Verified in the browser with example data only)
- [x] Add deploy-status integration (Vercel or Netlify API) (Vercel only, at the owner's choice; the repo's GitHub homepage address is matched to a Vercel project's production domains. `src/lib/vercel.ts`, `src/lib/deploy-status.ts`; a pill on the card and the focus card. Tested with a fake Vercel. NOT verified against the real Vercel API: this environment cannot reach it, so the response shape was written from memory and read defensively; the owner's first signed-in look is the real test)
- [x] Owner: create a Vercel token and add `VERCEL_TOKEN` (done 2026-10-13: the focus card shows "Live on Vercel (today)" and the footer reads "Vercel: read 1 project, 1 repo matched a homepage". Only `focus-project-tracker` is visible to this token; `Personal-Portfolio` is not, so it is on another Vercel team or account, or not on Vercel. A second token for another scope would need a small code change)
- [ ] (Optional, skipped at the owner's request 2026-10-14) Find out why `Personal-Portfolio` shows no Vercel pill. Findings so far: it is on Vercel in the same account as this app (`personal-portfolio-aira-de-castro.vercel.app`), there are no teams, but the Vercel API returns only `focus-project-tracker` to the token, and `/v2/teams` answers "forbidden" for it. Not yet tried: ask for the project by name (`GET /v9/projects/personal-portfolio`) with the token defined in the same PowerShell window, or create a fresh token
- [x] Check accessibility: focus states, accessible names, contrast in both themes (axe-core run on the dashboard, sign-in and settings in both themes, plus both dialogs, keyboard tabbing and Escape: now 0 violations. Fixed: muted and deep text, the active graph tab, pill text, alert titles, out-of-month calendar days, the footer landmark, and a focus ring too faint in the light theme. `src/app/contrast.test.ts` guards the token contrast. Not checked: a screen reader, and the signed-in real-data view)
- [x] Check the layout at 400 px wide with no horizontal scroll (checked the dashboard, sign-in and settings at 400, 360 and 320 px in both themes with example data, plus the switch-focus and mark-finished dialogs at 360 px: no element runs past the screen. Found and fixed: on a phone the graph came before the Today list, against the rule "banner, Today list, graph, then the rest"; the settings back link was a 19 px tap target. Not checked: the real-data signed-in view, a real phone, and the Deployed dialog with its address field open)
- [x] Fix the wording for a milestone with no due date (found on the live site 2026-10-18 after the TASKS.md sync: the focus card said "milestone, due No due date" and the ladder "Due No due date"; now "no due date" and "No due date". `src/lib/due-text.ts`; checked in the browser with a temporary fixture change)
- [x] Add loading and empty states for every card (the dashboard now streams in behind a card-shaped skeleton instead of a line of text; an account with no repos no longer says "None of your repos has issues yet" or "No other repo matches that name"; `DATA_SOURCE=fixture-empty` shows every empty state, checked in light and dark with axe-core and no violations. Every other card already had an empty state. Not checked: the skeleton on the live site, where it shows for a moment while GitHub loads)
- [x] Add error handling for GitHub rate limits and sign-in expiry (a rejected token (401) now redirects to sign-in, a rate limit shows a "GitHub needs a short break" notice with the wait time, anything else shows the "dashboard could not load" page with Try again and Sign in again; the 401 crash was reproduced locally, the signed-in live path is not yet checked by Claude)
- [x] Add a public `/demo` page and a showcase README (2026-10-19, owner's request, so recruiters can try the app without signing in: `/demo` always renders the example data with no actions, so it never touches GitHub, the session or the database; the sign-in page links to it; the README now opens with what it does, how it is built, the demo link and a screenshot at `docs/screenshot.png`. The footer no longer tells visitors to set `DATA_SOURCE`. Checked in the browser at 1360 px and 400 px with no horizontal scroll. Not checked: the live `/demo` address until this is deployed, and the demo's dark theme in a browser)
      **Done when:** you are happy to use it every day.

## Before each commit

- [ ] Type check, lint and tests pass
- [ ] The change was checked in the browser against `mockup.html`
- [ ] No secrets in the diff
