# Focus Project Tracker: Tasks

Build in milestone order. Finish one milestone before starting the next. This app is its own first Focus Project. See `PLANNING.md` for the stack and `CLAUDE.md` for the rules.

## Milestone 0: Setup

- [x] Answer the open questions: Turso or Supabase, private repos or public only, reminder channel, what "finished" means (decided: Turso, public and private repos, email via Resend, Deployed or marked Finished)
- [ ] Run `git init` and create a GitHub repo for the project
- [ ] Scaffold Next.js (App Router) with TypeScript strict mode
- [ ] Add ESLint, Prettier, Vitest and the `tsc --noEmit` script
- [ ] Add CSS tokens (sage palette, light and dark themes) and the Outfit and Nunito fonts from `mockup.html`
- [ ] Build the app shell: icon sidebar, top bar with search, card grid, theme toggle
- [ ] Create the data-access layer interface and a fixture mode that serves the example data from `mockup.html`
- [ ] Add `.env.example` with placeholder values only
- [ ] Set up the Vercel project and the database account

**Done when:** the app runs locally on fixture data and looks like the mockup.

## Milestone 1: MVP (GitHub sign-in, graph, Focus Project)

- [ ] Add a short setup note to the README for getting a GitHub OAuth App, Turso database and Resend key
- [ ] Register a GitHub OAuth App and add the client id and secret to environment variables
- [ ] Set up Auth.js with the GitHub provider, read-only scope, and an allow-list for the owner's login
- [ ] Create the database schema: Project, Milestone snapshot, Focus log, Done checklist item, Settings
- [ ] Add a database constraint so at most one project has status `focus`
- [ ] Build the GitHub client with Octokit: repos, milestones, issues, with response caching
- [ ] Hide forks and archived repos by default, as a setting
- [ ] Build the progress service: percent complete, current milestone, implicit milestone for repos without milestones
- [ ] Write unit tests for the progress calculation
- [ ] Sync repos into Project rows on first sign-in, with default status `backlog`
- [ ] Build the milestone progress line graph with Recharts: date axis, percent axis, due-date markers, endpoint tag
- [ ] Add the repo tabs that switch the graph
- [ ] Build the focus ring card with percent complete, current milestone and last-closed date
- [ ] Build the milestone ladder
- [ ] Build the other-projects cards with mini rings and status pills
- [ ] Let the owner pick the first Focus Project
- [ ] Deploy to Vercel and check the real data against GitHub

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

- [ ] Add the definition-of-done checklist per project (README written, tests passing, deployed, URL added)
- [ ] Add the deployed URL field
- [ ] Block marking a project Deployed until every checklist item is ticked and the URL is set
- [ ] Add the Deployed and Finished states, with the finished date
- [ ] Let a project be marked Finished without a deployed URL (libraries, CLIs, scripts), still requiring the checklist, with a per-project "needs deploy" flag
- [ ] Use Resend as the email channel for the daily notification (decided in Milestone 0)
- [ ] Prompt to choose the next Focus Project after a project ships
- [ ] Write unit tests for the Deployed rule
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
