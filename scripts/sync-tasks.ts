/**
 * Turns a repo's TASKS.md into GitHub milestones and issues, so the dashboard can show progress.
 *
 *   npm run tasks:sync -- --repo crm --repo project-gantt-chart            (dry run, changes nothing)
 *   npm run tasks:sync -- --repo crm --apply                               (writes to GitHub)
 *   npm run tasks:sync -- --repo crm --apply --limit 3                     (create only 3 issues, to try it)
 *
 * It is safe to run again: each issue carries a hidden key made from its milestone and text, so a
 * second run only creates tasks that are new and closes issues whose task is now ticked. It never
 * deletes, never reopens, and never edits an existing issue. Repos are handled in the order given.
 * Uses the `gh` command line tool and whatever account it is signed in to.
 */
import { execFileSync } from "node:child_process";
import { parseTasksMd, type ParsedMilestone } from "../src/lib/tasks-md";

const PAUSE_MS = 1100; // GitHub limits how fast content can be created; stay well under it
const RATE_LIMIT_WAIT_MS = 65_000;
const MARKER = /<!-- tasks-md-key:([0-9a-f]+) -->/;

interface Args {
  repos: string[];
  apply: boolean;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { repos: [], apply: false, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") args.repos.push(argv[++i] ?? "");
    else if (a === "--apply") args.apply = true;
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.repos.length === 0 || args.repos.some((r) => !r)) {
    throw new Error("Give at least one --repo <name>.");
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit needs a whole number of 1 or more.");
  }
  return args;
}

function gh(args: string[], input?: string): string {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 100 * 1024 * 1024,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads every page of a GitHub list endpoint. */
function list<T>(path: string): T[] {
  const pages = JSON.parse(gh(["api", path, "--paginate", "--slurp"])) as T[][];
  return pages.flat();
}

let token = "";

/**
 * Writes to GitHub over HTTP with the signed-in `gh` account's token (read once, never printed).
 * Direct calls are several times faster than starting `gh` for every write. Pauses between
 * writes, and waits and retries when GitHub says to slow down.
 */
async function mutate<T>(method: "POST" | "PATCH", path: string, body: object): Promise<T> {
  token ||= gh(["auth", "token"]).trim();
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.github.com/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "focus-trail-sync",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      await sleep(PAUSE_MS);
      return (await res.json()) as T;
    }
    const text = await res.text();
    const limited =
      res.status === 429 || (res.status === 403 && /rate limit|secondary|abuse/i.test(text));
    if (!limited || attempt >= 5) {
      throw new Error(`${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const wait = Number(res.headers.get("retry-after")) * 1000 || RATE_LIMIT_WAIT_MS;
    console.log(`  GitHub asked us to slow down; waiting ${Math.round(wait / 1000)}s...`);
    await sleep(wait);
  }
}

interface GhMilestone {
  number: number;
  title: string;
  state: "open" | "closed";
}
interface GhIssue {
  number: number;
  state: "open" | "closed";
  body: string | null;
  pull_request?: unknown;
}

function issueBody(text: string, title: string, milestone: string, key: string): string {
  const full = text !== title ? `${text}\n\n---\n` : "";
  return `${full}From \`TASKS.md\` · ${milestone}\n<!-- tasks-md-key:${key} -->\n`.slice(0, 60_000);
}

interface Plan {
  newMilestones: ParsedMilestone[];
  closeMilestones: string[]; // existing, open, fully done in TASKS.md
  create: { milestone: string; task: ParsedMilestone["tasks"][number] }[];
  close: { number: number; text: string }[]; // existing open issues whose task is ticked
  orphans: number; // issues with a key that is no longer in TASKS.md
  alreadyThere: number;
}

function makePlan(
  milestones: ParsedMilestone[],
  existingMilestones: GhMilestone[],
  existingIssues: GhIssue[],
): Plan {
  const byTitle = new Map(existingMilestones.map((m) => [m.title, m]));
  const byKey = new Map<string, GhIssue>();
  for (const issue of existingIssues) {
    const key = MARKER.exec(issue.body ?? "")?.[1];
    if (key && !issue.pull_request) byKey.set(key, issue);
  }
  const plan: Plan = {
    newMilestones: [],
    closeMilestones: [],
    create: [],
    close: [],
    orphans: 0,
    alreadyThere: 0,
  };
  const currentKeys = new Set<string>();
  for (const m of milestones) {
    if (m.tasks.length === 0) continue;
    const existing = byTitle.get(m.title);
    if (!existing) plan.newMilestones.push(m);
    if (m.allDone && (!existing || existing.state === "open")) plan.closeMilestones.push(m.title);
    for (const task of m.tasks) {
      currentKeys.add(task.key);
      const issue = byKey.get(task.key);
      if (!issue) plan.create.push({ milestone: m.title, task });
      else {
        plan.alreadyThere++;
        if (task.done && issue.state === "open")
          plan.close.push({ number: issue.number, text: task.title });
      }
    }
  }
  plan.orphans = [...byKey.keys()].filter((k) => !currentKeys.has(k)).length;
  return plan;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const owner = gh(["api", "user", "--jq", ".login"]).trim();
  console.log(
    `${args.apply ? "APPLYING to" : "DRY RUN for"} ${args.repos.length} repo(s) as ${owner}` +
      (args.limit ? ` (at most ${args.limit} new issues)` : "") +
      "\n",
  );

  let created = 0;
  let totalWrites = 0;

  for (const repo of args.repos) {
    const slug = `${owner}/${repo}`;
    console.log(`=== ${repo}`);

    let markdown: string;
    try {
      markdown = gh([
        "api",
        `repos/${slug}/contents/TASKS.md`,
        "-H",
        "Accept: application/vnd.github.raw",
      ]);
    } catch {
      console.log("  No TASKS.md in this repo, so there is nothing to read. Skipped.\n");
      continue;
    }

    const parsed = parseTasksMd(markdown);
    const usable = parsed.milestones.filter((m) => m.tasks.length > 0);
    if (usable.length === 0) {
      console.log("  TASKS.md has no milestone sections with tasks. Skipped.\n");
      continue;
    }
    const existingMilestones = list<GhMilestone>(`repos/${slug}/milestones?state=all&per_page=100`);
    const existingIssues = list<GhIssue>(`repos/${slug}/issues?state=all&per_page=100`);
    const plan = makePlan(parsed.milestones, existingMilestones, existingIssues);

    const openNew = plan.create.filter((c) => !c.task.done).length;
    const closedNew = plan.create.length - openNew;
    console.log(
      `  milestones: ${usable.length} in TASKS.md, ${plan.newMilestones.length} to create, ${plan.closeMilestones.length} to mark complete`,
    );
    console.log(
      `  issues: ${plan.create.length} to create (${openNew} open, ${closedNew} already done and will be closed), ${plan.close.length} existing to close, ${plan.alreadyThere} already there`,
    );
    if (plan.orphans)
      console.log(
        `  note: ${plan.orphans} existing issue(s) no longer match any task (left alone)`,
      );
    for (const s of parsed.skipped)
      console.log(`  skipped section (not a milestone): "${s.heading}" with ${s.tasks} task(s)`);
    for (const m of usable) {
      const done = m.tasks.filter((t) => t.done).length;
      console.log(`    - ${m.title}: ${m.tasks.length} tasks, ${done} done`);
    }
    totalWrites += plan.newMilestones.length + plan.create.length + closedNew + plan.close.length;

    if (!args.apply) {
      console.log("");
      continue;
    }

    // 1. milestones
    const numbers = new Map(existingMilestones.map((m) => [m.title, m.number]));
    for (const m of plan.newMilestones) {
      const made = await mutate<GhMilestone>("POST", `repos/${slug}/milestones`, {
        title: m.title,
        description: m.description.slice(0, 900),
      });
      numbers.set(m.title, made.number);
      console.log(`  + milestone: ${m.title}`);
    }

    // 2. close issues whose task is already ticked
    for (const c of plan.close) {
      await mutate("PATCH", `repos/${slug}/issues/${c.number}`, {
        state: "closed",
        state_reason: "completed",
      });
    }

    // 3. new issues, in file order
    for (const { milestone, task } of plan.create) {
      if (args.limit !== null && created >= args.limit) break;
      const issue = await mutate<{ number: number }>("POST", `repos/${slug}/issues`, {
        title: task.title,
        body: issueBody(task.text, task.title, milestone, task.key),
        milestone: numbers.get(milestone),
      });
      if (task.done) {
        await mutate("PATCH", `repos/${slug}/issues/${issue.number}`, {
          state: "closed",
          state_reason: "completed",
        });
      }
      created++;
      if (created % 20 === 0) console.log(`  ...${created} issues created`);
    }

    // 4. mark finished milestones complete (only when every task was created)
    const stoppedEarly = args.limit !== null && created >= args.limit;
    if (!stoppedEarly) {
      for (const title of plan.closeMilestones) {
        const number = numbers.get(title);
        if (number)
          await mutate("PATCH", `repos/${slug}/milestones/${number}`, { state: "closed" });
      }
    }
    console.log(`  done with ${repo}: ${created} issue(s) created so far\n`);
    if (stoppedEarly) {
      console.log("Stopped at the --limit. Run again without it to finish.\n");
      break;
    }
  }

  if (!args.apply) {
    const minutes = Math.ceil((totalWrites * (PAUSE_MS + 400)) / 60_000);
    console.log(
      `Total GitHub writes planned: ${totalWrites} (about ${minutes} minutes). Nothing was changed.`,
    );
    console.log("Add --apply to do it.");
  }
}

main().catch((error) => {
  console.error("\nStopped:", error instanceof Error ? error.message : error);
  console.error("Nothing is lost: run the same command again and it carries on where it stopped.");
  process.exit(1);
});
