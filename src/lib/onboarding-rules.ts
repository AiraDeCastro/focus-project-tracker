/**
 * What an onboarded repo gets: the rules for its `CLAUDE.md` and the sync workflow. The text is the
 * same as in `docs/onboarding-repos.md`; `onboarding-rules.test.ts` fails if the two drift apart.
 */

const RULES: string[] = [
  "## Task list and GitHub Project",
  "",
  "- The GitHub Project for this repo is the source of truth for tasks and milestones. `TASKS.md` is a generated copy. Read it at the start of every session. A workflow refreshes it from the Project through a pull request (hourly, and whenever `TASKS.md` changes on `main`); merge that pull request when it is green.",
  '- To add a task, use the Focus Trail app or `gh`. If you cannot reach GitHub, add a new `- [ ]` line under "Discovered during work" in `TASKS.md`; the workflow imports it into the Project.',
  "- Anything the owner or the app added to the Project is real work. Do not remove it or reword it.",
  "- Never tick, rename, reorder or delete a task by editing `TASKS.md`; those edits are ignored and reverted. To finish a task, close its issue or move it to Done in the Project.",
  "- If this repo has no GitHub Project, the workflow creates one, named after the repo and linked to it. Never create a second one by hand.",
  "- The sync only adds and closes. Never delete issues or reopen them, and never overwrite someone's edit to an open item.",
  "- Never put tokens in the repo. The workflow reads the secret `FOCUS_TRAIL_PROJECT_TOKEN`.",
];

const WORKFLOW: string[] = [
  "name: Sync TASKS.md with the GitHub Project",
  "",
  "on:",
  "  push:",
  "    branches: [main]",
  '    paths: ["TASKS.md", "docs/TASKS.md"]',
  "  schedule:",
  '    - cron: "17 * * * *" # hourly',
  "  workflow_dispatch:",
  "",
  "permissions:",
  "  contents: read # the personal token below does the writing",
  "",
  "concurrency:",
  "  group: focus-trail-sync",
  "  cancel-in-progress: false",
  "",
  "env:",
  "  TASKS_FILE: TASKS.md # use docs/TASKS.md if that is where the file lives",
  '  FOCUS_TRAIL_REF: "<commit SHA of AiraDeCastro/focus-project-tracker>"',
  "",
  "jobs:",
  "  sync:",
  "    runs-on: ubuntu-latest",
  "    timeout-minutes: 30",
  "    env:",
  "      GH_TOKEN: ${{ secrets.FOCUS_TRAIL_PROJECT_TOKEN }}",
  '      HUSKY: "0"',
  "    steps:",
  "      - name: Check the token is set",
  '        run: test -n "$GH_TOKEN" || { echo "Add the repository secret FOCUS_TRAIL_PROJECT_TOKEN first."; exit 1; }',
  "",
  "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  "        with:",
  "          token: ${{ secrets.FOCUS_TRAIL_PROJECT_TOKEN }}",
  "",
  "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  "        with:",
  "          repository: AiraDeCastro/focus-project-tracker",
  "          ref: ${{ env.FOCUS_TRAIL_REF }}",
  "          path: .focus-trail",
  "          persist-credentials: false",
  "",
  "      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0",
  "        with:",
  "          node-version: 24",
  "          cache: npm",
  "          cache-dependency-path: .focus-trail/package-lock.json",
  "",
  "      - run: npm ci --prefix .focus-trail",
  "",
  "      - name: Create the Project if needed and import lines added to the file",
  '        run: npm run --prefix .focus-trail tasks:sync -- --project --repo "${GITHUB_REPOSITORY#*/}" --file "$TASKS_FILE" --apply',
  "",
  "      - name: Regenerate the file from the Project",
  '        run: npm run --prefix .focus-trail tasks:sync -- pull --repo "${GITHUB_REPOSITORY#*/}" --file "$TASKS_FILE" --write "$GITHUB_WORKSPACE/$TASKS_FILE"',
  "",
  "      - name: Open or update a pull request when the file changed",
  "        run: |",
  '          if git diff --quiet -- "$TASKS_FILE"; then',
  '            echo "TASKS.md is up to date."',
  "            exit 0",
  "          fi",
  '          git config user.name "github-actions[bot]"',
  '          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
  "          git switch -C chore/tasks-md-sync",
  '          git add -- "$TASKS_FILE"',
  '          git commit -m "docs: refresh TASKS.md from the GitHub Project"',
  "          git push --force origin chore/tasks-md-sync",
  '          if [ "$(gh pr list --head chore/tasks-md-sync --state open --json number --jq length)" = "0" ]; then',
  "            gh pr create --base main --head chore/tasks-md-sync \\",
  '              --title "docs: refresh TASKS.md from the GitHub Project" \\',
  '              --body "Generated from this repo\'s GitHub Project. Ticks, renames and removals made in the file are ignored; add tasks through the Project."',
  "          fi",
];

export const RULES_HEADING = "## Task list and GitHub Project";
export const WORKFLOW_PATH = ".github/workflows/focus-trail-sync.yml";
export const REF_PLACEHOLDER = "<commit SHA of AiraDeCastro/focus-project-tracker>";
const TASKS_FILE_LINE =
  "  TASKS_FILE: TASKS.md # use docs/TASKS.md if that is where the file lives";

/** The rules section, ready to append to a repo's `CLAUDE.md`. */
export function rulesSection(): string {
  return `${RULES.join("\n")}\n`;
}

/** `CLAUDE.md` with the rules added at the end; unchanged when they are already there. */
export function withRules(existing: string | null): string {
  if (existing === null) return `# Project rules\n\n${rulesSection()}`;
  if (existing.includes(RULES_HEADING)) return existing;
  const body = existing.replace(/\s+$/, "");
  return `${body}\n\n${rulesSection()}`;
}

/** The workflow file with the Focus Trail commit to run and the repo's task file filled in. */
export function workflowYaml(options: { ref: string; tasksFile: string }): string {
  if (!/^[0-9a-f]{40}$/.test(options.ref))
    throw new Error("The Focus Trail commit must be a full SHA.");
  if (!/^[\w./-]{1,100}$/.test(options.tasksFile) || options.tasksFile.includes("..")) {
    throw new Error("That is not a task file path.");
  }
  return `${WORKFLOW.map((line) => {
    if (line === TASKS_FILE_LINE) return `  TASKS_FILE: ${options.tasksFile}`;
    return line.replace(REF_PLACEHOLDER, options.ref);
  }).join("\n")}\n`;
}
