# Onboarding a repo to Focus Trail (Phase 5)

Status (2026-10-25): the pieces are built and tested against fakes, and **none of it has run against real GitHub yet**. Run every command as a dry run first, and send the output of the probe at the bottom of this file before onboarding anything for real. The design is in `PLANNING.md` under "GitHub Project as the source of truth"; the build tasks are Milestone 5 in `TASKS.md`. The app's "Onboard a repo" button is not built yet; until it is, onboarding is the command line below.

## The idea in one paragraph

After onboarding, a repo's **GitHub Project is the source of truth** for its tasks and milestones. The web app can add a task or a milestone to it. `TASKS.md` stays in the repo as a **generated copy**, so a Claude session can read the plan cold without a token. A new task line written into `TASKS.md` is imported into the Project; a tick, rename or removal made by editing the file is ignored and put back, because those belong on GitHub.

## Onboard a repo (command line, one time)

Run these in a clone of the Focus Trail repo, signed in with `gh`.

```bash
gh auth refresh -s project                                       # adds the Projects permission to gh's own token
npm run tasks:sync -- --project --repo <name>                    # dry run: shows the plan, changes nothing
npm run tasks:sync -- --project --repo <name> --limit 5 --apply  # try 5 writes first
npm run tasks:sync -- --project --repo <name> --apply            # the rest; run again if it stops
npm run tasks:sync -- pull --repo <name> --write TASKS.md        # regenerate the file (run inside that repo's clone)
```

What it does, in order:

1. Reads the repo's `TASKS.md` from GitHub (top folder, then `docs/`; add `--file path/to/TASKS.md` for anywhere else). It must be pushed first.
2. Finds the repo's GitHub Project by title and repo, and creates one (named after the repo, linked to it) only when there is none. It never creates a second.
3. Creates the milestones and issues the file lists. Issues an earlier `tasks:sync` made are found by their hidden key and reused, not duplicated. Ticked tasks become closed issues with Status Done.
4. Adds every issue to the Project and sets Status (Todo or Done). It never changes a Status that is already set.
5. Prints what it ignored in the file (ticks, renames, removals) and whether `TASKS.md` would change.

It is safe to run again and safe to stop halfway. It never deletes, never reopens, and never overwrites a human edit to an open item. GitHub limits how fast content can be created, so about 1,000 writes take 20 minutes; `--limit` caps one run.

## Who wins when the two disagree

| Situation                                                  | Result                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title, Status, milestone or order differ                   | The Project wins; `TASKS.md` is regenerated                                                                                                                                           |
| A task line exists in `TASKS.md` but not in the Project    | Imported as a new issue in the Project (additions only); if it is a reworded version of a task an earlier sync already made an issue for, that issue is adopted instead of duplicated |
| A task is ticked, renamed or removed by editing `TASKS.md` | Ignored, reverted on the next generation, reported as drift                                                                                                                           |
| A task is added or a milestone is created in the web app   | It exists on GitHub, in the Project, and appears in `TASKS.md` next sync                                                                                                              |
| A task is closed on GitHub                                 | Status Done in the Project, ticked in the next `TASKS.md`                                                                                                                             |

## Rules to paste into the repo's `CLAUDE.md`

The app can do this for you: **Check sync**, then **Add the rules to this repo**, shows this text and opens a pull request that adds it. To paste it by hand instead, copy the block below.

```markdown
## Task list and GitHub Project

- The GitHub Project for this repo is the source of truth for tasks and milestones. `TASKS.md` is a generated copy. Read it at the start of every session. A workflow refreshes it from the Project through a pull request (hourly, and whenever `TASKS.md` changes on `main`); merge that pull request when it is green.
- To add a task, use the Focus Trail app or `gh`. If you cannot reach GitHub, add a new `- [ ]` line under "Discovered during work" in `TASKS.md`; the workflow imports it into the Project.
- Anything the owner or the app added to the Project is real work. Do not remove it or reword it.
- Never tick, rename, reorder or delete a task by editing `TASKS.md`; those edits are ignored and reverted. To finish a task, close its issue or move it to Done in the Project.
- If this repo has no GitHub Project, the workflow creates one, named after the repo and linked to it. Never create a second one by hand.
- The sync only adds and closes. Never delete issues or reopen them, and never overwrite someone's edit to an open item.
- Never put tokens in the repo. The workflow reads the secret `FOCUS_TRAIL_PROJECT_TOKEN`.
```

## The workflow (one file per onboarded repo)

GitHub has no trigger for a change to a personal Project, so one workflow does both directions: it runs when `TASKS.md` changes on `main` (to import added lines), every hour, and on demand (the app's "Sync now" button starts it). It runs Focus Trail's own code, so the two repos never disagree. Save it as `.github/workflows/focus-trail-sync.yml`.

Two things need care:

- **The token.** The default `GITHUB_TOKEN` cannot reach a personal Project, so the workflow uses a **classic personal access token** stored as the repository secret `FOCUS_TRAIL_PROJECT_TOKEN`, with the scopes `repo` and `project`. It must be a personal token, not `GITHUB_TOKEN`, for a second reason: a pull request opened by `GITHUB_TOKEN` does not start the `verify` check, so branch protection would never let it merge. (Whether a fine-grained token can reach a personal Project was not confirmed; use a classic one.) Add the secret **before** adding the workflow, give the token a short expiry and put the renewal date in the repo's reminders. The token is only ever read as `GH_TOKEN`; nothing prints it.
- **Which Focus Trail code runs.** The workflow checks out the Focus Trail repo and runs it with that token, so pin it to a commit you have read (`FOCUS_TRAIL_REF`) and update the pin on purpose, as the other actions are pinned.

```yaml
name: Sync TASKS.md with the GitHub Project

on:
  push:
    branches: [main]
    paths: ["TASKS.md", "docs/TASKS.md"]
  schedule:
    - cron: "17 * * * *" # hourly
  workflow_dispatch:

permissions:
  contents: read # the personal token below does the writing

concurrency:
  group: focus-trail-sync
  cancel-in-progress: false

env:
  TASKS_FILE: TASKS.md # use docs/TASKS.md if that is where the file lives
  FOCUS_TRAIL_REF: "<commit SHA of AiraDeCastro/focus-project-tracker>"

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      GH_TOKEN: ${{ secrets.FOCUS_TRAIL_PROJECT_TOKEN }}
      HUSKY: "0"
    steps:
      - name: Check the token is set
        run: test -n "$GH_TOKEN" || { echo "Add the repository secret FOCUS_TRAIL_PROJECT_TOKEN first."; exit 1; }

      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          token: ${{ secrets.FOCUS_TRAIL_PROJECT_TOKEN }}

      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          repository: AiraDeCastro/focus-project-tracker
          ref: ${{ env.FOCUS_TRAIL_REF }}
          path: .focus-trail
          persist-credentials: false

      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: .focus-trail/package-lock.json

      - run: npm ci --prefix .focus-trail

      - name: Create the Project if needed and import lines added to the file
        run: npm run --prefix .focus-trail tasks:sync -- --project --repo "${GITHUB_REPOSITORY#*/}" --file "$TASKS_FILE" --apply

      - name: Regenerate the file from the Project
        run: npm run --prefix .focus-trail tasks:sync -- pull --repo "${GITHUB_REPOSITORY#*/}" --file "$TASKS_FILE" --write "$GITHUB_WORKSPACE/$TASKS_FILE"

      - name: Open or update a pull request when the file changed
        run: |
          if git diff --quiet -- "$TASKS_FILE"; then
            echo "TASKS.md is up to date."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git switch -C chore/tasks-md-sync
          git add -- "$TASKS_FILE"
          git commit -m "docs: refresh TASKS.md from the GitHub Project"
          git push --force origin chore/tasks-md-sync
          if [ "$(gh pr list --head chore/tasks-md-sync --state open --json number --jq length)" = "0" ]; then
            gh pr create --base main --head chore/tasks-md-sync \
              --title "docs: refresh TASKS.md from the GitHub Project" \
              --body "Generated from this repo's GitHub Project. Ticks, renames and removals made in the file are ignored; add tasks through the Project."
          fi
```

How the pieces fit:

- A merged sync pull request changes `TASKS.md` on `main`, which starts the workflow again; it then finds nothing to change and exits, so there is no loop.
- The pull request carries only `TASKS.md`; the second checkout lives in `.focus-trail` and is never added.
- Because `main` is protected, the file reaches the repo only through that pull request. The workflow never pushes to `main`.
- The app's "Sync now" button starts this workflow through `startSyncWorkflow` (`src/lib/github/dispatch.ts`); the button itself comes with the sync-state task.

## Decisions

Settled:

- One GitHub Project per repo, named after the repo (default taken 2026-10-21).
- Permissions (spike, 2026-10-23): the app asks for the `project` scope on its sign-in, and the workflows use a personal access token secret. A GitHub App cannot be given access to a personal account's Projects.
- A change in the Project reaches `TASKS.md` through a pull request opened by a scheduled workflow that "Sync now" can also start (decided 2026-10-25). It never pushes to a protected branch.

Still open:

- Whether lines added to `TASKS.md` are imported into the Project (the default, and what the rules above assume) or `TASKS.md` is strictly read-only after onboarding.
- Whether a fine-grained token can replace the classic one (not tested).

## Probe (read-only, run once on your own computer)

Confirms the spike findings against a real Project. It only reads. Never paste a token anywhere; paste only the output. It needs the GitHub command line signed in (`gh auth login`).

```bash
# 1. Add the read scope to the command line's own token (a browser page opens).
gh auth refresh -s read:project

# 2. List your Projects (number and title).
gh api graphql -f query='query { viewer { login projectsV2(first: 20) { nodes { number title closed } } } }'

# 3. Does this repo have a linked Project?
gh api graphql -f query='query($o:String!,$n:String!){ repository(owner:$o,name:$n){ projectsV2(first:10){ nodes{ number title } } } }' -f o=AiraDeCastro -f n=focus-project-tracker

# 4. Read one Project's items (replace 1 with a number from step 2).
gh api graphql -f query='query($n:Int!){ viewer { projectV2(number:$n) { title fields(first:20){ nodes{ ... on ProjectV2FieldCommon { name } } } items(first:10){ nodes{ content{ ... on Issue { number title state milestone { title } } } status: fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }' -F n=1
```

If you have no Project yet, step 2 returns an empty list, which is also a useful answer. Report: whether each step worked, any error text (not tokens), and the Status options you see.
