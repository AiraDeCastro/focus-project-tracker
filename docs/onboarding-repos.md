# Onboarding a repo to Focus Trail (planned, Phase 5)

Status: **planned, not built** (written 2026-10-21, revised the same day). The design is in `PLANNING.md` under "GitHub Project as the source of truth"; the build tasks are Milestone 5 in `TASKS.md`. Until Phase 5 ships, the manual route is `npm run tasks:sync -- --repo <name> --apply`, which turns a repo's `TASKS.md` into milestones and issues one way and does not create or fill a GitHub Project.

## The idea in one paragraph

After onboarding, a repo's **GitHub Project is the source of truth** for its tasks and milestones. The web app can add a task or a milestone to it. `TASKS.md` stays in the repo as a **generated copy**, so a Claude session can read the plan cold without a token. A new task line written into `TASKS.md` is imported into the Project; a tick, rename or removal made by editing the file is ignored and put back, because those belong on GitHub.

## What onboarding will do

1. Check the repo has a `TASKS.md` (top folder or `docs/`).
2. Find the repo's GitHub Project by title and repo. If there is none, create one named after the repo and link it to the repo. Never create a second.
3. Show a dry run: the milestones, issues and Project items that would be created, closed or added.
4. After the owner confirms, import: create milestones and issues, add each issue to the Project, set Status (Todo, In progress, Done). Ticked tasks become closed issues with Status Done.
5. Remember the Project on Focus Trail's side, so the dashboard reads it from then on, and generate the first `TASKS.md` header.

It is safe to run again. It never deletes, never reopens, and never overwrites a human edit to an open item.

## Who wins when the two disagree

| Situation                                                  | Result                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Title, Status, milestone or order differ                   | The Project wins; `TASKS.md` is regenerated                              |
| A task line exists in `TASKS.md` but not in the Project    | Imported as a new issue in the Project (additions only)                  |
| A task is ticked, renamed or removed by editing `TASKS.md` | Ignored, reverted on the next generation, reported as drift              |
| A task is added or a milestone is created in the web app   | It exists on GitHub, in the Project, and appears in `TASKS.md` next sync |
| A task is closed on GitHub                                 | Status Done in the Project, ticked in the next `TASKS.md`                |

## Rules to paste into the repo's `CLAUDE.md`

```markdown
## Task list and GitHub Project

- The GitHub Project for this repo is the source of truth for tasks and milestones. `TASKS.md` is a generated copy. Read it at the start of every session, and refresh it first when you can reach GitHub (`npm run tasks:sync -- pull`, once it exists, or `gh project item-list`).
- To add a task, use the Focus Trail app, `gh`, or the sync command. If you cannot reach GitHub, add a new `- [ ]` line under "Discovered during work" in `TASKS.md`; the sync imports it into the Project.
- Anything the owner or the app added to the Project is real work. Do not remove it or reword it.
- Never tick, rename, reorder or delete a task by editing `TASKS.md`; those edits are ignored and reverted. To finish a task, close its issue or move it to Done in the Project.
- If this repo has no GitHub Project, create one named after the repo and link it to the repo before importing. Look for an existing one first; never create two.
- The sync only adds and closes. Never delete issues or reopen them, and never overwrite someone's edit to an open item.
- Never put tokens in the repo. The workflows read the secret `FOCUS_TRAIL_PROJECT_TOKEN`.
```

## Workflow templates (drafts, to be finished in Phase 5)

The default `GITHUB_TOKEN` cannot edit a personal GitHub Project, so both workflows need a token stored as a repository secret. The `focus-trail-sync` command does not exist yet; this is the shape it will take. Whether a change to a personal Project can trigger a workflow directly is a question for the Phase 5 spike; if it cannot, the schedule below does the job and the app's "Sync now" button starts the same workflow.

**1. `TASKS.md` to the Project (additions), on every push that touches the file**

```yaml
name: Import new TASKS.md lines into the GitHub Project
on:
  push:
    branches: [main]
    paths: ["TASKS.md", "docs/TASKS.md"]
  workflow_dispatch:
jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned commit SHA>
      - run: npx focus-trail-sync import --repo "$GITHUB_REPOSITORY" --apply # planned command
        env:
          FOCUS_TRAIL_PROJECT_TOKEN: ${{ secrets.FOCUS_TRAIL_PROJECT_TOKEN }}
```

**2. Project to `TASKS.md`, on a schedule and on demand**

```yaml
name: Refresh TASKS.md from the GitHub Project
on:
  schedule:
    - cron: "17 * * * *" # hourly; the spike may replace this with an event
  workflow_dispatch:
jobs:
  export:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned commit SHA>
      - run: npx focus-trail-sync export --repo "$GITHUB_REPOSITORY" --pull-request # planned command
        env:
          FOCUS_TRAIL_PROJECT_TOKEN: ${{ secrets.FOCUS_TRAIL_PROJECT_TOKEN }}
```

The export opens a pull request instead of pushing, because `main` is protected in the repos that follow these rules. Pin actions to commit SHAs, as this repo does. The app will offer to open a pull request that adds the rules and both workflows to an onboarded repo, and only after the owner confirms that exact change.

## Decisions still open

- One GitHub Project per repo (default) or one shared board.
- Which permission the app and the workflows use: `project` on the OAuth App, a GitHub App with only the permissions needed, or writes kept in the command line and workflows with the app only reading.
- Whether lines added to `TASKS.md` are imported into the Project (default yes) or `TASKS.md` is strictly read-only after onboarding.
