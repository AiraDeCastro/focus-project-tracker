import type { Db } from "@/db/client";
import type { ProjectsApi } from "./github/projects";
import type { RepoWriter } from "./github/repo-writes";
import { checkSync, type SyncState } from "./sync-state";
import { recordSyncCheck } from "./sync-record";
import { listVisibleProjects } from "./sync";

/**
 * The daily drift check (Phase 5): for every repo that is connected to a Project, is `TASKS.md`
 * still in step with it? It is a nudge, never a failure. It reads only (a dry run), a repo that
 * cannot be read (no `TASKS.md`, a token with no access to Projects, a GitHub error) is skipped
 * rather than reported as drift, and the caller decides whether to say anything at all.
 */

export interface DriftedRepo {
  fullName: string;
  state: SyncState;
}

export interface DriftReport {
  /** Connected repos that could be compared. */
  checked: number;
  drifted: DriftedRepo[];
  /** Connected repos that could not be compared this time. */
  skipped: string[];
}

export async function runDriftCheck(deps: {
  db: Db;
  writer: RepoWriter;
  projects: ProjectsApi;
  now?: () => Date;
}): Promise<DriftReport> {
  const rows = (await listVisibleProjects(deps.db)).filter(
    (r) => r.kind === "project" && r.githubProjectId !== null,
  );
  const report: DriftReport = { checked: 0, drifted: [], skipped: [] };
  for (const row of rows) {
    try {
      const out = await checkSync({
        writer: deps.writer,
        projects: deps.projects,
        fullName: row.fullName,
      });
      if (!out.ok || out.state.kind === "no_project") {
        report.skipped.push(row.fullName);
        continue;
      }
      report.checked += 1;
      // A failed note (for example a database not yet migrated) never hides the drift itself.
      await recordSyncCheck(deps.db, row.repoId, out.state.kind, deps.now?.()).catch(() => {});
      if (out.state.kind !== "in_sync")
        report.drifted.push({ fullName: row.fullName, state: out.state });
    } catch {
      report.skipped.push(row.fullName);
    }
  }
  return report;
}

/** One calm sentence for the daily email, or null when nothing differs. */
export function driftNudge(report: DriftReport): string | null {
  if (report.drifted.length === 0) return null;
  const parts = report.drifted.map(({ fullName, state }) => {
    const name = fullName.split("/").pop() ?? fullName;
    const what: string[] = [];
    if (state.linesToImport > 0) {
      what.push(
        `${state.linesToImport} ${state.linesToImport === 1 ? "line" : "lines"} not in the Project`,
      );
    }
    if (state.fileOutOfDate) what.push("file out of date");
    return `${name} (${what.join(", ")})`;
  });
  return `TASKS.md differs from its GitHub Project in ${parts.join("; ")}. Open Check sync on the dashboard when you have a minute.`;
}
