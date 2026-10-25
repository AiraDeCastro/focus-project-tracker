/**
 * The command-line side of the GitHub Project mirror (Phase 5). It runs the same `syncRepo` the
 * app and the workflows run, so the three cannot disagree. Used through `scripts/sync-tasks.ts`:
 *
 *   npm run tasks:sync -- --project --repo crm                 (dry run: what it would do)
 *   npm run tasks:sync -- --project --repo crm --apply         (creates the Project, issues, items)
 *   npm run tasks:sync -- pull --repo crm --write TASKS.md     (refresh TASKS.md from the Project)
 *
 * Needs the `gh` command line tool signed in with the Projects permission:
 *   gh auth refresh -s project
 * It uses that account's token only in request headers; it never prints it.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createProjectsApi } from "../src/lib/github/projects";
import { createRepoWriter } from "../src/lib/github/repo-writes";
import { syncRepo } from "../src/lib/sync-repo";
import { tasksPaths } from "../src/lib/tasks-md";

const PAUSE_MS = 1100; // GitHub limits how fast content can be created

export interface ProjectSyncArgs {
  repos: string[];
  apply: boolean;
  file: string | null;
  /** Where to write the regenerated TASKS.md; nothing is written when null. */
  write: string | null;
  limit: number | null;
}

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readTasksMd(slug: string, file: string | null): { path: string; markdown: string } | null {
  for (const path of tasksPaths(file)) {
    try {
      const markdown = gh([
        "api",
        `repos/${slug}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
        "-H",
        "Accept: application/vnd.github.raw",
      ]);
      return { path, markdown };
    } catch {
      // Not there; try the next place.
    }
  }
  return null;
}

export async function runProjectSync(args: ProjectSyncArgs): Promise<void> {
  const token = gh(["auth", "token"]).trim();
  const owner = gh(["api", "user", "--jq", ".login"]).trim();
  const writer = createRepoWriter(token);
  const projects = createProjectsApi(token);
  console.log(
    `${args.apply ? "APPLYING" : "DRY RUN"} the Project mirror for ${args.repos.length} repo(s) as ${owner}\n`,
  );

  for (const repo of args.repos) {
    const slug = `${owner}/${repo}`;
    console.log(`=== ${repo}`);
    const found = readTasksMd(slug, args.file);
    if (!found) {
      console.log("  No task list found. It must be pushed to GitHub. Skipped.\n");
      continue;
    }
    console.log(`  reading ${found.path}`);

    const result = await syncRepo({
      writer,
      projects,
      fullName: slug,
      markdown: found.markdown,
      apply: args.apply,
      maxWrites: args.limit ?? undefined,
      pause: async () => {
        await sleep(PAUSE_MS);
      },
    });

    const project = result.project;
    if (project.action === "would_create") {
      console.log(`  Project: none yet; would create "${project.title}"`);
    } else {
      console.log(
        `  Project: ${project.action === "created" ? "created" : "found"} #${project.project.number} "${project.project.title}"`,
      );
      if (!project.status.ok) {
        console.log(
          `  WARNING: its Status field is missing ${project.status.missing.join(" and ")}.`,
        );
      }
    }
    console.log(
      `  mode: ${result.mode}; ${result.plan.imports.length} task(s) to import, ${result.plan.newMilestones.length} new milestone(s)`,
    );
    if (result.imported) {
      const r = result.imported;
      console.log(
        `  ${r.dryRun ? "would make" : "made"} ${r.writes} write(s): ${r.milestonesCreated} milestone(s), ${r.issuesCreated} issue(s) created, ${r.issuesReused} reused, ${r.issuesClosed} closed, ${r.itemsAdded} added to the Project, ${r.statusesSet} Status set`,
      );
      if (r.remaining > 0)
        console.log(`  ${r.remaining} task(s) left: run the same command again.`);
    }
    for (const d of result.plan.drift) {
      console.log(`  ignored in TASKS.md: ${d.kind.replace(/_/g, " ")}: ${d.title}`);
    }
    console.log(`  TASKS.md ${result.tasksMdChanged ? "would change" : "is already up to date"}`);
    if (args.write && result.tasksMdChanged) {
      writeFileSync(args.write, result.tasksMd);
      console.log(`  wrote ${args.write}`);
    }
    console.log("");
  }
  if (!args.apply) console.log("Nothing was changed on GitHub. Add --apply to do it.");
}
