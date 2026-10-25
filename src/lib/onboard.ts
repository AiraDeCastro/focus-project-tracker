import type { Db } from "@/db/client";
import type { ProjectsApi } from "./github/projects";
import type { RepoWriter } from "./github/repo-writes";
import { setProjectLink } from "./project-link";
import { StatusFieldError } from "./importer";
import { syncRepo, type SyncRepoResult } from "./sync-repo";
import { DEFAULT_TASKS_PATHS } from "./tasks-md";

/**
 * Onboards a repo to the GitHub Project mirror (Phase 5): the app side of
 * `npm run tasks:sync -- --project`. Two steps, so nothing is written without a look first:
 * `previewOnboarding` reads the repo's `TASKS.md` and says what would happen (it writes nothing),
 * and `applyOnboarding` does it, a limited number of writes per call, and remembers the repo's
 * Project only once everything is in, so the dashboard never reads a half-filled Project.
 */

/** The most GitHub writes one click may make, to stay inside a request's time. */
export const WRITES_PER_CALL = 20;

export type OnboardError = "no_tasks_file" | "no_tasks_in_file" | "status_missing";

export interface OnboardDeps {
  writer: RepoWriter;
  projects: ProjectsApi;
  /** "owner/name". */
  fullName: string;
}

export interface OnboardSummary {
  /** Where the task list was found. */
  tasksFile: string;
  project: {
    action: "found" | "created" | "would_create";
    title: string;
    /** Missing Status options the importer needs; empty when the Project is fine. */
    statusMissing: string[];
  };
  /** Tasks the file has that the Project does not. */
  tasksToImport: number;
  /** Of those, how many are already ticked (they become closed issues with Status Done). */
  tasksAlreadyDone: number;
  /** Of the tasks to add, how many already exist as issues (made by an earlier sync) and are reused. */
  issuesAlreadyThere: number;
  /** New issues to create. */
  issuesToCreate: number;
  /** Milestones that do not exist on GitHub yet. */
  milestonesToCreate: number;
  /** Things in the file that are ignored (ticks, renames, removals on a Project that has tasks). */
  ignoredInFile: number;
  /** GitHub writes this would take, as an estimate for a dry run and exact once applied. */
  writes: number;
}

export type OnboardFailure = { ok: false; error: OnboardError; message: string };

export type PreviewResult = { ok: true; summary: OnboardSummary } | OnboardFailure;

export interface ApplyResult {
  ok: true;
  summary: OnboardSummary;
  /** True when every task is in the Project and the repo's Project is now remembered. */
  complete: boolean;
  /** Tasks still to import; run it again. */
  remaining: number;
  /** Writes made by this call. */
  written: number;
}

export type ApplyOutcome = ApplyResult | OnboardFailure;

const MESSAGES: Record<OnboardError, string> = {
  no_tasks_file:
    "This repo has no TASKS.md (looked in the top folder and in docs/). Push one first.",
  no_tasks_in_file: "TASKS.md has no milestone sections with tasks, so there is nothing to import.",
  status_missing:
    "The Project's Status field is missing an option (Todo or Done). Add it on GitHub, then try again.",
};

export async function loadTasksFile(
  writer: RepoWriter,
  fullName: string,
): Promise<{ path: string; markdown: string } | null> {
  for (const path of DEFAULT_TASKS_PATHS) {
    const markdown = await writer.readFile(fullName, path);
    if (markdown !== null) return { path, markdown };
  }
  return null;
}

/** What is already on GitHub, so a preview does not count work that is already done. */
interface Existing {
  milestoneTitles: Set<string>;
  /** Issue key to whether that issue is still open. */
  issues: Map<string, boolean>;
}

async function loadExisting(writer: RepoWriter, fullName: string): Promise<Existing> {
  const [milestones, issues] = await Promise.all([
    writer.listMilestones(fullName),
    writer.listIssues(fullName),
  ]);
  return {
    milestoneTitles: new Set(milestones.map((m) => m.title)),
    issues: new Map(issues.filter((i) => i.key).map((i) => [i.key as string, i.state === "open"])),
  };
}

/**
 * Writes a dry run would take. A new task is an issue, an Project item and a Status; a task whose
 * issue already exists is only the item and the Status; a ticked task also needs a close unless its
 * issue is already closed.
 */
function estimateWrites(
  result: SyncRepoResult,
  counts: { milestonesToCreate: number; issuesToCreate: number; closes: number },
): number {
  return (
    counts.milestonesToCreate +
    counts.issuesToCreate +
    counts.closes +
    result.plan.imports.length * 2 +
    (result.project.action === "would_create" ? 1 : 0)
  );
}

function summarize(
  path: string,
  result: SyncRepoResult,
  existing: Existing,
  written?: number,
): OnboardSummary {
  const { project, plan, imported } = result;
  const found = project.action === "would_create" ? null : project;
  const reused = plan.imports.filter((i) => existing.issues.has(i.key));
  const milestonesToCreate = plan.newMilestones.filter(
    (m) => !existing.milestoneTitles.has(m.title),
  ).length;
  const issuesToCreate = plan.imports.length - reused.length;
  const closes =
    plan.imports.filter((i) => i.done && !existing.issues.has(i.key)).length +
    reused.filter((i) => i.done && existing.issues.get(i.key) === true).length;
  return {
    tasksFile: path,
    project: {
      action: project.action,
      title: project.action === "would_create" ? project.title : project.project.title,
      statusMissing: found && !found.status.ok ? found.status.missing : [],
    },
    tasksToImport: plan.imports.length,
    tasksAlreadyDone: plan.imports.filter((i) => i.done).length,
    issuesAlreadyThere: reused.length,
    issuesToCreate,
    milestonesToCreate,
    ignoredInFile: plan.drift.length,
    writes:
      written ??
      imported?.writes ??
      estimateWrites(result, { milestonesToCreate, issuesToCreate, closes }),
  };
}

export async function previewOnboarding(deps: OnboardDeps): Promise<PreviewResult> {
  const file = await loadTasksFile(deps.writer, deps.fullName);
  if (!file) return { ok: false, error: "no_tasks_file", message: MESSAGES.no_tasks_file };
  let result: SyncRepoResult;
  try {
    result = await syncRepo({ ...deps, markdown: file.markdown, apply: false });
  } catch (error) {
    if (error instanceof StatusFieldError) {
      return {
        ok: false,
        error: "status_missing",
        message: `${error.message} ${MESSAGES.status_missing}`,
      };
    }
    throw error;
  }
  if (
    result.plan.imports.length === 0 &&
    result.plan.newMilestones.length === 0 &&
    result.mode === "onboard"
  ) {
    return { ok: false, error: "no_tasks_in_file", message: MESSAGES.no_tasks_in_file };
  }
  const existing = await loadExisting(deps.writer, deps.fullName);
  return { ok: true, summary: summarize(file.path, result, existing) };
}

/**
 * Does the onboarding, at most `WRITES_PER_CALL` writes at a time. When nothing is left it
 * remembers the repo's Project in the database; until then it does not, so progress keeps coming
 * from the repo's issues. Safe to call again and again.
 */
export async function applyOnboarding(
  deps: OnboardDeps & { db: Db; repoId: number; maxWrites?: number },
): Promise<ApplyOutcome> {
  const file = await loadTasksFile(deps.writer, deps.fullName);
  if (!file) return { ok: false, error: "no_tasks_file", message: MESSAGES.no_tasks_file };
  let result: SyncRepoResult;
  try {
    result = await syncRepo({
      writer: deps.writer,
      projects: deps.projects,
      fullName: deps.fullName,
      markdown: file.markdown,
      apply: true,
      maxWrites: deps.maxWrites ?? WRITES_PER_CALL,
    });
  } catch (error) {
    if (error instanceof StatusFieldError) {
      return {
        ok: false,
        error: "status_missing",
        message: `${error.message} ${MESSAGES.status_missing}`,
      };
    }
    throw error;
  }
  if (result.project.action === "would_create") {
    throw new Error("The Project was not created."); // an apply run never reports a dry-run result
  }
  const remaining = result.imported?.remaining ?? 0;
  const complete = remaining === 0;
  if (complete) {
    await setProjectLink(deps.db, deps.repoId, {
      number: result.project.project.number,
      nodeId: result.project.project.id,
    });
  }
  return {
    ok: true,
    summary: summarize(
      file.path,
      result,
      { milestoneTitles: new Set(), issues: new Map() },
      result.imported?.writes ?? 0,
    ),
    complete,
    remaining,
    written: result.imported?.writes ?? 0,
  };
}
