# Onboarding a repo to Focus Trail (planned, Phase 5)

Status: **planned, not built** (written 2026-10-21). The design is in `PLANNING.md` under "GitHub Project mirror"; the build tasks are Milestone 5 in `TASKS.md`. Until Phase 5 ships, the manual route is `npm run tasks:sync -- --repo <name> --apply`, which turns a repo's `TASKS.md` into milestones and issues but does not create or fill a GitHub Project.

## What onboarding will do

1. Check the repo has a `TASKS.md` (top folder or `docs/`).
2. Find the repo's GitHub Project by title and repo. If there is none, create one named after the repo and link it to the repo. Never create a second.
3. Show a dry run: milestones, issues and Project items that would be created, closed or added.
4. After the owner confirms, apply it: create milestones and issues, add each issue to the Project, set Status (Todo, In progress, Done). Ticked tasks become closed issues with Status Done.
5. Remember the Project on Focus Trail's side, so the dashboard reads it from then on.

It is safe to run again. It never deletes, never reopens, and never overwrites a human edit to an open item.

## Rules to paste into the repo's `CLAUDE.md`

```markdown
## Task list and GitHub Project

- `TASKS.md` is the plan for this repo. Use `## Milestone N: <name>` headings and `- [ ]` / `- [x]` tasks.
- Whenever you add, rename, tick or remove a task in `TASKS.md`, the GitHub Project for this repo must match. Do it in the same pull request, or rely on the "Sync TASKS.md to the GitHub Project" workflow after merge. A `TASKS.md` change that is not mirrored is a defect.
- If this repo has no GitHub Project, create one named after the repo and link it to the repo before mirroring. Look for an existing one first; never create two.
- The sync only adds and closes. Do not delete issues or reopen them, and do not overwrite someone's edit to an open item.
- Never put tokens in the repo. The workflow reads its token from the secret `FOCUS_TRAIL_PROJECT_TOKEN`.
```

## Workflow template (draft, to be finished in Phase 5)

The default `GITHUB_TOKEN` cannot edit a personal GitHub Project, so the workflow needs a token stored as a repository secret. The sync command below does not exist yet; this is the shape it will take.

```yaml
name: Sync TASKS.md to the GitHub Project
on:
  push:
    branches: [main]
    paths: ["TASKS.md", "docs/TASKS.md"]
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned commit SHA>
      - run: npx focus-trail-sync --repo "$GITHUB_REPOSITORY" --apply # planned command
        env:
          FOCUS_TRAIL_PROJECT_TOKEN: ${{ secrets.FOCUS_TRAIL_PROJECT_TOKEN }}
```

Pin actions to commit SHAs, as this repo does. The app will offer to open a pull request that adds the rules and the workflow to an onboarded repo, and only after the owner confirms that exact change.

## Decisions still open

- One GitHub Project per repo (default) or one shared board.
- Which permission the app and the workflow use: `project` on the OAuth App, a GitHub App with only the permissions needed, or writes kept in the command line and workflow with the app only reading.
