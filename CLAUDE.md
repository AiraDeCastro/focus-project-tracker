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

- Auth: GitHub OAuth, read-only scope (`repo` read, or `public_repo` if only public repos). Single user, token stored server-side only. Never expose it to the client or log it.
- Endpoints: `/user/repos`, `/repos/{owner}/{repo}/milestones`, `/repos/{owner}/{repo}/issues`. Cache responses; the authenticated limit is 5,000 requests per hour.
- GitHub only returns current counts. Graph history comes from daily snapshots, plus a first-run backfill using issue `closed_at` dates.
- Hide forks and archived repos by default (open question in the PRD; keep it a setting).

## Data model

| Entity | Key fields |
| --- | --- |
| Project | repo id, name, status, deployed URL, started date, finished date |
| Milestone snapshot | repo id, milestone id, date, open count, closed count, percent complete |
| Focus log | project id, from date, to date, switch reason |
| Done checklist item | project id, label, checked |
| Settings | stall threshold in days (default 7), Away until date, notification channel |

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
- Repo access: public and private (`repo` read scope, read-only).
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
- Next up: scaffold Next.js with TypeScript strict mode (Milestone 0, third task).
