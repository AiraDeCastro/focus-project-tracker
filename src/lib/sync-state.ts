import { loadTasksFile } from "./onboard";
import type { ProjectsApi } from "./github/projects";
import type { RepoWriter } from "./github/repo-writes";
import { syncRepo, type SyncRepoResult } from "./sync-repo";

/**
 * Whether a connected repo's `TASKS.md` and its GitHub Project agree (Phase 5). It is a dry run of
 * the one sync pass, so it writes nothing and the answer is the same one the command line and the
 * workflows would act on. A difference is a nudge, never a failure.
 */

export type SyncKind = "in_sync" | "lines_to_import" | "file_out_of_date" | "both" | "no_project";

export interface SyncState {
  kind: SyncKind;
  /** Lines in the file that the Project does not have yet (the sync would add them). */
  linesToImport: number;
  /** Whether the file the Project would generate differs from the one in the repo. */
  fileOutOfDate: boolean;
  /** Edits in the file that the sync ignores (ticks, renames, removals). */
  ignoredInFile: number;
  message: string;
}

export function describeSyncState(result: SyncRepoResult): SyncState {
  const linesToImport = result.plan.imports.length;
  const fileOutOfDate = result.tasksMdChanged;
  const ignoredInFile = result.plan.drift.length;
  if (result.project.action === "would_create") {
    return {
      kind: "no_project",
      linesToImport,
      fileOutOfDate,
      ignoredInFile,
      message: "This repo has no Project yet. Connect it first.",
    };
  }
  const parts: string[] = [];
  if (linesToImport > 0) {
    parts.push(
      `TASKS.md has ${linesToImport} ${linesToImport === 1 ? "line" : "lines"} the Project lacks`,
    );
  }
  if (fileOutOfDate) parts.push("TASKS.md is out of date with the Project");
  const kind: SyncKind =
    linesToImport > 0 && fileOutOfDate
      ? "both"
      : linesToImport > 0
        ? "lines_to_import"
        : fileOutOfDate
          ? "file_out_of_date"
          : "in_sync";
  return {
    kind,
    linesToImport,
    fileOutOfDate,
    ignoredInFile,
    message: parts.length === 0 ? "TASKS.md and the Project agree." : `${parts.join(". ")}.`,
  };
}

export type SyncCheck =
  | { ok: true; path: string; state: SyncState }
  | { ok: false; error: "no_tasks_file"; message: string };

export async function checkSync(deps: {
  writer: RepoWriter;
  projects: ProjectsApi;
  fullName: string;
}): Promise<SyncCheck> {
  const file = await loadTasksFile(deps.writer, deps.fullName);
  if (!file) {
    return {
      ok: false,
      error: "no_tasks_file",
      message: "This repo has no TASKS.md (looked in the top folder and in docs/).",
    };
  }
  const result = await syncRepo({ ...deps, markdown: file.markdown, apply: false });
  return { ok: true, path: file.path, state: describeSyncState(result) };
}
