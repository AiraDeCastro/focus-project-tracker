import { describe, expect, it } from "vitest";
import type { ProjectsApi } from "./github/projects";
import type { RepoWriter } from "./github/repo-writes";
import type { SyncRepoResult } from "./sync-repo";
import { checkSync, describeSyncState } from "./sync-state";

function result(over: {
  imports?: number;
  changed?: boolean;
  drift?: number;
  noProject?: boolean;
}): SyncRepoResult {
  return {
    project: over.noProject
      ? { action: "would_create", title: "repo" }
      : { action: "found", project: { id: "P", number: 1, title: "repo" }, status: { ok: true } },
    mode: "sync",
    plan: {
      imports: Array.from({ length: over.imports ?? 0 }, (_, i) => ({ key: `k${i}` })),
      newMilestones: [],
      drift: Array.from({ length: over.drift ?? 0 }, () => ({})),
      generated: {},
    },
    imported: null,
    tasksMd: "",
    tasksMdChanged: over.changed ?? false,
  } as unknown as SyncRepoResult;
}

describe("describeSyncState", () => {
  it("says they agree when nothing differs", () => {
    expect(describeSyncState(result({}))).toMatchObject({
      kind: "in_sync",
      message: "TASKS.md and the Project agree.",
    });
  });

  it("names lines the Project lacks", () => {
    expect(describeSyncState(result({ imports: 1 }))).toMatchObject({
      kind: "lines_to_import",
      linesToImport: 1,
      message: "TASKS.md has 1 line the Project lacks.",
    });
    expect(describeSyncState(result({ imports: 3 })).message).toBe(
      "TASKS.md has 3 lines the Project lacks.",
    );
  });

  it("says the file is out of date when the Project would generate a different one", () => {
    expect(describeSyncState(result({ changed: true }))).toMatchObject({
      kind: "file_out_of_date",
      fileOutOfDate: true,
      message: "TASKS.md is out of date with the Project.",
    });
  });

  it("reports both, and counts ignored edits", () => {
    expect(describeSyncState(result({ imports: 2, changed: true, drift: 4 }))).toMatchObject({
      kind: "both",
      ignoredInFile: 4,
      message: "TASKS.md has 2 lines the Project lacks. TASKS.md is out of date with the Project.",
    });
  });

  it("asks to connect first when there is no Project", () => {
    expect(describeSyncState(result({ noProject: true })).kind).toBe("no_project");
  });
});

describe("checkSync", () => {
  it("fails plainly when the repo has no task list", async () => {
    const writer = { readFile: async () => null } as unknown as RepoWriter;
    const projects = {} as ProjectsApi;
    const out = await checkSync({ writer, projects, fullName: "me/repo" });
    expect(out).toMatchObject({ ok: false, error: "no_tasks_file" });
  });
});
