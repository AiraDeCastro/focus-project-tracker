# Focus Project Tracker

A personal web dashboard that pulls the owner's GitHub repos, shows milestone progress per repo as a line graph, and enforces **one Focus Project at a time** until it is deployed or finished. Single user, no teams.

Full requirements: the PRD "PRD: Focus Project Tracker" (Claude Doc, https://claude.ai/code/artifact/a1a45ebb-2e16-4655-9264-31ba0e056b15). Visual reference: `mockup.html` in the repo root (open it in a browser). If code and PRD disagree, ask before choosing.

## Session workflow (every session)

1. At the start of every new conversation, read `PLANNING.md` before doing anything else.
2. Before starting work, read `TASKS.md`, find the current milestone and pick the next unchecked task in it.
3. Mark a task `[x]` in `TASKS.md` immediately when it is finished, not at the end of the session. A task is finished only when its checks pass (type check, lint, tests, browser check).
4. When you discover new work (a bug, a missing step, a dependency), add it to `TASKS.md` right away under the right milestone as an unchecked task, then carry on with the current task.
5. Do not start a later milestone until the current one is done. If a task turns out to be blocked, note why next to it in `TASKS.md`.

## Product rules (do not violate)

1. Exactly one repo has status `focus`. Others are `backlog`, `paused` or `deployed`.
2. Switching focus requires a typed reason (at least 5 characters), which is logged in the focus log. Never add a path that changes focus silently.
3. A project becomes `deployed` only when its definition-of-done checklist is fully ticked and a deployed URL is set. A project with nothing to deploy (library, CLI, script) may instead be marked `finished`, with the checklist still fully ticked.
4. GitHub is the source of truth for repos, milestones and issues. The app stores only what GitHub lacks: focus status, switch reasons, daily progress snapshots, done-checklist items and settings. Do not build task editing that duplicates GitHub Issues.
5. Percent complete = closed issues / total issues across a repo's milestones. Repos without milestones use all issues as one implicit milestone.
6. Stalled alert: no issue closed in 7 days on the focus project (configurable), paused while Away mode is on. Overdue alert: a milestone is past its due date.

## Scope

- **Phase 1 (MVP):** GitHub login, repo list, milestone progress graph per repo, set one Focus Project.
- **Phase 2:** Today list (next 1 to 3 open issues of the current milestone), stall and overdue alerts, switch-focus reason, history backfill from issue `closed_at`.
- **Phase 3:** definition-of-done checklist, Deployed status and URL, daily notification.
- **Phase 4 (optional):** ideal-pace line, streaks, weekly review, deploy-status integration.

Build in phase order. Do not start a later phase until the current one works end to end. Non-goals for v1: multi-user, permissions, time tracking, code-quality analytics.

## Suggested stack (confirm before changing)

Next.js + TypeScript, Octokit for the GitHub API, SQLite or Supabase for snapshots and logs, Recharts for graphs, Vercel with a cron job for daily snapshots. If the repo already contains a different stack, follow what exists.

## GitHub integration

- Auth: GitHub OAuth through Auth.js (`next-auth@beta`), scope `read:user repo` (or `public_repo` for public only, via `GITHUB_SCOPE`). GitHub OAuth Apps have no read-only scope for private repos, so the app promises to only read; a GitHub App would be truly read-only (open task). Single user, token stored in the encrypted session cookie and read only on the server through `getAccessToken()`. Never expose it to the client or log it.
- Endpoints: `/user/repos`, `/repos/{owner}/{repo}/milestones`, `/repos/{owner}/{repo}/issues`. Cache responses; the authenticated limit is 5,000 requests per hour.
- GitHub only returns current counts. Graph history comes from daily snapshots, plus a first-run backfill using issue `closed_at` dates.
- Hide forks and archived repos by default (open question in the PRD; keep it a setting).

## Data model

| Entity              | Key fields                                                                 |
| ------------------- | -------------------------------------------------------------------------- |
| Project             | repo id, name, status, deployed URL, started date, finished date           |
| Milestone snapshot  | repo id, milestone id, date, open count, closed count, percent complete    |
| Focus log           | project id, from date, to date, switch reason                              |
| Done checklist item | project id, label, checked                                                 |
| Settings            | stall threshold in days (default 7), Away until date, notification channel |

## UI and design

Follow `mockup.html`. Soft, rounded, card-based, sage green.

- Layout order (priority): focus banner and ring, progress graph, today list, then milestone ladder, issue counts, calendar, then other projects below. Focus Project always comes first; other projects stay quiet.
- Left icon sidebar in deep sage, pale sage canvas, off-white cards with 16 to 20 px radius and soft shadows. Smooth line and area charts with round points, faint dashed grid, emphasized endpoint tag.
- Palette (define as CSS tokens, never hard-code hex in components): deep sage `#5F7A61`, sage `#8FAE8B`, canvas `#DCE8D6`, card `#F7FAF4`, dusty teal `#6FA8A0`, soft yellow accent `#F0CF73` (primary action only), terracotta `#D98B73` (alerts only), text `#2E3B31`.
- Fonts: Outfit for headings and numbers, Nunito for body.
- Support light and dark themes through tokens. Layout must work at 400 px wide with no horizontal scroll; on mobile the order is banner, Today list, graph, then the rest.
- Use tabular numbers wherever digits line up. Every interactive element needs a visible focus state and an accessible name.
- Graph: x-axis date, y-axis percent complete, dashed vertical milestone due-date markers, optional dotted ideal-pace line (focus project only).

## Working agreements

- Match existing code style; keep changes small and focused on one phase item at a time.
- TypeScript strict mode; no `any` without a comment explaining why.
- Keep secrets in environment variables, never in the repo. Provide `.env.example` with placeholder values only.
- Write tests for the progress calculation, snapshot logic, stall and overdue detection, and focus-switch rules. These are the product's core logic.
- Prefer real GitHub data paths behind a small data-access layer so a fixture mode (like the example data in `mockup.html`) can run the UI without network access.
- Do not add dependencies for something a few lines of code can do. Ask before adding a new service or paid dependency.
- Before finishing a task: run the type check, lint and tests, and open the page to confirm the change works in the browser.

## Decisions made

- Database: Turso (SQLite) with Drizzle.
- Repo access: public and private (`repo` scope; the app only reads).
- Reminders: daily email through Resend (phase 3).
- Finished: Deployed (checklist + URL) or Finished (checklist, no URL, for libraries, CLIs and scripts).

## Owner availability

The owner is not available every day, and the app and sessions must work with that.

- Never assume a daily check-in. Do not treat a missed day as a failure in alerts, streaks or success metrics.
- The owner has no usual work days, so do not build a working-weekdays schedule. Use an "Away" snooze instead: the owner sets a return date and stalled alerts pause until then.
- Default stall threshold is 7 days with no closed issue (configurable), not 3. Overdue alerts stay tied to milestone due dates.
- Measure progress weekly, not daily: streaks are consecutive weeks with at least one closed issue, and the success metric is a weekly one.
- Daily reminders are a nudge, never a requirement; the dashboard must read well after several days away (show what changed since the last visit).
- In Claude Code sessions, leave `TASKS.md` and the session summary current at the end of every session so work can resume cold after a gap. Do not block on an answer from the owner when a sensible default exists: pick it, record it, and flag it.

## Open questions (ask the owner, do not guess)

- Are tasks already planned as GitHub Issues with Milestones, or should the app help create them?

## Session summary

**Session 1 (2026-10-08).** Planning only; no app code yet.

- Wrote the PRD as a Claude Doc (link above): goals, features, GitHub integration, data model, dashboard layout, visual design, MVP phases, risks.
- Built `mockup.html`, an interactive sage green dashboard with example data (graph tabs, Today checklist, switch-focus modal with required reason, light and dark themes). It is the visual reference.
- Wrote `CLAUDE.md` (this file), `PLANNING.md` (vision, architecture, stack, required tools) and `TASKS.md` (five milestones).
- Added the session workflow rules above.
- Completed the first task in `TASKS.md`: answered the open questions (see Decisions made) and recorded them in `PLANNING.md`. Added three discovered tasks: a README setup note (Milestone 1), a Finished-without-URL path and Resend email (Milestone 3).
- Recorded that the owner has no usual work days: stall threshold now 7 days, Away mode instead of a work schedule, weekly streaks and metrics.
- Ran `git init` (branch `main`), added `.gitignore` (blocks `.env` files, allows `.env.example`), made the first commit and created the private repo https://github.com/AiraDeCastro/focus-project-tracker with `gh`. Milestone 0 task 2 is done.
- Scaffolded Next.js (Milestone 0 task 3) with `create-next-app` in a scratch folder and copied it in, because the tool refuses folders that already hold files. Next 16.4, React 19.3, App Router, `src/` layout, TypeScript strict, ESLint, CSS modules. `npm run build`, `tsc --noEmit` and `npm run lint` pass. Not yet checked in a browser; the page is still the starter page.
- `AGENTS.md` came with the scaffold: this Next version has breaking changes, so read the guides in `node_modules/next/dist/docs/` before writing Next.js code.
- Finished most of Milestone 0 (2026-10-08): Prettier and Vitest added (needed `@types/node` 24 to resolve peer deps); scripts `typecheck` (runs `next typegen` first), `lint`, `test`, `format`, `check`. Sage design tokens in `src/app/globals.css`, Outfit and Nunito via `next/font`, light and dark themes with a no-flash theme script.
- Ported the whole mockup into React on fixture data: `src/components/DashboardView.tsx` (client, holds state), `ProgressGraph.tsx`, `Ring.tsx`, `ThemeToggle.tsx`, `Dashboard.module.css`. Logic lives in `src/lib` (`progress.ts`, `calendar.ts`) with 10 passing Vitest tests. Data comes only through `src/lib/data` (`getDataSource()`, `DATA_SOURCE=fixture` default, fixtures in `fixtures.ts`).
- Charts are hand-written SVG, not Recharts (see `PLANNING.md`). Today-task links to GitHub, real stall and overdue alerts, and persistent focus switching are not built yet (Milestone 1 and 2); the alert copy and focus switch are in-memory placeholders.
- Verified in the browser: layout matches the mockup at 1280 px, the task checkboxes update the ring and counts, the switch-focus modal needs a reason of 5+ characters and swaps the focus project, and there is no horizontal scroll at 400 px. Type check, lint, tests and build pass.
- `.claude/launch.json` starts the dev server on port 3100 (port 3000 was taken by another session).
- Milestone 0 is complete except one task that only the owner can do: create a Vercel account and a Turso account (account creation is not something Claude does). Everything else in Milestone 0 is checked. The `npm audit` review task is also still open.
- Started Milestone 1 (2026-10-08) at the owner's request while two Milestone 0 account tasks were still open; built everything that needs no accounts:
  - Database: Drizzle + libsql schema in `src/db/schema.ts` (projects, milestone snapshots, focus log, checklist items, settings), migration in `drizzle/`, `npm run db:generate` and `db:migrate`. A partial unique index allows at most one `focus` project (tested). Local dev uses `local.db`; production uses Turso. Statuses now include `finished`.
  - GitHub client: `src/lib/github/api.ts` (Octokit, in-memory 5 minute cache, tested with a fake `fetch`), `mapping.ts` (milestones in due-date order, implicit "All issues" milestone for repos without milestones).
  - `src/lib/sync.ts`: `syncProjects` (new repos start as backlog; existing status is kept), `listVisibleProjects` (hide forks and archived by default), `ensureSettings`, `getFocusProject`. Not called by the UI yet.
  - Auth: `src/auth.ts` (GitHub provider, owner-only allow-list that fails closed), `/sign-in` page, `src/lib/session.ts`. Live sign-in is untested because no OAuth App exists yet.
  - README now has setup steps for the OAuth App, Turso, Resend and Vercel. 43 unit tests pass; type check, lint and build pass.
- Found that GitHub OAuth Apps cannot be read-only for private repos; recorded as a decision for the owner in `TASKS.md`.
- Blocked on the owner: create a Vercel account, a Turso database, and the GitHub OAuth App (steps in `README.md`), then put the values in `.env.local`.
- Next up (no accounts needed): build the `github` data source, wire the focus switch to the database, and make the UI handle projects with no milestones.
