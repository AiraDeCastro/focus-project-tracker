import { renderTasksMd } from "./export-tasks-md";
import type { ProjectItem, ProjectsApi } from "./github/projects";
import type { RepoIssue, RepoMilestone, RepoWriter } from "./github/repo-writes";
import { runImport, type ImportReport } from "./importer";
import { ensureProject, type EnsureResult } from "./project-ensure";
import { parseTasksMd } from "./tasks-md";
import { keyForNewTask, reconcile, type ProjectState, type Reconciliation } from "./truth";

/**
 * One full pass of the Project mirror for a repo (Phase 5), in one place so the command line, the
 * workflows and the app cannot disagree: make sure the repo has a Project, read what the Project
 * holds, work out what differs from `TASKS.md`, import the additions, and render the `TASKS.md`
 * the repo should have next. It writes to GitHub only when `apply` is true, and it never writes
 * `TASKS.md` itself: it returns the text, and the caller decides how it reaches the repo.
 */

export interface SyncRepoDeps {
  writer: RepoWriter;
  projects: ProjectsApi;
  /** "owner/name". */
  fullName: string;
  /** The repo's current `TASKS.md`. */
  markdown: string;
  apply?: boolean;
  /** The most GitHub writes one run may make; the report says what is left. */
  maxWrites?: number;
  pause?: () => Promise<void>;
}

export interface SyncRepoResult {
  project: EnsureResult;
  /** `onboard` when the Project held nothing yet, so the file is the starting point. */
  mode: "onboard" | "sync";
  plan: Reconciliation;
  /** Null when there was nothing to import, or a dry run found no Project to import into. */
  imported: ImportReport | null;
  /** The `TASKS.md` the repo should have after this pass. */
  tasksMd: string;
  tasksMdChanged: boolean;
}

/**
 * The Project's tasks as the conflict rules read them. Only issues of this repo count (matched by
 * node id, so a Project that also holds other repos' issues is not confused). Milestones come in
 * the repo's order and only when the Project has a task in them; tasks keep the Project's order.
 */
export function buildProjectState(
  milestones: RepoMilestone[],
  issues: RepoIssue[],
  items: ProjectItem[],
): ProjectState {
  const issueByNode = new Map(issues.map((i) => [i.nodeId, i]));
  const milestoneByNumber = new Map(milestones.map((m) => [m.number, m]));
  const byMilestone = new Map<number, ProjectState["milestones"][number]["tasks"]>();
  const loose: ProjectState["loose"] = [];

  for (const item of items) {
    const issue = issueByNode.get(item.issueId);
    if (!issue) continue;
    const milestone = issue.milestone === null ? undefined : milestoneByNumber.get(issue.milestone);
    const task = {
      key: issue.key ?? keyForNewTask(milestone?.title ?? null, issue.text),
      title: issue.title,
      text: issue.text,
      done: issue.state === "closed" || item.status?.toLowerCase() === "done",
    };
    if (milestone) {
      byMilestone.set(milestone.number, [...(byMilestone.get(milestone.number) ?? []), task]);
    } else {
      loose.push(task);
    }
  }

  return {
    milestones: milestones
      .filter((m) => byMilestone.has(m.number))
      .map((m) => ({
        title: m.title,
        description: m.description,
        tasks: byMilestone.get(m.number) ?? [],
      })),
    loose,
  };
}

export async function syncRepo(deps: SyncRepoDeps): Promise<SyncRepoResult> {
  const { writer, projects, fullName, markdown } = deps;
  const apply = deps.apply === true;
  const parsed = parseTasksMd(markdown);

  const project = await ensureProject({ projects, fullName, apply });

  if (project.action === "would_create") {
    // A dry run on a repo with no Project: everything in the file would be imported.
    const plan = reconcile(parsed, { milestones: [], loose: [] }, { mode: "onboard" });
    const tasksMd = renderTasksMd(plan.generated, markdown);
    return {
      project,
      mode: "onboard",
      plan,
      imported: null,
      tasksMd,
      tasksMdChanged: tasksMd !== markdown.replace(/\r\n/g, "\n"),
    };
  }

  const [milestones, issues, listed] = await Promise.all([
    writer.listMilestones(fullName),
    writer.listIssues(fullName),
    projects.listItems(project.project.id),
  ]);
  const state = buildProjectState(milestones, issues, listed.items);
  const mode = listed.items.length === 0 ? "onboard" : "sync";
  const plan = reconcile(parsed, state, { mode });

  const imported = await runImport({
    writer,
    projects,
    fullName,
    project: project.project,
    plan,
    apply,
    maxWrites: deps.maxWrites,
    pause: deps.pause,
  });

  const tasksMd = renderTasksMd(plan.generated, markdown);
  return {
    project,
    mode,
    plan,
    imported,
    tasksMd,
    tasksMdChanged: tasksMd !== markdown.replace(/\r\n/g, "\n"),
  };
}
